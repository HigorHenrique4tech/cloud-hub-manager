import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.db_models import User, Organization, OrganizationMember, EnterpriseLead
from app.core.dependencies import get_current_user, get_current_admin
from app.services.log_service import log_activity

logger = logging.getLogger(__name__)

# ── Schemas ───────────────────────────────────────────────────────────────────


class LeadCreate(BaseModel):
    name: str
    email: EmailStr
    company: Optional[str] = None
    phone: Optional[str] = None
    message: Optional[str] = None
    org_slug: Optional[str] = None  # frontend sends current org slug


class LeadStatusUpdate(BaseModel):
    status: str  # new | contacted | converted | lost


class OrgPlanUpdate(BaseModel):
    plan_tier: str  # free | pro | enterprise


# ── Router: leads submit (any authenticated user) ─────────────────────────────

leads_router = APIRouter(prefix="/admin/leads", tags=["Admin"])


@leads_router.post("")
def submit_lead(
    payload: LeadCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit an Enterprise sales lead. Any authenticated user can call this."""
    valid_statuses = {"new", "contacted", "converted", "lost"}

    # Resolve org if slug provided
    org_id = None
    if payload.org_slug:
        org = db.query(Organization).filter(Organization.slug == payload.org_slug).first()
        if org:
            org_id = org.id

    lead = EnterpriseLead(
        user_id=user.id,
        org_id=org_id,
        name=payload.name,
        email=payload.email,
        company=payload.company,
        phone=payload.phone,
        message=payload.message,
        status="new",
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    logger.info("Enterprise lead created: %s <%s>", payload.name, payload.email)

    return {
        "id": str(lead.id),
        "message": "Recebemos sua solicitação! Entraremos em contato em breve.",
    }


# ── Router: admin-only endpoints ──────────────────────────────────────────────

admin_router = APIRouter(prefix="/admin", tags=["Admin"])


@admin_router.get("/leads")
def list_leads(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all Enterprise leads with pagination. Admin only."""
    q = (
        db.query(EnterpriseLead)
        .options(joinedload(EnterpriseLead.user), joinedload(EnterpriseLead.org))
    )
    if status:
        q = q.filter(EnterpriseLead.status == status)

    total = q.count()
    leads = (
        q.order_by(EnterpriseLead.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    result = [
        {
            "id": str(lead.id),
            "name": lead.name,
            "email": lead.email,
            "company": lead.company,
            "phone": lead.phone,
            "message": lead.message,
            "status": lead.status,
            "org_name": lead.org.name if lead.org else None,
            "user_email": lead.user.email if lead.user else None,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
        }
        for lead in leads
    ]

    return {"leads": result, "total": total, "page": page, "page_size": page_size}


@admin_router.put("/leads/{lead_id}")
def update_lead_status(
    lead_id: str,
    payload: LeadStatusUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update lead status. Admin only."""
    valid_statuses = {"new", "contacted", "converted", "lost"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {', '.join(valid_statuses)}")

    lead = db.query(EnterpriseLead).filter(EnterpriseLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    lead.status = payload.status
    db.commit()
    return {"id": str(lead.id), "status": lead.status}


@admin_router.get("/orgs")
def list_all_orgs(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all organizations with pagination. Admin only."""
    # Single query to get all active member counts (avoids N+1)
    member_counts = dict(
        db.query(OrganizationMember.organization_id, func.count(OrganizationMember.id))
        .filter(OrganizationMember.is_active == True)
        .group_by(OrganizationMember.organization_id)
        .all()
    )

    q = db.query(Organization)
    if search:
        term = f"%{search.lower()}%"
        q = q.filter(
            func.lower(Organization.name).like(term) | func.lower(Organization.slug).like(term)
        )

    total = q.count()
    orgs = q.order_by(Organization.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    result = [
        {
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "plan_tier": org.plan_tier,
            "org_type": org.org_type,
            "is_active": org.is_active,
            "members_count": member_counts.get(org.id, 0),
            "created_at": org.created_at.isoformat() if org.created_at else None,
        }
        for org in orgs
    ]

    return {"orgs": result, "total": total, "page": page, "page_size": page_size}


@admin_router.put("/orgs/{org_slug}/plan")
def admin_set_org_plan(
    org_slug: str,
    payload: OrgPlanUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Set plan for any org. Admin only — bypasses all plan limits."""
    valid_tiers = {"free", "pro", "enterprise"}
    if payload.plan_tier not in valid_tiers:
        raise HTTPException(status_code=400, detail=f"Plano inválido. Use: {', '.join(valid_tiers)}")

    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    old_tier = org.plan_tier
    org.plan_tier = payload.plan_tier
    db.commit()

    log_activity(
        db, admin, "admin.set_plan", "Organization",
        resource_id=str(org.id),
        resource_name=org.name,
        detail=f"{old_tier} → {payload.plan_tier}",
        provider="system",
    )

    logger.info("Admin %s set org %s plan: %s → %s", admin.email, org_slug, old_tier, payload.plan_tier)

    return {
        "id": str(org.id),
        "slug": org.slug,
        "name": org.name,
        "plan_tier": org.plan_tier,
    }
