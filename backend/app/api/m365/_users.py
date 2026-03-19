"""M365 user management endpoints."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_delete
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_m365_account, _get_cached_service, _run
from ._schemas import CreateUserRequest, ToggleUserRequest, ResetPasswordRequest, CreateTapRequest


@ws_router.post("/users")
async def create_user(
    body: CreateUserRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Create a new user in the M365 tenant. Requires User.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        result = await _run(
            svc.create_user,
            display_name=body.display_name,
            upn=body.upn,
            password=body.password,
            first_name=body.first_name,
            last_name=body.last_name,
            job_title=body.job_title,
            department=body.department,
            usage_location=body.usage_location,
            mail_nickname=body.mail_nickname,
            account_enabled=body.account_enabled,
            force_change_password=body.force_change_password,
        )
        cache_delete(f"m365:{member.workspace_id}:users")
        return {"detail": "Usuário criado com sucesso", "user": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 create user error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Falha ao criar usuário: {exc}")


@ws_router.patch("/users/{user_id}/toggle")
async def toggle_user_account(
    user_id: str,
    body: ToggleUserRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Enable or disable a user account. Requires User.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _get_cached_service(acct)
        return await _run(svc.toggle_user_account, user_id, body.enabled)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 toggle user error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao atualizar conta: {exc}")


@ws_router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    body: ResetPasswordRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Reset a user's password. Requires User.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _get_cached_service(acct)
        return await _run(svc.reset_user_password, user_id, body.new_password, body.force_change)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 reset password error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao resetar senha: {exc}")


@ws_router.post("/users/{user_id}/tap")
async def create_tap(
    user_id: str,
    body: CreateTapRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Create a Temporary Access Pass for a user. Requires UserAuthenticationMethod.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _get_cached_service(acct)
        return await _run(svc.create_tap, user_id, body.lifetime_minutes, body.is_usable_once)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 create TAP error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao criar acesso temporário: {exc}")


@ws_router.post("/users/{user_id}/revoke-sessions")
async def revoke_user_sessions(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Revoke all active sign-in sessions for a user. Requires User.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        result = await _run(svc.revoke_user_sessions, user_id)
        return {"detail": "Sessões revogadas com sucesso", "result": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 revoke sessions error for user %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao revogar sessões: {exc}")


@ws_router.get("/users/{user_id}/auth-methods")
async def get_user_auth_methods(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return registered authentication methods for a single user (MFA details)."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        return {"methods": await _run(svc.get_user_auth_methods, user_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 auth methods error for user %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch authentication methods")


@ws_router.delete("/users/{user_id}/auth-methods/{method_type}/{method_id}")
async def delete_user_auth_method(
    user_id: str,
    method_type: str,
    method_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Delete a specific authentication method for a user. Requires UserAuthenticationMethod.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        await _run(svc.delete_user_auth_method, user_id, method_type, method_id)
        return {"detail": "Método de autenticação removido com sucesso"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 delete auth method error for user %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao remover método: {exc}")


@ws_router.get("/users/{user_id}/groups")
async def get_user_groups(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return the groups a user belongs to. Requires Directory.Read.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _get_cached_service(acct)
        return {"groups": await _run(svc.get_user_groups, user_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get user groups error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail="Falha ao carregar grupos do usuário")
