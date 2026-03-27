"""M365 guest user endpoints."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_get, cache_set, cache_delete
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_service_or_404, _run
from ._schemas import InviteGuestRequest


@ws_router.get("/guests")
async def ws_m365_list_guests(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Guest Users")
    cache_key = f"m365:{member.workspace_id}:guests"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_guests)
        cache_set(cache_key, result, ttl=300)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 guests error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch guest users")


@ws_router.post("/guests/invite")
async def ws_m365_invite_guest(
    body: InviteGuestRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Guest Users")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.invite_guest, body.email, body.display_name, body.redirect_url, body.message)
        # Send invitation email via our own SMTP (Microsoft's built-in emails
        # are frequently blocked by spam filters).
        redeem_url = result.get("invite_redeem_url")
        if redeem_url:
            try:
                from app.services.email_service import send_guest_invite_email
                from app.services.branding_service import get_branding_for_workspace
                branding = get_branding_for_workspace(db, member.workspace_id)
                inviter_name = member.user.name or member.user.email
                send_guest_invite_email(
                    to_email=body.email,
                    guest_name=body.display_name,
                    redeem_url=redeem_url,
                    inviter_name=inviter_name,
                    custom_message=body.message,
                    branding=branding,
                )
            except Exception as exc:
                logger.warning("Could not send guest invite email: %s", exc)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/guests/{user_id}")
async def ws_m365_delete_guest(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Guest Users")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.delete_guest, user_id)
        cache_delete(f"m365:{member.workspace_id}:users")
        cache_delete(f"m365:{member.workspace_id}:guests")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
