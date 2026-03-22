import csv
import io
import logging
import os
import uuid as _uuid_lib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.db_models import User, Organization, OrganizationMember, EnterpriseLead, BillingRecord, BillingStatusHistory, BillingConfig, ActivityLog, Workspace, CloudAccount
from app.core.dependencies import get_current_user, get_current_admin
from app.services.log_service import log_activity
from app.services.email_service import send_billing_invoice_email, send_billing_reminder_email, send_billing_status_email
from app.services.payment_service import create_billing as create_abacatepay_billing
from app.core.config import settings

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


# ── Router: public contact form (no auth — landing page) ──────────────────────

public_contact_router = APIRouter(prefix="/contact", tags=["Public"])


@public_contact_router.post("", status_code=201)
def public_contact(payload: LeadCreate, db: Session = Depends(get_db)):
    """Public endpoint for landing page contact form. No auth required."""
    lead = EnterpriseLead(
        user_id=None,
        org_id=None,
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

    logger.info("Landing page lead: %s <%s>", payload.name, payload.email)

    return {
        "id": str(lead.id),
        "message": "Recebemos sua mensagem! Entraremos em contato em breve.",
    }


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
            "suspended_reason": org.suspended_reason,
            "suspended_at": org.suspended_at.isoformat() if org.suspended_at else None,
            "notes": org.notes,
            "members_count": member_counts.get(org.id, 0),
            "created_at": org.created_at.isoformat() if org.created_at else None,
            "trial_ends_at": org.trial_ends_at.isoformat() if org.trial_ends_at else None,
            "trial_active": org.trial_ends_at > datetime.utcnow() if org.trial_ends_at else False,
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


# ── Trial management ──────────────────────────────────────────────────────────


class TrialPayload(BaseModel):
    days: int = 30


@router.put("/orgs/{org_id}/trial")
async def set_trial(
    org_id: str,
    payload: TrialPayload,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Extend or reset the trial period for an organization."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    org.trial_ends_at = datetime.utcnow() + timedelta(days=payload.days)
    db.commit()

    log_activity(
        db, admin, "admin.set_trial", "Organization",
        resource_id=str(org.id),
        resource_name=org.name,
        detail=f"trial_days={payload.days}",
        provider="system",
    )

    logger.info("Admin %s set org %s trial: %d days", admin.email, org.slug, payload.days)

    return {
        "id": str(org.id),
        "slug": org.slug,
        "name": org.name,
        "trial_ends_at": org.trial_ends_at.isoformat() if org.trial_ends_at else None,
    }


@router.delete("/orgs/{org_id}/trial")
async def remove_trial(
    org_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Remove trial from an organization (set to expired)."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    org.trial_ends_at = datetime.utcnow() - timedelta(days=1)
    db.commit()

    log_activity(
        db, admin, "admin.remove_trial", "Organization",
        resource_id=str(org.id),
        resource_name=org.name,
        detail="trial removed",
        provider="system",
    )

    return {"ok": True}


# ── Org extras (metrics, suspend, notes) ──────────────────────────────────────


class OrgSuspendPayload(BaseModel):
    suspend: bool
    reason: Optional[str] = None


class OrgNotesPayload(BaseModel):
    notes: str


@admin_router.get("/orgs/{org_slug}/metrics")
def get_org_metrics(
    org_slug: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Return operational metrics for an org. Admin only."""
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    workspace_count = db.query(func.count(Workspace.id)).filter(Workspace.organization_id == org.id).scalar() or 0
    active_workspace_count = db.query(func.count(Workspace.id)).filter(
        Workspace.organization_id == org.id, Workspace.is_active == True
    ).scalar() or 0

    # cloud accounts across all workspaces of this org
    cloud_accounts = (
        db.query(CloudAccount.provider, func.count(CloudAccount.id))
        .join(Workspace, CloudAccount.workspace_id == Workspace.id)
        .filter(Workspace.organization_id == org.id, CloudAccount.is_active == True)
        .group_by(CloudAccount.provider)
        .all()
    )
    cloud_accounts_by_provider = {p: c for p, c in cloud_accounts}

    # last activity from activity log
    last_activity = (
        db.query(ActivityLog.created_at)
        .filter(ActivityLog.organization_id == org.id)
        .order_by(ActivityLog.created_at.desc())
        .first()
    )

    member_count = (
        db.query(func.count(OrganizationMember.id))
        .filter(OrganizationMember.organization_id == org.id, OrganizationMember.is_active == True)
        .scalar() or 0
    )

    return {
        "workspace_count": workspace_count,
        "active_workspace_count": active_workspace_count,
        "member_count": member_count,
        "cloud_accounts": cloud_accounts_by_provider,
        "last_activity_at": last_activity[0].isoformat() if last_activity else None,
    }


@admin_router.patch("/orgs/{org_slug}/suspend")
def suspend_or_reactivate_org(
    org_slug: str,
    payload: OrgSuspendPayload,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Suspend or reactivate an org. Admin only."""
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    org.is_active = not payload.suspend
    org.suspended_reason = payload.reason if payload.suspend else None
    org.suspended_at = datetime.utcnow() if payload.suspend else None
    db.commit()

    log_activity(
        db, admin, "admin.suspend_org" if payload.suspend else "admin.reactivate_org",
        "Organization", resource_id=str(org.id), resource_name=org.name,
        detail=payload.reason or "", provider="system",
    )
    logger.info("Admin %s %s org %s", admin.email, "suspended" if payload.suspend else "reactivated", org_slug)

    return {
        "id": str(org.id),
        "slug": org.slug,
        "is_active": org.is_active,
        "suspended_reason": org.suspended_reason,
        "suspended_at": org.suspended_at.isoformat() if org.suspended_at else None,
    }


@admin_router.patch("/orgs/{org_slug}/notes")
def update_org_notes(
    org_slug: str,
    payload: OrgNotesPayload,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update internal admin notes for an org. Admin only."""
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    org.notes = payload.notes
    db.commit()
    return {"slug": org.slug, "notes": org.notes}


# ── Billing ───────────────────────────────────────────────────────────────────


class BillingCreate(BaseModel):
    client_name: str
    client_email: Optional[str] = None
    org_id: Optional[str] = None
    amount: float
    period_type: str = "monthly"        # monthly | annual
    period_ref: str                     # "2026-03" or "2026"
    due_date: Optional[str] = None      # ISO date string
    status: str = "pending"
    notes: Optional[str] = None
    is_recurring: bool = False
    recurrence_months: Optional[int] = None  # 1 | 3 | 6 | 12


class BillingUpdate(BaseModel):
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    org_id: Optional[str] = None
    amount: Optional[float] = None
    period_type: Optional[str] = None
    period_ref: Optional[str] = None
    due_date: Optional[str] = None
    paid_at: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurrence_months: Optional[int] = None


class BillingStatusPatch(BaseModel):
    status: str
    notes: Optional[str] = None


class BillingBatchStatus(BaseModel):
    ids: list[str]
    status: str
    notes: Optional[str] = None


class BillingConfigUpdate(BaseModel):
    auto_generate_enabled: Optional[bool] = None
    default_amount: Optional[float] = None
    default_due_day: Optional[int] = None
    default_period_type: Optional[str] = None
    reminder_days_before: Optional[int] = None
    reminder_days_after: Optional[int] = None
    auto_overdue_enabled: Optional[bool] = None
    auto_overdue_days: Optional[int] = None
    notes_template: Optional[str] = None


def _billing_to_dict(r: BillingRecord) -> dict:
    return {
        "id": str(r.id),
        "client_name": r.client_name,
        "client_email": r.client_email,
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
        "is_recurring": r.is_recurring,
        "recurrence_months": r.recurrence_months,
        "attachment_filename": r.attachment_filename,
        "has_attachment": bool(r.attachment_path),
        "payment_id": r.payment_id,
        "payment_url": r.payment_url,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


# ── Billing helpers ────────────────────────────────────────────────────────────


def _record_status_change(
    db: Session,
    record: BillingRecord,
    new_status: str,
    changed_by_id=None,
    notes: Optional[str] = None,
    old_status: Optional[str] = None,
) -> None:
    """Create a BillingStatusHistory entry. Always uses record.status as old unless overridden."""
    entry = BillingStatusHistory(
        billing_id=record.id,
        old_status=old_status if old_status is not None else record.status,
        new_status=new_status,
        changed_by_id=changed_by_id,
        notes=notes,
    )
    db.add(entry)


def _next_period_ref(period_type: str, period_ref: str, months: int) -> str:
    if period_type == "monthly":
        year, month = map(int, period_ref.split("-"))
        month += months
        year += (month - 1) // 12
        month = ((month - 1) % 12) + 1
        return f"{year}-{month:02d}"
    else:
        return str(int(period_ref) + max(1, months // 12))


def _next_due_date(due_date: Optional[datetime], months: int) -> Optional[datetime]:
    if not due_date:
        return None
    month = due_date.month + months
    year = due_date.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    day = min(due_date.day, 28)
    return due_date.replace(year=year, month=month, day=day)


def _spawn_next_period(db: Session, record: BillingRecord, actor_id=None) -> None:
    """Create next recurring billing record."""
    months = record.recurrence_months or 1
    next_ref = _next_period_ref(record.period_type, record.period_ref, months)
    next_due = _next_due_date(record.due_date, months)

    new_record = BillingRecord(
        org_id=record.org_id,
        client_name=record.client_name,
        client_email=record.client_email,
        amount=record.amount,
        period_type=record.period_type,
        period_ref=next_ref,
        due_date=next_due,
        status="pending",
        notes=record.notes,
        is_recurring=record.is_recurring,
        recurrence_months=record.recurrence_months,
        created_by=actor_id,
    )
    db.add(new_record)
    db.flush()  # get new_record.id without commit
    _record_status_change(db, new_record, "pending", actor_id, "Gerado automaticamente por recorrência", old_status=None)
    logger.info("Spawned next recurring billing record %s for client %s", new_record.id, record.client_name)


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

    valid_recurrence = {1, 3, 6, 12}
    if payload.is_recurring and payload.recurrence_months not in valid_recurrence:
        raise HTTPException(status_code=400, detail="recurrence_months deve ser 1, 3, 6 ou 12")

    record = BillingRecord(
        client_name=payload.client_name,
        client_email=payload.client_email,
        org_id=org_uuid,
        amount=payload.amount,
        period_type=payload.period_type,
        period_ref=payload.period_ref,
        due_date=due_date,
        status=payload.status,
        notes=payload.notes,
        is_recurring=payload.is_recurring,
        recurrence_months=payload.recurrence_months if payload.is_recurring else None,
        created_by=admin.id,
    )
    db.add(record)
    db.flush()
    _record_status_change(db, record, payload.status, admin.id, "Registro criado", old_status=None)
    db.commit()
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

    old_status = record.status

    if payload.client_name is not None:
        record.client_name = payload.client_name
    if payload.client_email is not None:
        record.client_email = payload.client_email if payload.client_email else None
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
    if payload.is_recurring is not None:
        record.is_recurring = payload.is_recurring
    if payload.recurrence_months is not None:
        record.recurrence_months = payload.recurrence_months
    if not record.is_recurring:
        record.recurrence_months = None

    became_paid = False
    if payload.paid_at is not None:
        record.paid_at = datetime.fromisoformat(payload.paid_at) if payload.paid_at else None
        if payload.paid_at and record.status != "paid":
            record.status = "paid"
            became_paid = True
    if payload.status is not None and payload.status != record.status:
        if payload.status == "paid" and not record.paid_at:
            record.paid_at = datetime.utcnow()
            became_paid = True
        record.status = payload.status
    if payload.notes is not None:
        record.notes = payload.notes

    if record.status != old_status:
        _record_status_change(db, record, record.status, admin.id, None, old_status=old_status)

    if became_paid and record.is_recurring:
        _spawn_next_period(db, record, admin.id)

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


@admin_router.get("/billing/summary")
def get_billing_summary(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Financial summary for billing dashboard. Admin only."""
    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)

    # Paid in last 30d — split by period_type for MRR calculation
    paid_30d_rows = (
        db.query(BillingRecord.period_type, func.sum(BillingRecord.amount))
        .filter(BillingRecord.status == "paid", BillingRecord.paid_at >= thirty_days_ago)
        .group_by(BillingRecord.period_type)
        .all()
    )
    paid_30d = sum(v for _, v in paid_30d_rows)
    mrr = sum(v if t == "monthly" else v / 12 for t, v in paid_30d_rows)

    total_pending = db.query(func.sum(BillingRecord.amount)).filter(BillingRecord.status == "pending").scalar() or 0.0
    total_overdue = db.query(func.sum(BillingRecord.amount)).filter(BillingRecord.status == "overdue").scalar() or 0.0
    overdue_count = db.query(func.count(BillingRecord.id)).filter(BillingRecord.status == "overdue").scalar() or 0
    active_clients = (
        db.query(func.count(func.distinct(BillingRecord.client_name)))
        .filter(BillingRecord.status != "cancelled")
        .scalar() or 0
    )

    return {
        "mrr": round(mrr, 2),
        "arr": round(mrr * 12, 2),
        "total_pending": round(total_pending, 2),
        "total_overdue": round(total_overdue, 2),
        "total_paid_30d": round(paid_30d, 2),
        "active_clients": active_clients,
        "overdue_count": overdue_count,
    }


@admin_router.get("/billing/export")
def export_billing_csv(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Export billing records as CSV. Admin only."""
    q = db.query(BillingRecord).options(joinedload(BillingRecord.org))
    if status:
        q = q.filter(BillingRecord.status == status)
    if search:
        term = f"%{search.lower()}%"
        q = q.filter(func.lower(BillingRecord.client_name).like(term))
    records = q.order_by(BillingRecord.created_at.desc()).all()

    fieldnames = ["id", "client_name", "org_name", "org_slug", "amount", "period_type",
                  "period_ref", "due_date", "paid_at", "status", "is_recurring",
                  "recurrence_months", "notes", "created_at"]

    def generate():
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        yield buf.getvalue()
        for r in records:
            buf.seek(0); buf.truncate()
            writer.writerow({
                "id": str(r.id),
                "client_name": r.client_name,
                "org_name": r.org.name if r.org else "",
                "org_slug": r.org.slug if r.org else "",
                "amount": r.amount,
                "period_type": r.period_type,
                "period_ref": r.period_ref,
                "due_date": r.due_date.isoformat() if r.due_date else "",
                "paid_at": r.paid_at.isoformat() if r.paid_at else "",
                "status": r.status,
                "is_recurring": r.is_recurring,
                "recurrence_months": r.recurrence_months or "",
                "notes": r.notes or "",
                "created_at": r.created_at.isoformat() if r.created_at else "",
            })
            yield buf.getvalue()

    filename = f"faturamento_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@admin_router.get("/billing/analytics")
def get_billing_analytics(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Monthly revenue chart data + revenue by client + overdue report + forecast."""
    now = datetime.utcnow()

    twelve_months_ago = now.replace(day=1) - timedelta(days=365)
    monthly_rows = (
        db.query(
            func.to_char(BillingRecord.paid_at, 'YYYY-MM').label("month"),
            func.sum(BillingRecord.amount),
        )
        .filter(BillingRecord.status == "paid", BillingRecord.paid_at >= twelve_months_ago)
        .group_by("month")
        .order_by("month")
        .all()
    )
    monthly_revenue = [{"month": m, "revenue": round(v, 2)} for m, v in monthly_rows if m]

    client_rows = (
        db.query(BillingRecord.client_name, func.sum(BillingRecord.amount))
        .filter(BillingRecord.status == "paid")
        .group_by(BillingRecord.client_name)
        .order_by(func.sum(BillingRecord.amount).desc())
        .limit(10)
        .all()
    )
    revenue_by_client = [{"client": c, "total": round(v, 2)} for c, v in client_rows]

    overdue_records = (
        db.query(BillingRecord)
        .options(joinedload(BillingRecord.org))
        .filter(BillingRecord.status == "overdue")
        .order_by(BillingRecord.due_date.asc())
        .all()
    )
    overdue_report = []
    for r in overdue_records:
        days_late = (now - r.due_date).days if r.due_date else 0
        overdue_report.append({
            "id": str(r.id),
            "client_name": r.client_name,
            "org_name": r.org.name if r.org else None,
            "amount": r.amount,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "days_late": max(0, days_late),
            "period_ref": r.period_ref,
        })

    active_recurring = (
        db.query(BillingRecord)
        .filter(
            BillingRecord.is_recurring == True,
            BillingRecord.status.in_(["pending", "paid"]),
        )
        .all()
    )
    forecast = []
    for i in range(1, 4):
        future = now.replace(day=1) + timedelta(days=32 * i)
        future_month = f"{future.year}-{future.month:02d}"
        total = sum(r.amount for r in active_recurring if r.period_type == "monthly" or (r.period_type == "annual" and i % 12 == 0))
        forecast.append({"month": future_month, "projected": round(total, 2)})

    status_rows = (
        db.query(BillingRecord.status, func.count(BillingRecord.id), func.sum(BillingRecord.amount))
        .group_by(BillingRecord.status)
        .all()
    )
    status_distribution = [
        {"status": s, "count": c, "total": round(v or 0, 2)}
        for s, c, v in status_rows
    ]

    avg_ticket = db.query(func.avg(BillingRecord.amount)).filter(BillingRecord.status == "paid").scalar()

    return {
        "monthly_revenue": monthly_revenue,
        "revenue_by_client": revenue_by_client,
        "overdue_report": overdue_report,
        "forecast": forecast,
        "status_distribution": status_distribution,
        "avg_ticket": round(avg_ticket, 2) if avg_ticket else 0,
    }


@admin_router.patch("/billing/batch/status")
def batch_update_status(
    payload: BillingBatchStatus,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update status for multiple billing records at once."""
    valid_statuses = {"pending", "paid", "overdue", "cancelled"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Status inválido")

    records = db.query(BillingRecord).filter(BillingRecord.id.in_(payload.ids)).all()
    updated = 0
    for record in records:
        if record.status == payload.status:
            continue
        old_status = record.status
        became_paid = payload.status == "paid" and old_status != "paid"
        if became_paid and not record.paid_at:
            record.paid_at = datetime.utcnow()
        _record_status_change(db, record, payload.status, admin.id, payload.notes, old_status=old_status)
        record.status = payload.status
        if became_paid and record.is_recurring:
            _spawn_next_period(db, record, admin.id)
        updated += 1

    db.commit()
    return {"updated": updated}


@admin_router.post("/billing/batch/generate")
def batch_generate_recurring(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Generate next-period billing for all recurring records that are paid and don't have a pending successor."""
    recurring_paid = (
        db.query(BillingRecord)
        .filter(
            BillingRecord.is_recurring == True,
            BillingRecord.status == "paid",
        )
        .all()
    )

    generated = 0
    for record in recurring_paid:
        months = record.recurrence_months or 1
        next_ref = _next_period_ref(record.period_type, record.period_ref, months)

        existing = db.query(BillingRecord).filter(
            BillingRecord.client_name == record.client_name,
            BillingRecord.period_ref == next_ref,
            BillingRecord.status.in_(["pending", "paid"]),
        ).first()

        if not existing:
            _spawn_next_period(db, record, admin.id)
            generated += 1

    db.commit()
    return {"generated": generated}


def _get_or_create_config(db: Session) -> BillingConfig:
    config = db.query(BillingConfig).first()
    if not config:
        config = BillingConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def _config_to_dict(c: BillingConfig) -> dict:
    return {
        "auto_generate_enabled": c.auto_generate_enabled,
        "default_amount": c.default_amount,
        "default_due_day": c.default_due_day,
        "default_period_type": c.default_period_type,
        "reminder_days_before": c.reminder_days_before,
        "reminder_days_after": c.reminder_days_after,
        "auto_overdue_enabled": c.auto_overdue_enabled,
        "auto_overdue_days": c.auto_overdue_days,
        "notes_template": c.notes_template,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@admin_router.get("/billing/config")
def get_billing_config(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    config = _get_or_create_config(db)
    return _config_to_dict(config)


@admin_router.put("/billing/config")
def update_billing_config(
    payload: BillingConfigUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    config = _get_or_create_config(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    config.updated_by = admin.id
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return _config_to_dict(config)


def _resolve_billing_email(record: BillingRecord, db: Session) -> str | None:
    """Resolve email: client_email first, then org owner email as fallback."""
    if record.client_email:
        return record.client_email
    if record.org_id:
        owner_member = (
            db.query(OrganizationMember)
            .filter(OrganizationMember.organization_id == record.org_id, OrganizationMember.role == "owner")
            .first()
        )
        if owner_member:
            user = db.query(User).filter(User.id == owner_member.user_id).first()
            if user:
                return user.email
    return None


@admin_router.post("/billing/send-invoice/{record_id}")
async def send_invoice_email(
    record_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Send invoice email for a billing record. Generates AbacatePay payment link."""
    record = db.query(BillingRecord).options(joinedload(BillingRecord.org)).filter(BillingRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    to_email = _resolve_billing_email(record, db)
    if not to_email:
        raise HTTPException(status_code=400, detail="Nenhum email disponível. Adicione um email ao cliente ou vincule a uma organização.")

    # Generate AbacatePay payment link (or reuse existing)
    payment_url = record.payment_url
    if not payment_url:
        try:
            amount_cents = int(round(record.amount * 100))
            abacate_data = await create_abacatepay_billing(
                customer_email=to_email,
                customer_name=record.client_name,
                plan_tier="billing",
                amount_cents=amount_cents,
                return_url=f"{settings.FRONTEND_URL}/billing/success",
                completion_url=f"{settings.FRONTEND_URL}/billing/success",
            )
            payment_url = abacate_data.get("url")
            payment_id = abacate_data.get("id")
            if payment_url:
                record.payment_url = payment_url
            if payment_id:
                record.payment_id = payment_id
        except Exception as e:
            logger.warning("AbacatePay billing creation failed for record %s: %s", record_id, e)
            # Continue sending email without payment link

    due_str = record.due_date.strftime("%d/%m/%Y") if record.due_date else None
    success = send_billing_invoice_email(
        to_email=to_email,
        client_name=record.client_name,
        amount=record.amount,
        period_type=record.period_type,
        period_ref=record.period_ref,
        due_date=due_str,
        notes=record.notes,
        payment_url=payment_url,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Falha ao enviar email")

    _record_status_change(db, record, record.status, admin.id, f"Cobrança enviada por email para {to_email}", old_status=record.status)
    db.commit()

    return {"sent_to": to_email, "payment_url": payment_url, "success": True}


@admin_router.post("/billing/send-reminder")
def send_reminders(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Send reminder emails based on billing config (before due / after overdue)."""
    config = _get_or_create_config(db)
    now = datetime.utcnow()
    sent = 0
    errors = 0

    # Records approaching due date
    if config.reminder_days_before > 0:
        reminder_cutoff = now + timedelta(days=config.reminder_days_before)
        upcoming = (
            db.query(BillingRecord)
            .filter(
                BillingRecord.status == "pending",
                BillingRecord.due_date != None,
                BillingRecord.due_date <= reminder_cutoff,
                BillingRecord.due_date >= now,
            )
            .all()
        )
        for record in upcoming:
            to_email = _resolve_billing_email(record, db)
            if not to_email:
                continue
            days_left = (record.due_date - now).days
            due_str = record.due_date.strftime("%d/%m/%Y")
            ok = send_billing_reminder_email(
                to_email=to_email,
                client_name=record.client_name,
                amount=record.amount,
                period_ref=record.period_ref,
                due_date=due_str,
                days_info=f"vence em {days_left} dia{'s' if days_left != 1 else ''}",
                is_overdue=False,
            )
            if ok:
                sent += 1
            else:
                errors += 1

    # Overdue records
    if config.reminder_days_after > 0:
        overdue_records = (
            db.query(BillingRecord)
            .filter(BillingRecord.status == "overdue")
            .all()
        )
        for record in overdue_records:
            to_email = _resolve_billing_email(record, db)
            if not to_email:
                continue
            days_late = (now - record.due_date).days if record.due_date else 0
            due_str = record.due_date.strftime("%d/%m/%Y") if record.due_date else "—"
            ok = send_billing_reminder_email(
                to_email=to_email,
                client_name=record.client_name,
                amount=record.amount,
                period_ref=record.period_ref,
                due_date=due_str,
                days_info=f"{days_late} dia{'s' if days_late != 1 else ''} em atraso",
                is_overdue=True,
            )
            if ok:
                sent += 1
            else:
                errors += 1

    # Auto-mark overdue if enabled
    auto_overdue_count = 0
    if config.auto_overdue_enabled:
        overdue_cutoff = now - timedelta(days=config.auto_overdue_days)
        to_overdue = (
            db.query(BillingRecord)
            .filter(
                BillingRecord.status == "pending",
                BillingRecord.due_date != None,
                BillingRecord.due_date <= overdue_cutoff,
            )
            .all()
        )
        auto_overdue_count = len(to_overdue)
        for record in to_overdue:
            _record_status_change(db, record, "overdue", admin.id, "Marcado como atrasado automaticamente", old_status="pending")
            record.status = "overdue"
        if to_overdue:
            db.commit()

    return {"sent": sent, "errors": errors, "auto_overdue_marked": auto_overdue_count}


@admin_router.post("/billing/send-status-email/{record_id}")
def send_status_email(
    record_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Send a status notification email for a billing record."""
    record = db.query(BillingRecord).options(joinedload(BillingRecord.org)).filter(BillingRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    to_email = _resolve_billing_email(record, db)
    if not to_email:
        raise HTTPException(status_code=400, detail="Nenhum email disponível.")

    paid_str = record.paid_at.strftime("%d/%m/%Y") if record.paid_at else None
    success = send_billing_status_email(
        to_email=to_email,
        client_name=record.client_name,
        amount=record.amount,
        period_ref=record.period_ref,
        new_status=record.status,
        paid_at=paid_str,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Falha ao enviar email")

    return {"sent_to": to_email, "success": True}


@admin_router.get("/billing/{record_id}/history")
def get_billing_history(
    record_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Get status change history for a billing record. Admin only."""
    record = db.query(BillingRecord).filter(BillingRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    history = (
        db.query(BillingStatusHistory)
        .options(joinedload(BillingStatusHistory.changed_by))
        .filter(BillingStatusHistory.billing_id == record_id)
        .order_by(BillingStatusHistory.changed_at.asc())
        .all()
    )

    return {
        "history": [
            {
                "id": str(h.id),
                "old_status": h.old_status,
                "new_status": h.new_status,
                "changed_by_name": h.changed_by.full_name if h.changed_by and hasattr(h.changed_by, "full_name") else (h.changed_by.email if h.changed_by else None),
                "changed_at": h.changed_at.isoformat(),
                "notes": h.notes,
            }
            for h in history
        ]
    }


@admin_router.patch("/billing/{record_id}/status")
def patch_billing_status(
    record_id: str,
    payload: BillingStatusPatch,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Quick status update for a billing record. Admin only."""
    valid_statuses = {"pending", "paid", "overdue", "cancelled"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido: {', '.join(valid_statuses)}")

    record = db.query(BillingRecord).filter(BillingRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    if record.status == payload.status:
        return _billing_to_dict(record)

    old_status = record.status
    became_paid = payload.status == "paid" and old_status != "paid"

    if became_paid and not record.paid_at:
        record.paid_at = datetime.utcnow()

    _record_status_change(db, record, payload.status, admin.id, payload.notes, old_status=old_status)
    record.status = payload.status

    if became_paid and record.is_recurring:
        _spawn_next_period(db, record, admin.id)

    db.commit()
    db.refresh(record)
    if record.org_id:
        record.org = db.query(Organization).filter(Organization.id == record.org_id).first()
    return _billing_to_dict(record)


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

    # Enforce file size limit (10 MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Arquivo muito grande. Limite: 10 MB.")

    # Ensure upload directory exists
    record_dir = BILLING_UPLOADS_DIR / record_id
    record_dir.mkdir(parents=True, exist_ok=True)

    # Remove old file if exists
    if record.attachment_path and Path(record.attachment_path).exists():
        Path(record.attachment_path).unlink(missing_ok=True)

    # Save new file — strip path from filename to prevent path traversal
    safe_ext = Path(file.filename).suffix.lower() if file.filename else ".bin"
    if safe_ext not in {".pdf", ".jpg", ".jpeg", ".png", ".webp"}:
        safe_ext = ".bin"
    dest = record_dir / f"attachment{safe_ext}"
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


# ── Per-org encryption key management ────────────────────────────────────────

@admin_router.post("/orgs/generate-encryption-keys")
def generate_all_org_keys(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Generate per-org encryption keys for all orgs that don't have one yet. Admin only."""
    from app.services.auth_service import get_or_create_org_key

    orgs = db.query(Organization).filter(Organization.encrypted_org_key.is_(None)).all()
    generated = 0
    for org in orgs:
        get_or_create_org_key(db, org.id)
        generated += 1
    return {"generated": generated, "total_orgs": db.query(Organization).count()}


@admin_router.post("/orgs/{org_id}/reencrypt-credentials")
def reencrypt_org_credentials(
    org_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Re-encrypt all cloud account credentials for an org using its per-org key. Admin only."""
    from app.services.auth_service import decrypt_credential, encrypt_credential, get_or_create_org_key

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    org_key = get_or_create_org_key(db, org.id)

    # Find all accounts in all workspaces of this org
    workspaces = db.query(Workspace).filter(Workspace.organization_id == org.id).all()
    ws_ids = [ws.id for ws in workspaces]
    if not ws_ids:
        return {"reencrypted": 0, "org": org.name}

    accounts = db.query(CloudAccount).filter(CloudAccount.workspace_id.in_(ws_ids)).all()
    reencrypted = 0
    errors = []
    for account in accounts:
        try:
            # Decrypt with fallback (tries org key, then master key)
            data = decrypt_credential(account.encrypted_data, org_key=org_key)
            # Re-encrypt with org key only
            account.encrypted_data = encrypt_credential(data, org_key=org_key)
            reencrypted += 1
        except Exception as e:
            errors.append({"account_id": str(account.id), "error": str(e)})

    db.commit()
    log_activity(db, admin, "admin.reencrypt_credentials", "Organization",
                 resource_id=str(org.id), resource_name=org.name)
    return {"reencrypted": reencrypted, "errors": errors, "org": org.name}


@admin_router.post("/orgs/reencrypt-all")
def reencrypt_all_credentials(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Re-encrypt all cloud credentials across all orgs using per-org keys. Admin only."""
    from app.services.auth_service import decrypt_credential, encrypt_credential, get_or_create_org_key

    orgs = db.query(Organization).all()
    total_reencrypted = 0
    total_errors = []

    for org in orgs:
        org_key = get_or_create_org_key(db, org.id)
        workspaces = db.query(Workspace).filter(Workspace.organization_id == org.id).all()
        ws_ids = [ws.id for ws in workspaces]
        if not ws_ids:
            continue
        accounts = db.query(CloudAccount).filter(CloudAccount.workspace_id.in_(ws_ids)).all()
        for account in accounts:
            try:
                data = decrypt_credential(account.encrypted_data, org_key=org_key)
                account.encrypted_data = encrypt_credential(data, org_key=org_key)
                total_reencrypted += 1
            except Exception as e:
                total_errors.append({"account_id": str(account.id), "org": org.name, "error": str(e)})

    db.commit()
    log_activity(db, admin, "admin.reencrypt_all_credentials", "System")
    return {"reencrypted": total_reencrypted, "errors": total_errors, "orgs_processed": len(orgs)}
