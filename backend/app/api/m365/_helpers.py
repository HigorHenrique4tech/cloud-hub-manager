"""Shared helpers for the M365 API sub-modules."""

import asyncio
import logging
import threading
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.models.db_models import CloudAccount, Organization
from app.services.auth_service import decrypt_credential, decrypt_for_account
from app.services.m365_service import M365AuthError, M365Service

logger = logging.getLogger(__name__)

# ── M365Service instance cache ────────────────────────────────────────────────
# Reuses msal.ConfidentialClientApplication across requests so the MSAL
# internal token cache persists (avoids a round-trip to Azure AD per request).
_svc_cache: dict = {}
_svc_lock = threading.Lock()


def _get_cached_service(acct, db: Session = None) -> "M365Service":
    """Return a cached M365Service for this cloud account, building it if necessary."""
    key = acct.id
    with _svc_lock:
        if key not in _svc_cache:
            _svc_cache[key] = _build_service(db, acct)
        return _svc_cache[key]


def _evict_service(acct) -> None:
    """Remove a cached M365Service (call when credentials change)."""
    with _svc_lock:
        _svc_cache.pop(acct.id, None)


async def _run(fn, *args, **kwargs):
    """Run a synchronous function in a thread pool, freeing the asyncio event loop."""
    return await asyncio.to_thread(fn, *args, **kwargs)


def _get_org_plan(db: Session, organization_id) -> str:
    from app.services.plan_service import get_effective_plan
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        return "free"
    return get_effective_plan(org)


def _require_enterprise(plan: str, feature: str = "Microsoft 365"):
    if plan != "enterprise":
        raise HTTPException(
            status_code=403,
            detail=f"Recurso '{feature}' requer plano Enterprise.",
        )


def _get_m365_account(db: Session, workspace_id) -> Optional[CloudAccount]:
    return (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == workspace_id,
            CloudAccount.provider == "m365",
            CloudAccount.is_active == True,
        )
        .first()
    )


def _build_service(db: Session, acct: CloudAccount) -> M365Service:
    creds = decrypt_for_account(db, acct)
    return M365Service(
        tenant_id=creds["tenant_id"],
        client_id=creds["client_id"],
        client_secret=creds["client_secret"],
    )


def _get_service_or_404(db: Session, workspace_id) -> M365Service:
    acct = _get_m365_account(db, workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="Conta M365 não encontrada. Configure as credenciais primeiro.")
    return _get_cached_service(acct, db=db)


def _require_master_org(member: MemberContext, db: Session) -> None:
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org or org.org_type != "master":
        raise HTTPException(status_code=403, detail="Funcionalidade exclusiva para organizações MSP Master")


def _acct_to_dict(acct: Optional[CloudAccount]) -> dict:
    if not acct:
        return {"connected": False, "tenant_domain": None, "label": None, "account_id": None}
    return {
        "connected": True,
        "tenant_domain": acct.account_id,   # account_id stores the domain
        "label": acct.label,
        "account_id": str(acct.id),
    }
