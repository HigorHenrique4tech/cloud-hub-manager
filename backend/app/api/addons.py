"""
Add-ons API — gerenciar workspaces e usuários adicionais por plano.

Endpoints (org):
  GET    /orgs/{org_slug}/addons                    — listar add-ons ativos
  POST   /orgs/{org_slug}/addons/workspace          — solicitar workspace(s) — cria pendente
  POST   /orgs/{org_slug}/addons/user               — solicitar usuário(s) — cria pendente
  DELETE /orgs/{org_slug}/addons/{addon_id}         — cancelar add-on

Endpoints (admin):
  GET    /admin/addon-requests                      — listar solicitações
  PUT    /admin/addon-requests/{id}                 — aprovar ou recusar
"""
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.db_models import Organization, OrganizationAddOn, User
from app.core.dependencies import get_current_member, require_org_permission, get_current_admin
from app.core.auth_context import MemberContext
from app.services.plan_service import get_plan_limits, PLAN_PRICES
from app.services.log_service import log_activity
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/orgs/{org_slug}/addons",
    tags=["Add-ons"],
)

admin_router = APIRouter(
    prefix="/admin/addon-requests",
    tags=["Admin - Add-ons"],
)


class AddOnRequest(BaseModel):
    quantity: int
    notes: Optional[str] = None


class ReviewAddOnRequest(BaseModel):
    action: str          # "approve" | "reject"
    admin_notes: Optional[str] = None


def _addon_to_dict(a: OrganizationAddOn, org_name: str = None, requested_by: str = None) -> dict:
    return {
        "id": str(a.id),
        "addon_type": a.addon_type,
        "quantity": a.quantity,
        "monthly_price_cents": a.monthly_price_cents,
        "status": a.status,
        "is_active": a.is_active,
        "notes": a.notes,
        "admin_notes": a.admin_notes,
        "reviewed_by": a.reviewed_by,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "org_name": org_name,
        "requested_by": requested_by,
    }


# ── Org Endpoints ──────────────────────────────────────────────────────────────

@router.get("")
def list_addons(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """List all approved add-ons and pending requests for this org."""
    addons = db.query(OrganizationAddOn).filter(
        OrganizationAddOn.organization_id == member.organization_id,
        OrganizationAddOn.status.in_(["approved", "pending"]),
    ).all()
    return {
        "addons": [_addon_to_dict(a) for a in addons]
    }


def _create_addon_request(db, organization_id, user_id, addon_type: str, quantity: int, notes: str | None):
    """Create a new pending add-on request (always new row — admin reviews individually)."""
    price_key = "addon_workspace" if addon_type == "workspace" else "addon_user"
    price = PLAN_PRICES.get(price_key, 6000 if addon_type == "workspace" else 15900)

    addon = OrganizationAddOn(
        organization_id=organization_id,
        addon_type=addon_type,
        quantity=quantity,
        monthly_price_cents=price,
        is_active=False,
        status="pending",
        notes=notes,
        created_by=user_id,
    )
    db.add(addon)
    db.commit()
    db.refresh(addon)
    return addon


@router.post("/workspace")
@limiter.limit("10/minute")
def add_workspace_addon(
    request: Request,
    payload: AddOnRequest,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantidade deve ser >= 1")

    addon = _create_addon_request(
        db, member.organization_id, member.user.id, "workspace", payload.quantity, payload.notes
    )

    log_activity(
        db, member.user, "addon.workspace_requested", "OrganizationAddOn",
        resource_id=str(addon.id),
        detail=f"quantity={payload.quantity} — aguardando aprovação",
        provider="system",
    )

    return {
        "addon_id": str(addon.id),
        "addon_type": "workspace",
        "quantity": addon.quantity,
        "monthly_price_cents": addon.monthly_price_cents,
        "status": "pending",
        "message": "Solicitação enviada. Aguardando aprovação do administrador.",
    }


@router.post("/user")
@limiter.limit("10/minute")
def add_user_addon(
    request: Request,
    payload: AddOnRequest,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantidade deve ser >= 1")

    addon = _create_addon_request(
        db, member.organization_id, member.user.id, "user", payload.quantity, payload.notes
    )

    log_activity(
        db, member.user, "addon.user_requested", "OrganizationAddOn",
        resource_id=str(addon.id),
        detail=f"quantity={payload.quantity} — aguardando aprovação",
        provider="system",
    )

    return {
        "addon_id": str(addon.id),
        "addon_type": "user",
        "quantity": addon.quantity,
        "monthly_price_cents": addon.monthly_price_cents,
        "status": "pending",
        "message": "Solicitação enviada. Aguardando aprovação do administrador.",
    }


@router.delete("/{addon_id}")
def remove_addon(
    addon_id: str,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    addon = db.query(OrganizationAddOn).filter(
        OrganizationAddOn.id == addon_id,
        OrganizationAddOn.organization_id == member.organization_id,
    ).first()

    if not addon:
        raise HTTPException(status_code=404, detail="Add-on não encontrado")

    addon.is_active = False
    addon.status = "cancelled"
    db.commit()

    log_activity(
        db, member.user, "addon.removed", "OrganizationAddOn",
        resource_id=str(addon.id),
        detail=f"addon_type={addon.addon_type}, quantity={addon.quantity}",
        provider="system",
    )

    return {"detail": "Add-on removido com sucesso"}


# ── Admin Endpoints ────────────────────────────────────────────────────────────

@admin_router.get("")
def admin_list_addon_requests(
    status: Optional[str] = Query(None, description="pending|approved|rejected"),
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List add-on requests for admin review."""
    q = db.query(OrganizationAddOn)
    if status:
        q = q.filter(OrganizationAddOn.status == status)
    else:
        q = q.filter(OrganizationAddOn.status.in_(["pending", "approved", "rejected"]))

    addons = q.order_by(OrganizationAddOn.created_at.desc()).all()

    result = []
    for a in addons:
        org = db.query(Organization).filter(Organization.id == a.organization_id).first()
        creator = db.query(User).filter(User.id == a.created_by).first() if a.created_by else None
        result.append(_addon_to_dict(
            a,
            org_name=org.name if org else None,
            requested_by=creator.email if creator else None,
        ))

    return {"addon_requests": result}


@admin_router.put("/{addon_id}")
def admin_review_addon_request(
    addon_id: str,
    payload: ReviewAddOnRequest,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Approve or reject an add-on request."""
    if payload.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action deve ser 'approve' ou 'reject'")

    addon = db.query(OrganizationAddOn).filter(OrganizationAddOn.id == addon_id).first()
    if not addon:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    if addon.status != "pending":
        raise HTTPException(status_code=400, detail="Solicitação já foi processada")

    if payload.action == "approve":
        addon.status = "approved"
        addon.is_active = True
    else:
        addon.status = "rejected"
        addon.is_active = False

    addon.admin_notes = payload.admin_notes
    addon.reviewed_by = admin.email
    addon.reviewed_at = datetime.utcnow()
    addon.updated_at = datetime.utcnow()
    db.commit()

    return {"detail": f"Add-on {'aprovado' if payload.action == 'approve' else 'recusado'} com sucesso."}
