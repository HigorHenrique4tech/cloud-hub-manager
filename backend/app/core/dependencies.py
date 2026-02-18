from fastapi import Depends, HTTPException, Path, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.db_models import (
    User, Organization, OrganizationMember, Workspace, WorkspaceMember,
)
from app.services.auth_service import decode_token
from app.core.auth_context import MemberContext
from app.core.permissions import ROLE_PERMISSIONS

bearer_scheme = HTTPBearer()


# ── Existing (kept for backward compat on old routes) ───────────────────────


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    user_id = decode_token(token)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


# ── Multi-tenant RBAC dependencies ─────────────────────────────────────────


def get_current_member(
    org_slug: str = Path(..., description="Organization slug"),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> MemberContext:
    """Authenticate user + resolve org membership + role."""
    # 1. Authenticate
    token = credentials.credentials
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    # 1b. Require email verification for org operations (disabled for now)
    # if not user.is_verified:
    #     raise HTTPException(status_code=403, detail="Email não verificado")

    # 2. Resolve org
    org = db.query(Organization).filter(
        Organization.slug == org_slug,
        Organization.is_active == True,
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    # 3. Check membership
    membership = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org.id,
        OrganizationMember.user_id == user.id,
        OrganizationMember.is_active == True,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Você não é membro desta organização")

    return MemberContext(
        user=user,
        organization_id=org.id,
        workspace_id=None,
        role=membership.role,
    )


def get_workspace_member(
    workspace_id: str = Path(..., description="Workspace UUID"),
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
) -> MemberContext:
    """Extend get_current_member with workspace resolution + optional role override."""
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.organization_id == member.organization_id,
        Workspace.is_active == True,
    ).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    # Check for workspace-level role override
    ws_member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == ws.id,
        WorkspaceMember.user_id == member.user.id,
    ).first()

    effective_role = (
        ws_member.role_override
        if (ws_member and ws_member.role_override)
        else member.role
    )

    return MemberContext(
        user=member.user,
        organization_id=member.organization_id,
        workspace_id=ws.id,
        role=effective_role,
    )


def require_permission(*permissions: str):
    """
    FastAPI dependency factory that checks permissions.

    Usage:
        @router.get("/resources")
        def list_resources(
            member: MemberContext = Depends(require_permission("resources.view")),
        ):
    """
    def _dependency(member: MemberContext = Depends(get_workspace_member)):
        role_perms = ROLE_PERMISSIONS.get(member.role, set())
        for perm in permissions:
            if perm not in role_perms:
                raise HTTPException(
                    status_code=403,
                    detail=f"Permissão insuficiente: requer '{perm}'",
                )
        return member
    return _dependency


def require_org_permission(*permissions: str):
    """Like require_permission but at org level (no workspace needed)."""
    def _dependency(member: MemberContext = Depends(get_current_member)):
        role_perms = ROLE_PERMISSIONS.get(member.role, set())
        for perm in permissions:
            if perm not in role_perms:
                raise HTTPException(
                    status_code=403,
                    detail=f"Permissão insuficiente: requer '{perm}'",
                )
        return member
    return _dependency
