import re
from fastapi import APIRouter, HTTPException, Depends, Path
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.db_models import (
    Workspace, Organization, OrganizationMember, WorkspaceMember, User,
)
from app.core.dependencies import (
    get_current_member, require_org_permission,
)
from app.core.auth_context import MemberContext
from app.core.permissions import VALID_ROLES
from app.services.log_service import log_activity
from app.services.plan_service import check_workspace_limit

router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces",
    tags=["Workspaces"],
)


# ── Schemas ──────────────────────────────────────────────────────────────────


class WorkspaceCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class WorkspaceMemberUpdate(BaseModel):
    role_override: Optional[str] = None


class AddWorkspaceMember(BaseModel):
    user_id: str
    role_override: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower().strip())
    return re.sub(r"[\s_]+", "-", slug)[:100]


def _ws_to_dict(ws: Workspace):
    return {
        "id": str(ws.id),
        "organization_id": str(ws.organization_id),
        "name": ws.name,
        "slug": ws.slug,
        "description": ws.description,
        "is_active": ws.is_active,
        "created_at": ws.created_at.isoformat() if ws.created_at else None,
    }


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("")
async def list_workspaces(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """List workspaces. Owners/admins see all; others see only their workspaces."""
    if member.role in ("owner", "admin"):
        workspaces = (
            db.query(Workspace)
            .filter(
                Workspace.organization_id == member.organization_id,
                Workspace.is_active == True,
            )
            .order_by(Workspace.name)
            .all()
        )
    else:
        # Only workspaces where user has an explicit WorkspaceMember row
        member_ws_ids = [
            wm.workspace_id
            for wm in db.query(WorkspaceMember)
            .filter(WorkspaceMember.user_id == member.user.id)
            .all()
        ]
        workspaces = (
            db.query(Workspace)
            .filter(
                Workspace.organization_id == member.organization_id,
                Workspace.is_active == True,
                Workspace.id.in_(member_ws_ids),
            )
            .order_by(Workspace.name)
            .all()
        )
    return {"workspaces": [_ws_to_dict(ws) for ws in workspaces]}


@router.post("", status_code=201)
async def create_workspace(
    payload: WorkspaceCreate,
    member: MemberContext = Depends(require_org_permission("workspace.create")),
    db: Session = Depends(get_db),
):
    """Create a new workspace (admin+ required)."""
    # Plan limit check
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    allowed, current, limit = check_workspace_limit(db, member.organization_id, org.plan_tier)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de workspaces atingido para o plano {org.plan_tier.capitalize()} (máx {limit}). Faça upgrade para criar mais.",
        )

    slug = payload.slug or _slugify(payload.name)
    if not slug:
        raise HTTPException(status_code=400, detail="Slug inválido")

    existing = db.query(Workspace).filter(
        Workspace.organization_id == member.organization_id,
        Workspace.slug == slug,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Slug já existe nesta organização")

    ws = Workspace(
        organization_id=member.organization_id,
        name=payload.name,
        slug=slug,
        description=payload.description,
    )
    db.add(ws)
    db.flush()

    # Auto-add creator as workspace member
    db.add(WorkspaceMember(
        workspace_id=ws.id,
        user_id=member.user.id,
        role_override=None,
    ))

    db.commit()
    db.refresh(ws)

    log_activity(db, member.user, "workspace.create", "Workspace",
                 resource_id=str(ws.id), resource_name=ws.name)

    return _ws_to_dict(ws)


@router.get("/{workspace_id}")
async def get_workspace(
    workspace_id: str = Path(...),
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Get workspace details."""
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.organization_id == member.organization_id,
        Workspace.is_active == True,
    ).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")
    return _ws_to_dict(ws)


@router.put("/{workspace_id}")
async def update_workspace(
    payload: WorkspaceUpdate,
    workspace_id: str = Path(...),
    member: MemberContext = Depends(require_org_permission("workspace.edit")),
    db: Session = Depends(get_db),
):
    """Update workspace (admin+ required)."""
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.organization_id == member.organization_id,
        Workspace.is_active == True,
    ).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    if payload.name is not None:
        ws.name = payload.name
    if payload.description is not None:
        ws.description = payload.description
    db.commit()
    db.refresh(ws)
    return _ws_to_dict(ws)


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(
    workspace_id: str = Path(...),
    member: MemberContext = Depends(require_org_permission("workspace.delete")),
    db: Session = Depends(get_db),
):
    """Delete workspace (admin+ required). Cascades to cloud accounts, alerts."""
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.organization_id == member.organization_id,
        Workspace.is_active == True,
    ).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    log_activity(db, member.user, "workspace.delete", "Workspace",
                 resource_id=str(ws.id), resource_name=ws.name)

    db.delete(ws)
    db.commit()
    return None


# ── Workspace Members ─────────────────────────────────────────────────────────


def _resolve_workspace(db: Session, workspace_id: str, org_id) -> Workspace:
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.organization_id == org_id,
        Workspace.is_active == True,
    ).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")
    return ws


@router.get("/{workspace_id}/members")
async def list_workspace_members(
    workspace_id: str = Path(...),
    member: MemberContext = Depends(require_org_permission("org.members.view")),
    db: Session = Depends(get_db),
):
    """List workspace members (only users with explicit WorkspaceMember rows)."""
    ws = _resolve_workspace(db, workspace_id, member.organization_id)

    ws_members = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == ws.id,
    ).all()

    result = []
    for wm in ws_members:
        user = db.query(User).filter(User.id == wm.user_id).first()
        if not user:
            continue
        org_member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == wm.user_id,
            OrganizationMember.is_active == True,
        ).first()
        org_role = org_member.role if org_member else "viewer"
        result.append({
            "user_id": str(user.id),
            "name": user.name,
            "email": user.email,
            "org_role": org_role,
            "role_override": wm.role_override,
            "effective_role": wm.role_override if wm.role_override else org_role,
        })

    return {"members": result}


@router.get("/{workspace_id}/members/available")
async def list_available_members(
    workspace_id: str = Path(...),
    member: MemberContext = Depends(require_org_permission("org.members.manage")),
    db: Session = Depends(get_db),
):
    """List org members not yet added to this workspace."""
    ws = _resolve_workspace(db, workspace_id, member.organization_id)

    already_in = {
        wm.user_id
        for wm in db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == ws.id
        ).all()
    }

    org_members = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == member.organization_id,
        OrganizationMember.is_active == True,
    ).all()

    result = []
    for om in org_members:
        if om.user_id in already_in:
            continue
        user = db.query(User).filter(User.id == om.user_id).first()
        if not user:
            continue
        result.append({
            "user_id": str(user.id),
            "name": user.name,
            "email": user.email,
            "org_role": om.role,
        })

    return {"members": result}


@router.post("/{workspace_id}/members", status_code=201)
async def add_workspace_member(
    payload: AddWorkspaceMember,
    workspace_id: str = Path(...),
    member: MemberContext = Depends(require_org_permission("org.members.manage")),
    db: Session = Depends(get_db),
):
    """Add an org member to this workspace."""
    ws = _resolve_workspace(db, workspace_id, member.organization_id)

    # Verify user is an active org member
    org_member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == member.organization_id,
        OrganizationMember.user_id == payload.user_id,
        OrganizationMember.is_active == True,
    ).first()
    if not org_member:
        raise HTTPException(status_code=404, detail="Membro não encontrado na organização")

    existing = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == ws.id,
        WorkspaceMember.user_id == payload.user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Usuário já é membro deste workspace")

    if payload.role_override and payload.role_override not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role inválida. Opções: {', '.join(VALID_ROLES)}")

    wm = WorkspaceMember(
        workspace_id=ws.id,
        user_id=payload.user_id,
        role_override=payload.role_override,
    )
    db.add(wm)
    db.commit()

    target_user = db.query(User).filter(User.id == payload.user_id).first()
    log_activity(
        db, member.user, "workspace.member.add", "WorkspaceMember",
        resource_id=str(ws.id), resource_name=target_user.email if target_user else payload.user_id,
    )

    return {
        "user_id": payload.user_id,
        "org_role": org_member.role,
        "role_override": payload.role_override,
        "effective_role": payload.role_override if payload.role_override else org_member.role,
    }


@router.put("/{workspace_id}/members/{user_id}")
async def update_workspace_member_role(
    payload: WorkspaceMemberUpdate,
    workspace_id: str = Path(...),
    user_id: str = Path(...),
    member: MemberContext = Depends(require_org_permission("org.members.manage")),
    db: Session = Depends(get_db),
):
    """Update role override for an existing workspace member."""
    ws = _resolve_workspace(db, workspace_id, member.organization_id)

    ws_member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == ws.id,
        WorkspaceMember.user_id == user_id,
    ).first()
    if not ws_member:
        raise HTTPException(status_code=404, detail="Membro não encontrado neste workspace")

    if payload.role_override is not None and payload.role_override not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role inválida. Opções: {', '.join(VALID_ROLES)}")

    ws_member.role_override = payload.role_override
    db.commit()

    org_member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == member.organization_id,
        OrganizationMember.user_id == user_id,
    ).first()
    org_role = org_member.role if org_member else "viewer"

    return {
        "user_id": user_id,
        "role_override": payload.role_override,
        "effective_role": payload.role_override if payload.role_override else org_role,
    }


@router.delete("/{workspace_id}/members/{user_id}", status_code=204)
async def remove_workspace_member(
    workspace_id: str = Path(...),
    user_id: str = Path(...),
    member: MemberContext = Depends(require_org_permission("org.members.manage")),
    db: Session = Depends(get_db),
):
    """Remove a member from this workspace (revokes access)."""
    ws = _resolve_workspace(db, workspace_id, member.organization_id)

    ws_member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == ws.id,
        WorkspaceMember.user_id == user_id,
    ).first()

    if ws_member:
        db.delete(ws_member)
        db.commit()

    return None
