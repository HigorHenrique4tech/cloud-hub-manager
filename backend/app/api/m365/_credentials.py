"""M365 credential management endpoints."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import CloudAccount
from app.services.auth_service import encrypt_credential

from . import ws_router
from ._helpers import _get_org_plan, _require_enterprise, _get_m365_account, _evict_service, _acct_to_dict
from ._schemas import M365CredentialsIn


@ws_router.get("/credentials")
async def get_credentials(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Check M365 connection status for this workspace."""
    acct = _get_m365_account(db, member.workspace_id)
    return _acct_to_dict(acct)


@ws_router.post("/credentials")
async def save_credentials(
    body: M365CredentialsIn,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Save (upsert) M365 tenant credentials for this workspace."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    encrypted = encrypt_credential(
        {
            "tenant_id": body.tenant_id,
            "client_id": body.client_id,
            "client_secret": body.client_secret,
        }
    )

    acct = _get_m365_account(db, member.workspace_id)
    if acct:
        acct.encrypted_data = encrypted
        acct.label = body.label
        acct.account_id = body.tenant_domain
    else:
        acct = CloudAccount(
            workspace_id=member.workspace_id,
            provider="m365",
            label=body.label,
            account_id=body.tenant_domain,
            encrypted_data=encrypted,
            created_by=member.user.id,
        )
        db.add(acct)

    db.commit()
    db.refresh(acct)
    _evict_service(acct)
    return _acct_to_dict(acct)


@ws_router.delete("/credentials")
async def delete_credentials(
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Remove M365 credentials for this workspace."""
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    _evict_service(acct)
    db.delete(acct)
    db.commit()
    return {"detail": "M365 credentials removed"}
