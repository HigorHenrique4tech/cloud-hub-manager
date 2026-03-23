"""M365 license assignment endpoints."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_delete
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_m365_account, _get_cached_service, _run
from ._schemas import AssignLicenseRequest


@ws_router.get("/licenses/{sku_id}/users")
async def get_license_users(
    sku_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return all users who have the given license SKU assigned."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _get_cached_service(acct, db=db)
        return {"users": await _run(svc.get_license_users, sku_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get_license_users error: %s", exc)
        raise HTTPException(status_code=502, detail="Falha ao listar usuários da licença")


@ws_router.post("/licenses/{sku_id}/assign")
async def assign_license(
    sku_id: str,
    body: AssignLicenseRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Assign a license SKU to a user."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _get_cached_service(acct, db=db)
        await _run(svc.assign_license, body.user_id, sku_id)
        cache_delete(f"m365:{member.workspace_id}:licenses")
        cache_delete(f"m365:{member.workspace_id}:users")
        return {"detail": "Licença atribuída com sucesso"}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 assign_license error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Falha ao atribuir licença: {exc}")


@ws_router.delete("/licenses/{sku_id}/assign/{user_id}")
async def remove_license(
    sku_id: str,
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Remove a license SKU from a user."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _get_cached_service(acct, db=db)
        await _run(svc.remove_license, user_id, sku_id)
        cache_delete(f"m365:{member.workspace_id}:licenses")
        cache_delete(f"m365:{member.workspace_id}:users")
        return {"detail": "Licença removida com sucesso"}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 remove_license error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Falha ao remover licença: {exc}")
