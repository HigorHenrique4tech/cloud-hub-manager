"""M365 Defender / Security incidents & alerts endpoints."""

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


@ws_router.get("/security/incidents")
async def ws_m365_security_incidents(
    limit: int = 50,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Defender Incidents")
    cache_key = f"m365:{member.workspace_id}:security_incidents"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_security_incidents, limit=min(limit, 100))
        cache_set(cache_key, result, ttl=60)  # 1 min cache
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 security incidents error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch security incidents")


@ws_router.get("/security/alerts")
async def ws_m365_security_alerts(
    limit: int = 50,
    severity: Optional[str] = None,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Defender Alerts")
    cache_key = f"m365:{member.workspace_id}:security_alerts:{severity or 'all'}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_security_alerts, limit=min(limit, 100), severity=severity)
        cache_set(cache_key, result, ttl=60)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 security alerts error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch security alerts")
