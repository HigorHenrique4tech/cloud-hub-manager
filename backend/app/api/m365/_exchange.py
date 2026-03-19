"""M365 Exchange admin endpoints."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_get, cache_set, cache_delete
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_service_or_404, _run
from ._schemas import (
    MailboxSettingsUpdate,
    CreateSharedMailboxRequest,
    AddMailboxDelegateRequest,
    CreateDistributionListRequest,
    AddMemberRequest,
)


@ws_router.get("/exchange/mailboxes")
async def ws_m365_list_mailboxes(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:mailboxes"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_mailboxes)
        cache_set(cache_key, result, ttl=180)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 mailboxes error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch mailboxes")


@ws_router.get("/exchange/users/{user_id}/mailbox-settings")
async def ws_m365_get_mailbox_settings(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_mailbox_settings, user_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 mailbox settings error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=str(exc))


@ws_router.patch("/exchange/users/{user_id}/mailbox-settings")
async def ws_m365_update_mailbox_settings(
    user_id: str,
    body: MailboxSettingsUpdate,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.update_mailbox_settings, user_id, body.model_dump(exclude_none=True))
        cache_delete(f"m365:{member.workspace_id}:mailboxes")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/exchange/activity")
async def ws_m365_email_activity(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:email_activity"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_email_activity)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 email activity error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch email activity")


@ws_router.get("/exchange/domains")
async def ws_m365_domains(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:domains"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = {"domains": await _run(svc.get_domains)}
        cache_set(cache_key, result, ttl=3600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 domains error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch domains")


@ws_router.get("/exchange/shared-mailboxes")
async def ws_m365_shared_mailboxes(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:shared_mailboxes"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_shared_mailboxes)
        cache_set(cache_key, result, ttl=180)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 shared mailboxes error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch shared mailboxes")


@ws_router.post("/exchange/shared-mailboxes")
async def ws_m365_create_shared_mailbox(
    body: CreateSharedMailboxRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(
            svc.create_shared_mailbox,
            display_name=body.display_name,
            alias=body.alias,
            domain=body.domain,
            description=body.description,
        )
        cache_delete(f"m365:{member.workspace_id}:shared_mailboxes")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/exchange/shared-mailboxes/{mailbox_id}/delegates")
async def ws_m365_mailbox_delegates(
    mailbox_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        user = await _run(svc._get, f"/users/{mailbox_id}?$select=userPrincipalName")
        upn = user.get("userPrincipalName")
        if not upn:
            raise HTTPException(status_code=404, detail="Mailbox not found")
        return await _run(svc.get_mailbox_delegates, upn)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/exchange/shared-mailboxes/{mailbox_id}/delegates")
async def ws_m365_add_mailbox_delegate(
    mailbox_id: str,
    body: AddMailboxDelegateRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        user = await _run(svc._get, f"/users/{mailbox_id}?$select=userPrincipalName")
        upn = user.get("userPrincipalName")
        return await _run(svc.add_mailbox_delegate, upn, body.delegate_upn, body.permission_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/exchange/shared-mailboxes/{mailbox_id}/delegates/{permission_type}/{delegate_upn:path}")
async def ws_m365_remove_mailbox_delegate(
    mailbox_id: str,
    permission_type: str,
    delegate_upn: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        user = await _run(svc._get, f"/users/{mailbox_id}?$select=userPrincipalName")
        upn = user.get("userPrincipalName")
        return await _run(svc.remove_mailbox_delegate, upn, delegate_upn, permission_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/exchange/distribution-lists")
async def ws_m365_distribution_lists(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:dist_lists"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_distribution_lists)
        cache_set(cache_key, result, ttl=180)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 distribution lists error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch distribution lists")


@ws_router.post("/exchange/distribution-lists")
async def ws_m365_create_distribution_list(
    body: CreateDistributionListRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        # Graph API does not support creating traditional Exchange distribution lists.
        # Create an M365 Group (mail-enabled, supports email distribution) as the equivalent.
        result = await _run(
            svc.create_group,
            display_name=body.display_name,
            mail_nickname=body.mail_nickname,
            description=body.description,
            group_type="m365",
            visibility="Private",
        )
        cache_delete(f"m365:{member.workspace_id}:dist_lists")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/exchange/distribution-lists/{group_id}/members")
async def ws_m365_dist_list_members(
    group_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_distribution_list_members, group_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 dist list members error for %s: %s", group_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch distribution list members")


@ws_router.post("/exchange/distribution-lists/{group_id}/members")
async def ws_m365_add_dist_list_member(
    group_id: str,
    body: AddMemberRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.add_distribution_list_member, group_id, body.user_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/exchange/distribution-lists/{group_id}/members/{user_id}")
async def ws_m365_remove_dist_list_member(
    group_id: str,
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.remove_distribution_list_member, group_id, user_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
