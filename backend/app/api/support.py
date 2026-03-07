"""
Support (Helpdesk) API.

Client endpoints (org-scoped, /orgs/{org_slug}/tickets):
  - Users see only their OWN tickets.
  - workspace_id is optional on creation.

Admin/Helpdesk endpoints (/admin/tickets):
  - Requires is_admin OR is_helpdesk.
  - Full visibility across all orgs.
"""
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user, get_current_helpdesk
from app.database import get_db
from app.models.db_models import Organization, OrganizationMember, Ticket, TicketMessage, User, Workspace

logger = logging.getLogger(__name__)

# ── Schemas ───────────────────────────────────────────────────────────────────


class TicketCreate(BaseModel):
    title: str
    category: str = "other"
    priority: str = "normal"
    message: str
    workspace_id: Optional[str] = None


class MessageCreate(BaseModel):
    content: str
    is_internal: bool = False


class StatusUpdate(BaseModel):
    status: str


class PriorityUpdate(BaseModel):
    priority: str


# ── Serializers ───────────────────────────────────────────────────────────────


def _sender_dict(user) -> dict:
    if not user:
        return None
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "is_admin": user.is_admin,
        "is_helpdesk": getattr(user, "is_helpdesk", False),
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
        "ticket_number": t.ticket_number,
        "title": t.title,
        "category": t.category,
        "priority": t.priority,
        "status": t.status,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        "creator": _sender_dict(t.creator),
        "workspace": {
            "id": str(t.workspace.id),
            "name": t.workspace.name,
            "slug": t.workspace.slug,
        } if t.workspace else None,
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


def _next_ticket_number(db: Session) -> int:
    result = db.execute(func.nextval("ticket_number_seq"))
    return result.scalar()


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

    # Users see ONLY their own tickets
    q = db.query(Ticket).filter(
        Ticket.organization_id == org.id,
        Ticket.creator_id == user.id,
    )
    if status:
        q = q.filter(Ticket.status == status)

    total = q.count()

    open_count = db.query(Ticket).filter(
        Ticket.organization_id == org.id,
        Ticket.creator_id == user.id,
        Ticket.status.in_(["open", "in_progress", "waiting_client"]),
    ).count()
    resolved_count = db.query(Ticket).filter(
        Ticket.organization_id == org.id,
        Ticket.creator_id == user.id,
        Ticket.status.in_(["resolved", "closed"]),
    ).count()

    tickets = (
        q.options(joinedload(Ticket.creator), joinedload(Ticket.workspace))
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

    workspace = None
    if payload.workspace_id:
        workspace = db.query(Workspace).filter(
            Workspace.id == payload.workspace_id,
            Workspace.organization_id == org.id,
            Workspace.is_active == True,
        ).first()
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace não encontrado")

    ticket_number = _next_ticket_number(db)

    ticket = Ticket(
        ticket_number=ticket_number,
        organization_id=org.id,
        workspace_id=workspace.id if workspace else None,
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
        .filter(
            Ticket.id == ticket_id,
            Ticket.organization_id == org.id,
            Ticket.creator_id == user.id,
        )
        .options(
            joinedload(Ticket.creator),
            joinedload(Ticket.workspace),
            joinedload(Ticket.messages).joinedload(TicketMessage.sender),
        )
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")

    msgs = sorted(ticket.messages, key=lambda m: m.created_at or datetime.min)
    msgs = [m for m in msgs if not m.is_internal]
    ticket.messages = msgs

    return _ticket_dict(ticket, include_messages=True)


@org_router.get("/{ticket_id}/messages")
def get_ticket_messages(
    org_slug: str,
    ticket_id: UUID,
    since: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Poll endpoint — returns messages newer than `since` (ISO datetime)."""
    org = _get_org_or_404(org_slug, db)
    _assert_member(org, user, db)

    ticket = db.query(Ticket).filter(
        Ticket.id == ticket_id,
        Ticket.organization_id == org.id,
        Ticket.creator_id == user.id,
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")

    q = db.query(TicketMessage).filter(
        TicketMessage.ticket_id == ticket_id,
        TicketMessage.is_internal == False,
    )
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00")).replace(tzinfo=None)
            q = q.filter(TicketMessage.created_at > since_dt)
        except ValueError:
            pass

    msgs = q.options(joinedload(TicketMessage.sender)).order_by(TicketMessage.created_at).all()
    return {"messages": [_msg_dict(m) for m in msgs]}


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
        Ticket.id == ticket_id,
        Ticket.organization_id == org.id,
        Ticket.creator_id == user.id,
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")
    if ticket.status in ("resolved", "closed"):
        raise HTTPException(status_code=400, detail="Ticket encerrado. Abra um novo chamado.")

    msg = TicketMessage(
        ticket_id=ticket_id,
        sender_id=user.id,
        content=payload.content,
        is_internal=False,
    )
    db.add(msg)

    ticket.updated_at = datetime.utcnow()
    if ticket.status == "waiting_client":
        ticket.status = "open"

    db.commit()
    db.refresh(msg)
    db.refresh(msg.sender)
    return _msg_dict(msg)


# ── Admin/Helpdesk Router ─────────────────────────────────────────────────────

admin_support_router = APIRouter(prefix="/admin/tickets", tags=["Support (admin)"])


@admin_support_router.get("")
def admin_list_tickets(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    org_slug: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    user: User = Depends(get_current_helpdesk),
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
    if search:
        q = q.filter(Ticket.title.ilike(f"%{search}%"))

    total = q.count()

    open_count = db.query(Ticket).filter(
        Ticket.status.in_(["open", "in_progress", "waiting_client"])
    ).count()
    in_progress_count = db.query(Ticket).filter(Ticket.status == "in_progress").count()
    waiting_count = db.query(Ticket).filter(Ticket.status == "waiting_client").count()
    resolved_count = db.query(Ticket).filter(
        Ticket.status.in_(["resolved", "closed"])
    ).count()

    tickets = (
        q.options(
            joinedload(Ticket.creator),
            joinedload(Ticket.organization),
            joinedload(Ticket.workspace),
        )
        .order_by(Ticket.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "tickets": [_ticket_dict(t, include_org=True) for t in tickets],
        "total": total,
        "stats": {
            "open": open_count,
            "in_progress": in_progress_count,
            "waiting_client": waiting_count,
            "resolved": resolved_count,
        },
    }


@admin_support_router.get("/{ticket_id}")
def admin_get_ticket(
    ticket_id: UUID,
    _: User = Depends(get_current_helpdesk),
    db: Session = Depends(get_db),
):
    ticket = (
        db.query(Ticket)
        .filter(Ticket.id == ticket_id)
        .options(
            joinedload(Ticket.creator),
            joinedload(Ticket.organization),
            joinedload(Ticket.workspace),
            joinedload(Ticket.messages).joinedload(TicketMessage.sender),
        )
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")
    ticket.messages = sorted(ticket.messages, key=lambda m: m.created_at or datetime.min)
    return _ticket_dict(ticket, include_messages=True, include_org=True)


@admin_support_router.patch("/{ticket_id}/status")
def admin_update_status(
    ticket_id: UUID,
    payload: StatusUpdate,
    _: User = Depends(get_current_helpdesk),
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


@admin_support_router.patch("/{ticket_id}/priority")
def admin_update_priority(
    ticket_id: UUID,
    payload: PriorityUpdate,
    _: User = Depends(get_current_helpdesk),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")

    valid = {"low", "normal", "high", "urgent"}
    if payload.priority not in valid:
        raise HTTPException(status_code=400, detail=f"Prioridade inválida. Válidas: {valid}")

    ticket.priority = payload.priority
    ticket.updated_at = datetime.utcnow()
    db.commit()
    return {"priority": ticket.priority}


@admin_support_router.post("/{ticket_id}/messages")
def admin_add_message(
    ticket_id: UUID,
    payload: MessageCreate,
    user: User = Depends(get_current_helpdesk),
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


@admin_support_router.get("/{ticket_id}/messages")
def admin_get_messages(
    ticket_id: UUID,
    since: Optional[str] = Query(None),
    _: User = Depends(get_current_helpdesk),
    db: Session = Depends(get_db),
):
    """Poll endpoint for real-time message updates (5s interval from frontend)."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")

    q = db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket_id)
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00")).replace(tzinfo=None)
            q = q.filter(TicketMessage.created_at > since_dt)
        except ValueError:
            pass

    msgs = q.options(joinedload(TicketMessage.sender)).order_by(TicketMessage.created_at).all()
    return {"messages": [_msg_dict(m) for m in msgs]}
