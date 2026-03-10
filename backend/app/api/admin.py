import logging
import os
import uuid as _uuid_lib
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.db_models import User, Organization, OrganizationMember, EnterpriseLead, BillingRecord
from app.core.dependencies import get_current_user, get_current_admin
from app.services.log_service import log_activity

BILLING_UPLOADS_DIR = Path(os.getenv("BILLING_UPLOADS_DIR", "/app/uploads/billing"))

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
            "parent_org_id": str(org.parent_org_id) if org.parent_org_id else None,
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


# ── Billing ───────────────────────────────────────────────────────────────────


class BillingCreate(BaseModel):
    client_name: str
    org_id: Optional[str] = None
    amount: float
    period_type: str = "monthly"   # monthly | annual
    period_ref: str                # "2026-03" or "2026"
    due_date: Optional[str] = None # ISO date string
    status: str = "pending"
    notes: Optional[str] = None


class BillingUpdate(BaseModel):
    client_name: Optional[str] = None
    org_id: Optional[str] = None
    amount: Optional[float] = None
    period_type: Optional[str] = None
    period_ref: Optional[str] = None
    due_date: Optional[str] = None
    paid_at: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


def _billing_to_dict(r: BillingRecord) -> dict:
    return {
        "id": str(r.id),
        "client_name": r.client_name,
        "org_id": str(r.org_id) if r.org_id else None,
        "org_name": r.org.name if r.org else None,
        "org_slug": r.org.slug if r.org else None,
        "org_type": r.org.org_type if r.org else None,
        "amount": r.amount,
        "period_type": r.period_type,
        "period_ref": r.period_ref,
        "due_date": r.due_date.isoformat() if r.due_date else None,
        "paid_at": r.paid_at.isoformat() if r.paid_at else None,
        "status": r.status,
        "notes": r.notes,
        "attachment_filename": r.attachment_filename,
        "has_attachment": bool(r.attachment_path),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


@admin_router.get("/billing")
def list_billing(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all billing records. Admin only."""
    q = db.query(BillingRecord).options(joinedload(BillingRecord.org))
    if status:
        q = q.filter(BillingRecord.status == status)
    if search:
        term = f"%{search.lower()}%"
        q = q.filter(func.lower(BillingRecord.client_name).like(term))
    records = q.order_by(BillingRecord.created_at.desc()).all()
    return {"records": [_billing_to_dict(r) for r in records]}


@admin_router.post("/billing", status_code=201)
def create_billing(
    payload: BillingCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Create a billing record. Admin only."""
    valid_statuses = {"pending", "paid", "overdue", "cancelled"}
    valid_periods = {"monthly", "annual"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido: {', '.join(valid_statuses)}")
    if payload.period_type not in valid_periods:
        raise HTTPException(status_code=400, detail=f"period_type inválido: {', '.join(valid_periods)}")

    org_uuid = None
    if payload.org_id:
        org = db.query(Organization).filter(Organization.id == payload.org_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organização não encontrada")
        org_uuid = org.id

    due_date = datetime.fromisoformat(payload.due_date) if payload.due_date else None

    record = BillingRecord(
        client_name=payload.client_name,
        org_id=org_uuid,
        amount=payload.amount,
        period_type=payload.period_type,
        period_ref=payload.period_ref,
        due_date=due_date,
        status=payload.status,
        notes=payload.notes,
        created_by=admin.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    # reload with org
    db.refresh(record)
    if record.org_id:
        record.org = db.query(Organization).filter(Organization.id == record.org_id).first()
    return _billing_to_dict(record)


@admin_router.put("/billing/{record_id}")
def update_billing(
    record_id: str,
    payload: BillingUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update a billing record. Admin only."""
    record = db.query(BillingRecord).filter(BillingRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    if payload.client_name is not None:
        record.client_name = payload.client_name
    if payload.org_id is not None:
        if payload.org_id == "":
            record.org_id = None
        else:
            org = db.query(Organization).filter(Organization.id == payload.org_id).first()
            if not org:
                raise HTTPException(status_code=404, detail="Organização não encontrada")
            record.org_id = org.id
    if payload.amount is not None:
        record.amount = payload.amount
    if payload.period_type is not None:
        record.period_type = payload.period_type
    if payload.period_ref is not None:
        record.period_ref = payload.period_ref
    if payload.due_date is not None:
        record.due_date = datetime.fromisoformat(payload.due_date) if payload.due_date else None
    if payload.paid_at is not None:
        record.paid_at = datetime.fromisoformat(payload.paid_at) if payload.paid_at else None
        if payload.paid_at and record.status != "paid":
            record.status = "paid"
    if payload.status is not None:
        record.status = payload.status
    if payload.notes is not None:
        record.notes = payload.notes

    db.commit()
    db.refresh(record)
    if record.org_id:
        record.org = db.query(Organization).filter(Organization.id == record.org_id).first()
    return _billing_to_dict(record)


@admin_router.delete("/billing/{record_id}", status_code=204)
def delete_billing(
    record_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a billing record and its attachment. Admin only."""
    record = db.query(BillingRecord).filter(BillingRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    if record.attachment_path and Path(record.attachment_path).exists():
        Path(record.attachment_path).unlink(missing_ok=True)
    db.delete(record)
    db.commit()
    return None


@admin_router.post("/billing/{record_id}/attachment")
async def upload_billing_attachment(
    record_id: str,
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Upload a payment proof file for a billing record. Admin only."""
    record = db.query(BillingRecord).filter(BillingRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    # Validate file type
    allowed_types = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Tipo de arquivo não permitido. Use PDF, JPEG ou PNG.")

    # Ensure upload directory exists
    record_dir = BILLING_UPLOADS_DIR / record_id
    record_dir.mkdir(parents=True, exist_ok=True)

    # Remove old file if exists
    if record.attachment_path and Path(record.attachment_path).exists():
        Path(record.attachment_path).unlink(missing_ok=True)

    # Save new file
    ext = Path(file.filename).suffix.lower() if file.filename else ".bin"
    dest = record_dir / f"attachment{ext}"
    content = await file.read()
    dest.write_bytes(content)

    record.attachment_filename = file.filename
    record.attachment_path = str(dest)
    db.commit()

    return {"attachment_filename": file.filename, "has_attachment": True}


@admin_router.get("/billing/{record_id}/attachment")
def download_billing_attachment(
    record_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Download the payment proof file for a billing record. Admin only."""
    record = db.query(BillingRecord).filter(BillingRecord.id == record_id).first()
    if not record or not record.attachment_path:
        raise HTTPException(status_code=404, detail="Comprovante não encontrado")
    path = Path(record.attachment_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")
    return FileResponse(
        path=str(path),
        filename=record.attachment_filename or path.name,
        media_type="application/octet-stream",
    )
