"""M365 audit log endpoints."""

from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_get, cache_set
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_service_or_404, _run


@ws_router.get("/audit/sign-ins")
async def ws_m365_sign_ins(
    limit: int = 50,
    upn: Optional[str] = None,
    status: Optional[str] = None,
    days: Optional[int] = None,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Audit Logs")
    cache_key = f"m365:{member.workspace_id}:audit_signins:{limit}:{upn}:{status}:{days}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_sign_ins, limit=min(limit, 200), upn=upn, status=status, days=days)
        cache_set(cache_key, result, ttl=120)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 sign-ins error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch sign-in logs")


@ws_router.get("/audit/directory")
async def ws_m365_directory_audits(
    limit: int = 50,
    category: Optional[str] = None,
    days: Optional[int] = None,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Audit Logs")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_directory_audits, limit=min(limit, 200), category=category, days=days)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 directory audits error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch directory audit logs")
