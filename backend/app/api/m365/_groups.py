"""M365 group management endpoints."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_delete
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_m365_account, _get_cached_service, _run
from ._schemas import CreateGroupRequest, AddMemberRequest


@ws_router.post("/groups")
async def create_group(
    body: CreateGroupRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Create a new M365 Group or Security Group. Requires Group.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        result = await _run(
            svc.create_group,
            display_name=body.display_name,
            mail_nickname=body.mail_nickname,
            description=body.description,
            group_type=body.group_type,
            visibility=body.visibility,
        )
        cache_delete(f"m365:{member.workspace_id}:groups")
        return {"detail": "Grupo criado com sucesso", "group": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 create group error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Falha ao criar grupo: {exc}")


@ws_router.get("/groups/{group_id}/members")
async def get_group_members(
    group_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return the member list for a specific Group (M365/Security/Distribution)."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        return {"members": await _run(svc.get_team_members, group_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 group members error for %s: %s", group_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch group members")


@ws_router.post("/groups/{group_id}/members")
async def add_group_member(
    group_id: str,
    body: AddMemberRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Add a user to a Group. Requires Group.ReadWrite.All in the Azure AD App."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        result = await _run(svc.add_team_member, group_id, body.user_id, body.roles)
        cache_delete(f"m365:{member.workspace_id}:groups")
        return {"detail": "Membro adicionado com sucesso", "member": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        err_str = str(exc)
        logger.error("M365 add group member error for group %s: %s", group_id, exc)
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


@ws_router.delete("/groups/{group_id}/members/{user_id}")
async def remove_group_member(
    group_id: str,
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Remove a user from a Group."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        result = await _run(svc.remove_team_member, group_id, user_id)
        cache_delete(f"m365:{member.workspace_id}:groups")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 remove group member error for group %s: %s", group_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao remover membro: {exc}")
