"""Admin API for Support configuration, macros, KPIs."""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_admin, get_current_helpdesk
from app.database import get_db
from app.models.db_models import (
    SupportConfig,
    SupportMacro,
    Ticket,
    TicketMessage,
    TicketRating,
    User,
)
from app.services import plan_sla


router = APIRouter(prefix="/admin/support", tags=["Admin - Support"])


# ── Config ────────────────────────────────────────────────────────────────────


class ConfigUpdate(BaseModel):
    inbox_email: Optional[str] = None
    auto_reply_enabled: Optional[bool] = None
    notify_on_new_ticket: Optional[bool] = None
    notify_on_sla_risk: Optional[bool] = None
    notify_on_escalation: Optional[bool] = None
    business_hours_start: Optional[int] = Field(None, ge=0, le=23)
    business_hours_end: Optional[int] = Field(None, ge=1, le=24)
    business_days: Optional[str] = None
    slack_webhook_url: Optional[str] = None
    csat_enabled: Optional[bool] = None


def _config_dict(c: SupportConfig) -> dict:
    return {
        "inbox_email": c.inbox_email,
        "auto_reply_enabled": c.auto_reply_enabled,
        "notify_on_new_ticket": c.notify_on_new_ticket,
        "notify_on_sla_risk": c.notify_on_sla_risk,
        "notify_on_escalation": c.notify_on_escalation,
        "business_hours_start": c.business_hours_start,
        "business_hours_end": c.business_hours_end,
        "business_days": c.business_days,
        "slack_webhook_url": c.slack_webhook_url,
        "csat_enabled": c.csat_enabled,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.get("/config")
def get_config(_: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    cfg = plan_sla.get_config(db)
    return _config_dict(cfg)


@router.put("/config")
def update_config(
    payload: ConfigUpdate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    cfg = plan_sla.get_config(db)
    data = payload.dict(exclude_unset=True)
    if "business_hours_end" in data and "business_hours_start" in data:
        if data["business_hours_end"] <= data["business_hours_start"]:
            raise HTTPException(status_code=400, detail="Fim do expediente deve ser maior que o início")
    for k, v in data.items():
        setattr(cfg, k, v)
    cfg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cfg)
    return _config_dict(cfg)


# ── Macros (canned responses) ─────────────────────────────────────────────────


class MacroCreate(BaseModel):
    title: str
    category: Optional[str] = None
    content: str
    shortcut: Optional[str] = None
    is_active: bool = True


class MacroUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    content: Optional[str] = None
    shortcut: Optional[str] = None
    is_active: Optional[bool] = None


def _macro_dict(m: SupportMacro) -> dict:
    return {
        "id": str(m.id),
        "title": m.title,
        "category": m.category,
        "content": m.content,
        "shortcut": m.shortcut,
        "is_active": m.is_active,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/macros")
def list_macros(
    category: Optional[str] = Query(None),
    user: User = Depends(get_current_helpdesk),
    db: Session = Depends(get_db),
):
    q = db.query(SupportMacro).filter(SupportMacro.is_active == True)
    if category:
        q = q.filter(SupportMacro.category == category)
    macros = q.order_by(SupportMacro.category, SupportMacro.title).all()
    return {"macros": [_macro_dict(m) for m in macros]}


@router.post("/macros")
def create_macro(
    payload: MacroCreate,
    user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    m = SupportMacro(
        title=payload.title,
        category=payload.category,
        content=payload.content,
        shortcut=payload.shortcut,
        is_active=payload.is_active,
        created_by=user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _macro_dict(m)


@router.put("/macros/{macro_id}")
def update_macro(
    macro_id: UUID,
    payload: MacroUpdate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    m = db.query(SupportMacro).filter(SupportMacro.id == macro_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Macro não encontrado")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(m, k, v)
    m.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(m)
    return _macro_dict(m)


@router.delete("/macros/{macro_id}")
def delete_macro(
    macro_id: UUID,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    m = db.query(SupportMacro).filter(SupportMacro.id == macro_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Macro não encontrado")
    db.delete(m)
    db.commit()
    return {"ok": True}


# ── Agents ────────────────────────────────────────────────────────────────────


@router.get("/agents")
def list_agents(_: User = Depends(get_current_helpdesk), db: Session = Depends(get_db)):
    users = (
        db.query(User)
        .filter(
            (User.is_admin == True)
            | (User.is_helpdesk == True)
            | (User.is_support_agent == True)
        )
        .order_by(User.name)
        .all()
    )
    return {
        "agents": [
            {
                "id": str(u.id),
                "name": u.name,
                "email": u.email,
                "is_admin": u.is_admin,
                "is_helpdesk": u.is_helpdesk,
                "is_support_agent": u.is_support_agent,
            }
            for u in users
        ]
    }


# ── KPIs ──────────────────────────────────────────────────────────────────────


@router.get("/kpis")
def support_kpis(
    days: int = Query(30, ge=1, le=365),
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)

    total = db.query(Ticket).filter(Ticket.created_at >= since).count()
    open_ = db.query(Ticket).filter(
        Ticket.created_at >= since,
        Ticket.status.in_(["open", "in_progress", "waiting_client"]),
    ).count()
    resolved = db.query(Ticket).filter(
        Ticket.created_at >= since,
        Ticket.status.in_(["resolved", "closed"]),
    ).count()

    # SLA compliance: tickets where first_response_at <= sla_deadline (or breached)
    with_sla = db.query(Ticket).filter(
        Ticket.created_at >= since,
        Ticket.sla_deadline.isnot(None),
    ).all()
    met, missed = 0, 0
    first_response_deltas: list[float] = []
    for t in with_sla:
        if t.sla_breached:
            missed += 1
        elif t.first_response_at is not None:
            met += 1
            first_response_deltas.append((t.first_response_at - t.created_at).total_seconds() / 3600)
        elif t.sla_deadline and datetime.utcnow() > t.sla_deadline:
            missed += 1
    compliance = (met / (met + missed) * 100.0) if (met + missed) else None
    avg_first_response_hours = (
        sum(first_response_deltas) / len(first_response_deltas)
    ) if first_response_deltas else None

    # By category
    cat_rows = (
        db.query(Ticket.category, func.count(Ticket.id))
        .filter(Ticket.created_at >= since)
        .group_by(Ticket.category)
        .all()
    )
    by_category = {c: n for c, n in cat_rows}

    # By priority
    pri_rows = (
        db.query(Ticket.priority, func.count(Ticket.id))
        .filter(Ticket.created_at >= since)
        .group_by(Ticket.priority)
        .all()
    )
    by_priority = {p: n for p, n in pri_rows}

    # CSAT
    ratings = (
        db.query(TicketRating)
        .join(Ticket, Ticket.id == TicketRating.ticket_id)
        .filter(Ticket.created_at >= since)
        .all()
    )
    csat_avg = (sum(r.rating for r in ratings) / len(ratings)) if ratings else None

    # Top agents
    agent_rows = (
        db.query(User.name, func.count(Ticket.id))
        .join(Ticket, Ticket.assigned_to == User.id)
        .filter(Ticket.created_at >= since)
        .group_by(User.name)
        .order_by(func.count(Ticket.id).desc())
        .limit(5)
        .all()
    )
    top_agents = [{"name": n, "tickets": c} for n, c in agent_rows]

    return {
        "period_days": days,
        "total": total,
        "open": open_,
        "resolved": resolved,
        "sla_compliance_pct": compliance,
        "avg_first_response_hours": avg_first_response_hours,
        "csat_avg": csat_avg,
        "csat_count": len(ratings),
        "by_category": by_category,
        "by_priority": by_priority,
        "top_agents": top_agents,
    }


# ── Promote user to support agent ─────────────────────────────────────────────


class AgentRoleUpdate(BaseModel):
    is_support_agent: bool


@router.patch("/agents/{user_id}")
def set_agent_role(
    user_id: UUID,
    payload: AgentRoleUpdate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    u.is_support_agent = payload.is_support_agent
    db.commit()
    return {"id": str(u.id), "is_support_agent": u.is_support_agent}
