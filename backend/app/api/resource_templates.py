"""
Resource Templates API — save and load resource creation form configurations.
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import ResourceTemplate
from app.services.log_service import log_activity

logger = logging.getLogger(__name__)

# ── Schemas ───────────────────────────────────────────────────────────────────


class TemplateCreate(BaseModel):
    provider: str           # aws | azure
    resource_type: str      # ec2 | s3 | rds | lambda | vpc | vm | storage | vnet | sql | app_service
    name: str
    description: Optional[str] = None
    form_config: dict


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    form_config: Optional[dict] = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _to_dict(t: ResourceTemplate) -> dict:
    return {
        "id": str(t.id),
        "workspace_id": str(t.workspace_id),
        "created_by": str(t.created_by) if t.created_by else None,
        "provider": t.provider,
        "resource_type": t.resource_type,
        "name": t.name,
        "description": t.description,
        "form_config": t.form_config,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


# ── Router ────────────────────────────────────────────────────────────────────

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/templates",
    tags=["Resource Templates"],
)


@ws_router.get("")
async def list_templates(
    provider: Optional[str] = Query(None, description="aws|azure"),
    resource_type: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("templates.view")),
    db: Session = Depends(get_db),
):
    """List resource templates for this workspace."""
    q = db.query(ResourceTemplate).filter(
        ResourceTemplate.workspace_id == member.workspace_id
    )
    if provider:
        q = q.filter(ResourceTemplate.provider == provider)
    if resource_type:
        q = q.filter(ResourceTemplate.resource_type == resource_type)

    templates = q.order_by(ResourceTemplate.name.asc()).all()
    return [_to_dict(t) for t in templates]


@ws_router.post("", status_code=201)
async def create_template(
    payload: TemplateCreate,
    member: MemberContext = Depends(require_permission("templates.manage")),
    db: Session = Depends(get_db),
):
    """Save a new resource template."""
    template = ResourceTemplate(
        workspace_id=member.workspace_id,
        created_by=member.user.id,
        provider=payload.provider,
        resource_type=payload.resource_type,
        name=payload.name,
        description=payload.description,
        form_config=payload.form_config,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    log_activity(
        db=db, user=member.user,
        action="template.create",
        resource_type=payload.resource_type,
        resource_id=str(template.id),
        resource_name=template.name,
        provider=payload.provider,
        status="success",
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    return _to_dict(template)


@ws_router.patch("/{template_id}", status_code=200)
async def update_template(
    template_id: UUID,
    payload: TemplateUpdate,
    member: MemberContext = Depends(require_permission("templates.manage")),
    db: Session = Depends(get_db),
):
    """Rename or update the form config of a template."""
    template = db.query(ResourceTemplate).filter(
        ResourceTemplate.id == template_id,
        ResourceTemplate.workspace_id == member.workspace_id,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    if payload.name is not None:
        template.name = payload.name
    if payload.description is not None:
        template.description = payload.description
    if payload.form_config is not None:
        template.form_config = payload.form_config

    db.commit()
    db.refresh(template)
    return _to_dict(template)


@ws_router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    member: MemberContext = Depends(require_permission("templates.manage")),
    db: Session = Depends(get_db),
):
    """Delete a resource template."""
    template = db.query(ResourceTemplate).filter(
        ResourceTemplate.id == template_id,
        ResourceTemplate.workspace_id == member.workspace_id,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    log_activity(
        db=db, user=member.user,
        action="template.delete",
        resource_type=template.resource_type,
        resource_id=str(template.id),
        resource_name=template.name,
        provider=template.provider,
        status="success",
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    db.delete(template)
    db.commit()
