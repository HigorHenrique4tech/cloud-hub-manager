"""M365 user offboarding endpoint."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_delete
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_service_or_404, _run
from ._schemas import OffboardRequest


@ws_router.post("/users/{user_id}/offboard")
async def ws_m365_offboard_user(
    user_id: str,
    body: OffboardRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Offboarding")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.offboard_user, user_id, body.dict())
        cache_delete(f"m365:{member.workspace_id}:users")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 offboard user error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao fazer offboard do usuário: {exc}")
