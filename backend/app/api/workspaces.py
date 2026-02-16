import re
from fastapi import APIRouter, HTTPException, Depends, Path
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.db_models import Workspace, Organization
from app.core.dependencies import (
    get_current_member, require_org_permission,
)
from app.core.auth_context import MemberContext
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
    """List all workspaces in the organization."""
    workspaces = (
        db.query(Workspace)
        .filter(
            Workspace.organization_id == member.organization_id,
            Workspace.is_active == True,
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
