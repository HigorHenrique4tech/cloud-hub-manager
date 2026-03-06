"""
Support (Helpdesk) API — org-scoped endpoints for clients and admin-level endpoints.
"""
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user, get_current_admin
from app.database import get_db
from app.models.db_models import Organization, OrganizationMember, Ticket, TicketMessage, User

logger = logging.getLogger(__name__)

# ── Schemas ───────────────────────────────────────────────────────────────────


class TicketCreate(BaseModel):
    title: str
    category: str = "other"
    priority: str = "normal"
    message: str


class MessageCreate(BaseModel):
    content: str
    is_internal: bool = False


class StatusUpdate(BaseModel):
    status: str


# ── Serializers ───────────────────────────────────────────────────────────────


def _sender_dict(user) -> dict:
    if not user:
        return None
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "is_admin": user.is_admin,
    }


def _msg_dict(m: TicketMessage) -> dict:
    return {
        "id": str(m.id),
        "content": m.content,
        "is_internal": m.is_internal,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "sender": _sender_dict(m.sender),
    }


def _ticket_dict(t: Ticket, include_messages: bool = False, include_org: bool = False) -> dict:
    d = {
        "id": str(t.id),
        "title": t.title,
        "category": t.category,
        "priority": t.priority,
        "status": t.status,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        "creator": _sender_dict(t.creator),
    }
    if include_messages:
        d["messages"] = [_msg_dict(m) for m in t.messages]
    if include_org and t.organization:
        d["organization"] = {
            "id": str(t.organization.id),
            "name": t.organization.name,
            "slug": t.organization.slug,
        }
    return d


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_org_or_404(org_slug: str, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")
    return org


def _assert_member(org: Organization, user: User, db: Session):
    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.is_active == True,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="Acesso negado")
    return member


# ── Client Router ─────────────────────────────────────────────────────────────

org_router = APIRouter(prefix="/orgs/{org_slug}/tickets", tags=["Support"])


@org_router.get("")
def list_tickets(
    org_slug: str,
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(org_slug, db)
    _assert_member(org, user, db)

    q = db.query(Ticket).filter(Ticket.organization_id == org.id)
    if status:
        q = q.filter(Ticket.status == status)

    total = q.count()

    # Stats
    open_count = db.query(Ticket).filter(
        Ticket.organization_id == org.id,
        Ticket.status.in_(["open", "in_progress", "waiting_client"]),
    ).count()
    resolved_count = db.query(Ticket).filter(
        Ticket.organization_id == org.id,
        Ticket.status.in_(["resolved", "closed"]),
    ).count()

    tickets = (
        q.options(joinedload(Ticket.creator))
        .order_by(Ticket.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "tickets": [_ticket_dict(t) for t in tickets],
        "total": total,
        "stats": {"open": open_count, "resolved": resolved_count},
    }


@org_router.post("")
def create_ticket(
    org_slug: str,
    payload: TicketCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(org_slug, db)
    _assert_member(org, user, db)

    valid_categories = {"billing", "technical", "feature_request", "other"}
    valid_priorities = {"low", "normal", "high", "urgent"}
    if payload.category not in valid_categories:
        raise HTTPException(status_code=400, detail=f"Categoria inválida. Válidas: {valid_categories}")
    if payload.priority not in valid_priorities:
        raise HTTPException(status_code=400, detail=f"Prioridade inválida. Válidas: {valid_priorities}")

    ticket = Ticket(
        organization_id=org.id,
        creator_id=user.id,
        title=payload.title,
        category=payload.category,
        priority=payload.priority,
    )
    db.add(ticket)
    db.flush()

    msg = TicketMessage(
        ticket_id=ticket.id,
        sender_id=user.id,
        content=payload.message,
        is_internal=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(ticket)
    return _ticket_dict(ticket)


@org_router.get("/{ticket_id}")
def get_ticket(
    org_slug: str,
    ticket_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(org_slug, db)
    _assert_member(org, user, db)

    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id, Ticket.organization_id == org.id)
        .options(
            joinedload(Ticket.creator),
            joinedload(Ticket.messages).joinedload(TicketMessage.sender),
        )
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")

    # Clients don't see internal notes
    if not user.is_admin:
        ticket.messages = [m for m in ticket.messages if not m.is_internal]

    return _ticket_dict(ticket, include_messages=True)


@org_router.post("/{ticket_id}/messages")
def add_message(
    org_slug: str,
    ticket_id: UUID,
    payload: MessageCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(org_slug, db)
    _assert_member(org, user, db)

    ticket = db.query(Ticket).filter(
        Ticket.id == ticket_id, Ticket.organization_id == org.id
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")
    if ticket.status in ("resolved", "closed"):
        raise HTTPException(status_code=400, detail="Ticket encerrado. Abra um novo chamado.")

    # Clients cannot send internal notes
    is_internal = payload.is_internal and user.is_admin

    msg = TicketMessage(
        ticket_id=ticket_id,
        sender_id=user.id,
        content=payload.content,
        is_internal=is_internal,
    )
    db.add(msg)

    ticket.updated_at = datetime.utcnow()
    # If client replies while waiting, reopen
    if ticket.status == "waiting_client" and not user.is_admin:
        ticket.status = "open"

    db.commit()
    db.refresh(msg)
    db.refresh(msg.sender)
    return _msg_dict(msg)


# ── Admin Router ──────────────────────────────────────────────────────────────

admin_support_router = APIRouter(prefix="/admin/tickets", tags=["Support (admin)"])


@admin_support_router.get("")
def admin_list_tickets(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    org_slug: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Ticket)
    if status:
        q = q.filter(Ticket.status == status)
    if priority:
        q = q.filter(Ticket.priority == priority)
    if org_slug:
        org = db.query(Organization).filter(Organization.slug == org_slug).first()
        if org:
            q = q.filter(Ticket.organization_id == org.id)

    total = q.count()
    tickets = (
        q.options(
            joinedload(Ticket.creator),
            joinedload(Ticket.organization),
        )
        .order_by(Ticket.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "tickets": [_ticket_dict(t, include_org=True) for t in tickets],
        "total": total,
    }


@admin_support_router.get("/{ticket_id}")
def admin_get_ticket(
    ticket_id: UUID,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id)
        .options(
            joinedload(Ticket.creator),
            joinedload(Ticket.organization),
            joinedload(Ticket.messages).joinedload(TicketMessage.sender),
        )
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")
    return _ticket_dict(ticket, include_messages=True, include_org=True)


@admin_support_router.patch("/{ticket_id}/status")
def admin_update_status(
    ticket_id: UUID,
    payload: StatusUpdate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")

    valid = {"open", "in_progress", "waiting_client", "resolved", "closed"}
    if payload.status not in valid:
        raise HTTPException(status_code=400, detail=f"Status inválido. Válidos: {valid}")

    ticket.status = payload.status
    ticket.updated_at = datetime.utcnow()
    if payload.status in ("resolved", "closed"):
        ticket.resolved_at = datetime.utcnow()

    db.commit()
    return {"status": ticket.status}


@admin_support_router.post("/{ticket_id}/messages")
def admin_add_message(
    ticket_id: UUID,
    payload: MessageCreate,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")

    msg = TicketMessage(
        ticket_id=ticket_id,
        sender_id=user.id,
        content=payload.content,
        is_internal=payload.is_internal,
    )
    db.add(msg)

    ticket.updated_at = datetime.utcnow()
    if not payload.is_internal:
        ticket.status = "waiting_client"

    db.commit()
    db.refresh(msg)
    db.refresh(msg.sender)
    return _msg_dict(msg)
