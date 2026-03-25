from fastapi import APIRouter, HTTPException, Depends, Path, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict

from app.database import get_db
from app.models.db_models import CloudAccount, Organization, Workspace
from app.core.dependencies import get_workspace_member, require_permission
from app.core.auth_context import MemberContext
from app.services.auth_service import encrypt_credential, decrypt_credential, encrypt_for_org, decrypt_for_account
from app.services.log_service import log_activity
from app.services.plan_service import check_account_limit, get_effective_plan
from app.services.notification_service import push_notification
from app.services.notification_channel_service import fire_event

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/accounts",
    tags=["Cloud Accounts"],
)


# ── Schemas ──────────────────────────────────────────────────────────────────


class AccountCreate(BaseModel):
    provider: str       # 'aws' | 'azure' | 'gcp' | 'm365'
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
    effective = get_effective_plan(org)
    allowed, current, limit = check_account_limit(db, org.id, effective)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de contas cloud atingido para o plano {effective.capitalize()} (máx {limit}). Faça upgrade para criar mais.",
        )

    if payload.provider not in ("aws", "azure", "gcp", "m365"):
        raise HTTPException(status_code=400, detail="Provider deve ser 'aws', 'azure', 'gcp' ou 'm365'")

    account = CloudAccount(
        workspace_id=member.workspace_id,
        provider=payload.provider,
        label=payload.label,
        account_id=payload.account_id,
        encrypted_data=encrypt_for_org(db, org.id, payload.data),
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
    push_notification(
        db, member.workspace_id, "cloud_account",
        f"Conta cloud {payload.provider.upper()} '{account.label}' adicionada.",
        "/settings",
    )
    fire_event(db, member.workspace_id, "resource.started", {
        "type": "cloud_account",
        "provider": payload.provider,
        "label": account.label,
        "account_id": str(account.id),
    })

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

    label = account.label
    provider = account.provider

    log_activity(
        db, member.user, "account.delete", "CloudAccount",
        resource_id=str(account.id), resource_name=label,
        provider=provider,
    )
    push_notification(
        db, member.workspace_id, "cloud_account",
        f"Conta cloud {provider.upper()} '{label}' removida.",
        "/settings",
    )
    fire_event(db, member.workspace_id, "resource.stopped", {
        "type": "cloud_account",
        "provider": provider,
        "label": label,
    })

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

    data = decrypt_for_account(db, account)

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

    if account.provider == "gcp":
        from app.services.gcp_service import GCPService
        svc = GCPService(
            project_id=data.get("project_id", ""),
            client_email=data.get("client_email", ""),
            private_key=data.get("private_key", ""),
            private_key_id=data.get("private_key_id", ""),
        )
        try:
            buckets = svc.list_buckets()
            return {"success": True, "project_id": svc.project_id, "bucket_count": len(buckets)}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Falha na conexão GCP: {exc}")

    raise HTTPException(status_code=400, detail="Provider desconhecido")


@router.get("/health-check")
async def health_check_all_accounts(
    member: MemberContext = Depends(require_permission("accounts.view")),
    db: Session = Depends(get_db),
):
    """Test connectivity for ALL cloud accounts in the workspace.

    Returns a per-account status so the user can see at a glance which
    connections are healthy.
    """
    from app.core.config import settings

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.is_active == True,
    ).all()

    if not accounts:
        return {"accounts": [], "summary": {"total": 0, "healthy": 0, "failed": 0}}

    results = []

    def _test_one(account):
        try:
            data = decrypt_for_account(db, account)
            if account.provider == "aws":
                from app.services import AWSService
                svc = AWSService(
                    access_key=data.get("access_key_id", ""),
                    secret_key=data.get("secret_access_key", ""),
                    region=data.get("region", settings.AWS_DEFAULT_REGION),
                )
                resp = svc.test_connection()
                return {"ok": resp.get("success", True), "detail": None}
            elif account.provider == "azure":
                from app.services import AzureService
                svc = AzureService(
                    subscription_id=data.get("subscription_id", ""),
                    tenant_id=data.get("tenant_id", ""),
                    client_id=data.get("client_id", ""),
                    client_secret=data.get("client_secret", ""),
                )
                resp = svc.test_connection()
                return {"ok": resp.get("success", True), "detail": None}
            elif account.provider == "gcp":
                from app.services.gcp_service import GCPService
                svc = GCPService(
                    project_id=data.get("project_id", ""),
                    client_email=data.get("client_email", ""),
                    private_key=data.get("private_key", ""),
                    private_key_id=data.get("private_key_id", ""),
                )
                svc.list_buckets()
                return {"ok": True, "detail": None}
            elif account.provider == "m365":
                return {"ok": True, "detail": None}
            else:
                return {"ok": False, "detail": "Provider desconhecido"}
        except Exception as exc:
            return {"ok": False, "detail": str(exc)[:200]}

    for acc in accounts:
        check = _test_one(acc)
        results.append({
            "id": str(acc.id),
            "provider": acc.provider,
            "label": acc.label,
            "account_id": acc.account_id,
            "status": "healthy" if check["ok"] else "failed",
            "error": check["detail"] if not check["ok"] else None,
        })

    healthy = sum(1 for r in results if r["status"] == "healthy")
    return {
        "accounts": results,
        "summary": {"total": len(results), "healthy": healthy, "failed": len(results) - healthy},
    }
