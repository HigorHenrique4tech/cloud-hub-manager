"""M365 Teams admin endpoints."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_get, cache_set, cache_delete
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_m365_account, _get_cached_service, _get_service_or_404, _run
from ._schemas import AddMemberRequest, CreateTeamRequest, UpdateTeamRequest, CreateChannelRequest, UpdateRoleRequest


@ws_router.get("/teams/{team_id}/members")
async def get_team_members(
    team_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return the member list for a specific Team."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        return {"members": await _run(svc.get_team_members, team_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 team members error for %s: %s", team_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch team members")


@ws_router.post("/teams/{team_id}/members")
async def add_team_member(
    team_id: str,
    body: AddMemberRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Add a user to a Team. Requires TeamMember.ReadWrite.All in the Azure AD App."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        result = await _run(svc.add_team_member, team_id, body.user_id, body.roles)
        return {"detail": "Membro adicionado com sucesso", "member": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        err_str = str(exc)
        logger.error("M365 add team member error for team %s: %s", team_id, exc)
        # Groups synced from on-premises AD are read-only in the cloud
        if "403" in err_str or "Forbidden" in err_str:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Não foi possível adicionar o membro. Este grupo pode ser sincronizado "
                    "a partir do Active Directory local (on-premises) e só pode ser gerenciado "
                    "diretamente no AD — não via Microsoft Graph."
                ),
            )
        raise HTTPException(status_code=502, detail=f"Falha ao adicionar membro: {exc}")


@ws_router.post("/teams")
async def ws_m365_create_team(
    body: CreateTeamRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.create_team, body.display_name, body.description, body.visibility)
        cache_delete(f"m365:{member.workspace_id}:teams")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.patch("/teams/{team_id}")
async def ws_m365_update_team(
    team_id: str,
    body: UpdateTeamRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.update_team, team_id, body.model_dump(exclude_none=True))
        cache_delete(f"m365:{member.workspace_id}:teams")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/teams/{team_id}/archive")
async def ws_m365_archive_team(
    team_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        await _run(svc.archive_team, team_id)
        cache_delete(f"m365:{member.workspace_id}:teams")
        return {"archived": True, "team_id": team_id}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/teams/{team_id}/channels")
async def ws_m365_list_channels(
    team_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_channels, team_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 list channels error for %s: %s", team_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch channels")


@ws_router.post("/teams/{team_id}/channels")
async def ws_m365_create_channel(
    team_id: str,
    body: CreateChannelRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.create_channel, team_id, body.display_name, body.description, body.channel_type)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/teams/{team_id}/channels/{channel_id}")
async def ws_m365_delete_channel(
    team_id: str,
    channel_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.delete_channel, team_id, channel_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.patch("/teams/{team_id}/members/{member_id}")
async def ws_m365_update_member_role(
    team_id: str,
    member_id: str,
    body: UpdateRoleRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.update_member_role, team_id, member_id, body.roles)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/teams/{team_id}/members/{member_id}")
async def ws_m365_remove_team_member(
    team_id: str,
    member_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.remove_team_member, team_id, member_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/teams/activity")
async def ws_m365_teams_activity(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    cache_key = f"m365:{member.workspace_id}:teams_activity"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_teams_activity)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 teams activity error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch teams activity")
