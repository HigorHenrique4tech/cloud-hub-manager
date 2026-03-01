"""
Schedules API — CRUD for ScheduledAction (start/stop cloud resources on a cron).

Routes are workspace-scoped: /orgs/{org_slug}/workspaces/{workspace_id}/schedules
Plan requirement: Pro or above.
"""
import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import Organization, ScheduledAction
from app.services.log_service import log_activity
from app.services.scheduler_service import (
    get_next_run,
    load_all_schedules,
    register_schedule,
    unregister_schedule,
)

logger = logging.getLogger(__name__)

# ── Schemas ───────────────────────────────────────────────────────────────────


class ScheduleCreate(BaseModel):
    provider: str                                  # "aws" | "azure"
    resource_id: str
    resource_name: str
    resource_type: str                             # "ec2" | "vm" | "app_service"
    action: str                                    # "start" | "stop"
    schedule_type: str = "weekdays"               # "daily" | "weekdays" | "weekends"
    schedule_time: str                             # "HH:MM"
    timezone: str = "America/Sao_Paulo"
    is_enabled: bool = True

    @field_validator("action")
    @classmethod
    def validate_action(cls, v):
        if v not in ("start", "stop"):
            raise ValueError("action must be 'start' or 'stop'")
        return v

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v):
        if v not in ("aws", "azure"):
            raise ValueError("provider must be 'aws' or 'azure'")
        return v

    @field_validator("schedule_type")
    @classmethod
    def validate_schedule_type(cls, v):
        if v not in ("daily", "weekdays", "weekends"):
            raise ValueError("schedule_type must be 'daily', 'weekdays', or 'weekends'")
        return v

    @field_validator("schedule_time")
    @classmethod
    def validate_schedule_time(cls, v):
        parts = v.split(":")
        if len(parts) != 2:
            raise ValueError("schedule_time must be HH:MM")
        h, m = parts
        if not (h.isdigit() and m.isdigit() and 0 <= int(h) <= 23 and 0 <= int(m) <= 59):
            raise ValueError("schedule_time must be a valid HH:MM (UTC)")
        return v


class ScheduleUpdate(BaseModel):
    schedule_type: Optional[str] = None
    schedule_time: Optional[str] = None
    timezone: Optional[str] = None
    is_enabled: Optional[bool] = None
    resource_name: Optional[str] = None

    @field_validator("schedule_type")
    @classmethod
    def validate_schedule_type(cls, v):
        if v is not None and v not in ("daily", "weekdays", "weekends"):
            raise ValueError("schedule_type must be 'daily', 'weekdays', or 'weekends'")
        return v

    @field_validator("schedule_time")
    @classmethod
    def validate_schedule_time(cls, v):
        if v is not None:
            parts = v.split(":")
            if len(parts) != 2:
                raise ValueError("schedule_time must be HH:MM")
            h, m = parts
            if not (h.isdigit() and m.isdigit() and 0 <= int(h) <= 23 and 0 <= int(m) <= 59):
                raise ValueError("schedule_time must be a valid HH:MM (UTC)")
        return v


# ── Helpers ───────────────────────────────────────────────────────────────────

def _schedule_to_dict(s: ScheduledAction) -> dict:
    return {
        "id": str(s.id),
        "workspace_id": str(s.workspace_id),
        "provider": s.provider,
        "resource_id": s.resource_id,
        "resource_name": s.resource_name,
        "resource_type": s.resource_type,
        "action": s.action,
        "schedule_type": s.schedule_type,
        "schedule_time": s.schedule_time,
        "timezone": s.timezone,
        "is_enabled": s.is_enabled,
        "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
        "last_run_status": s.last_run_status,
        "last_run_error": s.last_run_error,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "next_run_at": get_next_run(str(s.id)) if s.is_enabled else None,
    }


def _get_org_plan(member: MemberContext, db: Session) -> str:
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    return (org.plan_tier if org and org.plan_tier else "free").lower()


def _require_pro(member: MemberContext, db: Session):
    plan = _get_org_plan(member, db)
    order = {"free": 0, "pro": 1, "enterprise": 2}
    if order.get(plan, 0) < 1:
        raise HTTPException(
            status_code=403,
            detail="Agendamentos requerem plano Pro ou superior."
        )


# ── Router ────────────────────────────────────────────────────────────────────

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/schedules",
    tags=["Schedules (workspace)"],
)


@ws_router.get("", response_model=List[dict])
async def list_schedules(
    provider: Optional[str] = None,
    is_enabled: Optional[bool] = None,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List scheduled actions for the workspace."""
    _require_pro(member, db)

    q = db.query(ScheduledAction).filter(
        ScheduledAction.workspace_id == member.workspace_id
    )
    if provider:
        q = q.filter(ScheduledAction.provider == provider)
    if is_enabled is not None:
        q = q.filter(ScheduledAction.is_enabled == is_enabled)

    schedules = q.order_by(ScheduledAction.schedule_time.asc()).all()
    return [_schedule_to_dict(s) for s in schedules]


@ws_router.post("", response_model=dict, status_code=201)
async def create_schedule(
    payload: ScheduleCreate,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    """Create a new scheduled action and register it in APScheduler."""
    _require_pro(member, db)

    s = ScheduledAction(
        workspace_id=member.workspace_id,
        provider=payload.provider,
        resource_id=payload.resource_id,
        resource_name=payload.resource_name,
        resource_type=payload.resource_type,
        action=payload.action,
        schedule_type=payload.schedule_type,
        schedule_time=payload.schedule_time,
        timezone=payload.timezone,
        is_enabled=payload.is_enabled,
        created_by=member.user.id,
        created_at=datetime.utcnow(),
    )
    db.add(s)
    db.commit()
    db.refresh(s)

    if s.is_enabled:
        register_schedule(s)

    log_activity(
        db, member.user,
        action="schedule.create",
        resource_type="ScheduledAction",
        resource_id=str(s.id),
        resource_name=s.resource_name,
        provider=s.provider,
        detail=f"{s.action} @ {s.schedule_time} ({s.schedule_type})",
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )

    return _schedule_to_dict(s)


@ws_router.patch("/{schedule_id}", response_model=dict)
async def update_schedule(
    schedule_id: UUID,
    payload: ScheduleUpdate,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    """Update a scheduled action and sync APScheduler."""
    _require_pro(member, db)

    s = db.query(ScheduledAction).filter(
        ScheduledAction.id == schedule_id,
        ScheduledAction.workspace_id == member.workspace_id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado.")

    changed = False
    for field, value in payload.model_dump(exclude_none=True).items():
        if getattr(s, field) != value:
            setattr(s, field, value)
            changed = True

    if changed:
        db.commit()
        db.refresh(s)

    # Sync scheduler
    if s.is_enabled:
        register_schedule(s)
    else:
        unregister_schedule(str(s.id))

    log_activity(
        db, member.user,
        action="schedule.update",
        resource_type="ScheduledAction",
        resource_id=str(s.id),
        resource_name=s.resource_name,
        provider=s.provider,
        detail=f"{s.action} @ {s.schedule_time} ({s.schedule_type})",
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )

    return _schedule_to_dict(s)


@ws_router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: UUID,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    """Delete a scheduled action and remove it from APScheduler."""
    _require_pro(member, db)

    s = db.query(ScheduledAction).filter(
        ScheduledAction.id == schedule_id,
        ScheduledAction.workspace_id == member.workspace_id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado.")

    unregister_schedule(str(s.id))
    log_activity(
        db, member.user,
        action="schedule.delete",
        resource_type="ScheduledAction",
        resource_id=str(s.id),
        resource_name=s.resource_name,
        provider=s.provider,
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    db.delete(s)
    db.commit()
