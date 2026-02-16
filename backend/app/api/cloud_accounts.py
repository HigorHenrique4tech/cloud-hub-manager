from fastapi import APIRouter, HTTPException, Depends, Path, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict

from app.database import get_db
from app.models.db_models import CloudAccount, Organization, Workspace
from app.core.dependencies import get_workspace_member, require_permission
from app.core.auth_context import MemberContext
from app.services.auth_service import encrypt_credential, decrypt_credential
from app.services.log_service import log_activity
from app.services.plan_service import check_account_limit

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/accounts",
    tags=["Cloud Accounts"],
)


# ── Schemas ──────────────────────────────────────────────────────────────────


class AccountCreate(BaseModel):
    provider: str       # 'aws' | 'azure'
    label: str = "default"
    account_id: Optional[str] = None  # AWS account ID or Azure subscription ID (display)
    data: Dict          # credential fields to encrypt


class AccountResponse(BaseModel):
    id: str
    workspace_id: str
    provider: str
    label: str
    account_id: Optional[str]
    is_active: bool
    created_at: Optional[str]

    class Config:
        from_attributes = True


# ── Helpers ──────────────────────────────────────────────────────────────────


def _account_to_dict(account: CloudAccount):
    return {
        "id": str(account.id),
        "workspace_id": str(account.workspace_id),
        "provider": account.provider,
        "label": account.label,
        "account_id": account.account_id,
        "is_active": account.is_active,
        "created_at": account.created_at.isoformat() if account.created_at else None,
    }


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("")
async def list_accounts(
    provider: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("accounts.view")),
    db: Session = Depends(get_db),
):
    """List cloud accounts in this workspace."""
    q = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.is_active == True,
    )
    if provider:
        q = q.filter(CloudAccount.provider == provider)
    accounts = q.order_by(CloudAccount.created_at.desc()).all()
    return {"accounts": [_account_to_dict(a) for a in accounts]}


@router.post("", status_code=201)
async def create_account(
    payload: AccountCreate,
    member: MemberContext = Depends(require_permission("accounts.create")),
    db: Session = Depends(get_db),
):
    """Add a cloud account (admin+ required)."""
    # Plan limit check
    ws = db.query(Workspace).filter(Workspace.id == member.workspace_id).first()
    org = db.query(Organization).filter(Organization.id == ws.organization_id).first()
    allowed, current, limit = check_account_limit(db, org.id, org.plan_tier)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de contas cloud atingido para o plano {org.plan_tier.capitalize()} (máx {limit}). Faça upgrade para criar mais.",
        )

    if payload.provider not in ("aws", "azure"):
        raise HTTPException(status_code=400, detail="Provider deve ser 'aws' ou 'azure'")

    account = CloudAccount(
        workspace_id=member.workspace_id,
        provider=payload.provider,
        label=payload.label,
        account_id=payload.account_id,
        encrypted_data=encrypt_credential(payload.data),
        created_by=member.user.id,
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    log_activity(
        db, member.user, "account.create", "CloudAccount",
        resource_id=str(account.id), resource_name=account.label,
        provider=payload.provider,
    )

    return _account_to_dict(account)


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    account_id: str = Path(...),
    member: MemberContext = Depends(require_permission("accounts.delete")),
    db: Session = Depends(get_db),
):
    """Remove a cloud account (admin+ required)."""
    account = db.query(CloudAccount).filter(
        CloudAccount.id == account_id,
        CloudAccount.workspace_id == member.workspace_id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    log_activity(
        db, member.user, "account.delete", "CloudAccount",
        resource_id=str(account.id), resource_name=account.label,
        provider=account.provider,
    )

    db.delete(account)
    db.commit()
    return None


@router.post("/{account_id}/test")
async def test_account_connection(
    account_id: str = Path(...),
    member: MemberContext = Depends(require_permission("accounts.view")),
    db: Session = Depends(get_db),
):
    """Test connectivity for a cloud account."""
    account = db.query(CloudAccount).filter(
        CloudAccount.id == account_id,
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.is_active == True,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    data = decrypt_credential(account.encrypted_data)

    if account.provider == "aws":
        from app.services import AWSService
        from app.core.config import settings
        svc = AWSService(
            access_key=data.get("access_key_id", ""),
            secret_key=data.get("secret_access_key", ""),
            region=data.get("region", settings.AWS_DEFAULT_REGION),
        )
        return await svc.test_connection()

    if account.provider == "azure":
        from app.services import AzureService
        svc = AzureService(
            subscription_id=data.get("subscription_id", ""),
            tenant_id=data.get("tenant_id", ""),
            client_id=data.get("client_id", ""),
            client_secret=data.get("client_secret", ""),
        )
        return await svc.test_connection()

    raise HTTPException(status_code=400, detail="Provider desconhecido")
