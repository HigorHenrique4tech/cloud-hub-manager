"""
Add-ons API — gerenciar workspaces e usuários adicionais por plano.

Endpoints:
  GET    /orgs/{org_slug}/addons                    — listar add-ons da org
  POST   /orgs/{org_slug}/addons/workspace          — adicionar workspace(s)
  POST   /orgs/{org_slug}/addons/user               — adicionar usuário(s)
  DELETE /orgs/{org_slug}/addons/{addon_id}         — remover add-on
"""
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.db_models import Organization, OrganizationAddOn, Payment
from app.core.dependencies import get_current_member, require_org_permission
from app.core.auth_context import MemberContext
from app.services.plan_service import get_plan_limits, PLAN_PRICES
from app.services.log_service import log_activity
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/orgs/{org_slug}/addons",
    tags=["Add-ons"],
)


class AddOnRequest(BaseModel):
    quantity: int  # number of units to add


@router.get("")
def list_addons(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """List all active add-ons for this organization."""
    addons = db.query(OrganizationAddOn).filter(
        OrganizationAddOn.organization_id == member.organization_id,
        OrganizationAddOn.is_active == True,
    ).all()
    return {
        "addons": [
            {
                "id": str(a.id),
                "addon_type": a.addon_type,
                "quantity": a.quantity,
                "monthly_price_cents": a.monthly_price_cents,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in addons
        ]
    }


@router.post("/workspace")
@limiter.limit("10/minute")
def add_workspace_addon(
    request: Request,
    payload: AddOnRequest,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Add workspace add-on(s) to organization."""
    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantidade deve ser >= 1")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    # Check if there's an existing workspace add-on (consolidate instead of duplicate)
    existing = db.query(OrganizationAddOn).filter(
        OrganizationAddOn.organization_id == member.organization_id,
        OrganizationAddOn.addon_type == "workspace",
        OrganizationAddOn.is_active == True,
    ).first()

    addon_price = PLAN_PRICES.get("addon_workspace", 6000)  # R$ 60 em centavos

    if existing:
        existing.quantity += payload.quantity
        existing.updated_at = datetime.utcnow()
        db.commit()
        addon = existing
    else:
        addon = OrganizationAddOn(
            organization_id=member.organization_id,
            addon_type="workspace",
            quantity=payload.quantity,
            monthly_price_cents=addon_price,
            created_by=member.user.id,
        )
        db.add(addon)
        db.commit()
        db.refresh(addon)

    log_activity(
        db, member.user, "addon.workspace_added", "OrganizationAddOn",
        resource_id=str(addon.id),
        detail=f"quantity={payload.quantity}, total_ws={addon.quantity}",
        provider="system",
    )

    return {
        "addon_id": str(addon.id),
        "addon_type": "workspace",
        "quantity": addon.quantity,
        "monthly_price_cents": addon.monthly_price_cents,
    }


@router.post("/user")
@limiter.limit("10/minute")
def add_user_addon(
    request: Request,
    payload: AddOnRequest,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Add user add-on(s) to organization."""
    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantidade deve ser >= 1")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    # Consolidate: check if existing user add-on exists
    existing = db.query(OrganizationAddOn).filter(
        OrganizationAddOn.organization_id == member.organization_id,
        OrganizationAddOn.addon_type == "user",
        OrganizationAddOn.is_active == True,
    ).first()

    addon_price = PLAN_PRICES.get("addon_user", 15900)  # R$ 159 em centavos

    if existing:
        existing.quantity += payload.quantity
        existing.updated_at = datetime.utcnow()
        db.commit()
        addon = existing
    else:
        addon = OrganizationAddOn(
            organization_id=member.organization_id,
            addon_type="user",
            quantity=payload.quantity,
            monthly_price_cents=addon_price,
            created_by=member.user.id,
        )
        db.add(addon)
        db.commit()
        db.refresh(addon)

    log_activity(
        db, member.user, "addon.user_added", "OrganizationAddOn",
        resource_id=str(addon.id),
        detail=f"quantity={payload.quantity}, total_users={addon.quantity}",
        provider="system",
    )

    return {
        "addon_id": str(addon.id),
        "addon_type": "user",
        "quantity": addon.quantity,
        "monthly_price_cents": addon.monthly_price_cents,
    }


@router.delete("/{addon_id}")
def remove_addon(
    addon_id: str,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Deactivate an add-on."""
    addon = db.query(OrganizationAddOn).filter(
        OrganizationAddOn.id == addon_id,
        OrganizationAddOn.organization_id == member.organization_id,
    ).first()

    if not addon:
        raise HTTPException(status_code=404, detail="Add-on não encontrado")

    addon.is_active = False
    db.commit()

    log_activity(
        db, member.user, "addon.removed", "OrganizationAddOn",
        resource_id=str(addon.id),
        detail=f"addon_type={addon.addon_type}, quantity={addon.quantity}",
        provider="system",
    )

    return {"detail": "Add-on removido com sucesso"}
