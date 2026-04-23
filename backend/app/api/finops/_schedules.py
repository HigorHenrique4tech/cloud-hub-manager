"""FinOps Scan Schedule and Report Schedule endpoints."""
import logging

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import FinOpsScanSchedule, ReportSchedule
from app.services.log_service import log_activity

from . import ws_router
from ._schemas import ReportScheduleUpsert, ScanScheduleRequest
from ._helpers import (
    _get_org_plan,
    _report_schedule_to_dict,
    _require_plan,
    _scan_schedule_to_dict,
)

logger = logging.getLogger(__name__)


# ── FinOps Scan Schedule ──────────────────────────────────────────────────────


@ws_router.get("/scan-schedule")
def get_scan_schedule(
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    """Return the current FinOps auto-scan schedule for this workspace."""
    sched = db.query(FinOpsScanSchedule).filter(
        FinOpsScanSchedule.workspace_id == member.workspace_id,
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Nenhum agendamento de scan configurado.")
    from app.services.scheduler_service import get_finops_scan_next_run
    next_run = get_finops_scan_next_run(str(member.workspace_id))
    return _scan_schedule_to_dict(sched, next_run)


@ws_router.post("/scan-schedule", status_code=200)
def upsert_scan_schedule(
    payload: ScanScheduleRequest,
    member: MemberContext = Depends(require_permission("finops.recommend")),
    db: Session = Depends(get_db),
):
    """Create or update the FinOps auto-scan schedule. Pro-only."""
    _require_plan(_get_org_plan(member, db), "standard", "Análise automática agendada")

    import re
    if not re.match(r"^\d{2}:\d{2}$", payload.schedule_time):
        raise HTTPException(status_code=422, detail="schedule_time must be HH:MM format")
    if payload.schedule_type not in ("daily", "weekdays", "weekends"):
        raise HTTPException(status_code=422, detail="schedule_type must be daily, weekdays or weekends")
    if payload.provider not in ("all", "aws", "azure", "gcp"):
        raise HTTPException(status_code=422, detail="provider must be all, aws, azure or gcp")

    sched = db.query(FinOpsScanSchedule).filter(
        FinOpsScanSchedule.workspace_id == member.workspace_id,
    ).first()

    if sched:
        sched.is_enabled = payload.is_enabled
        sched.schedule_type = payload.schedule_type
        sched.schedule_time = payload.schedule_time
        sched.timezone = payload.timezone
        sched.provider = payload.provider
    else:
        sched = FinOpsScanSchedule(
            workspace_id=member.workspace_id,
            is_enabled=payload.is_enabled,
            schedule_type=payload.schedule_type,
            schedule_time=payload.schedule_time,
            timezone=payload.timezone,
            provider=payload.provider,
            created_by=member.user.id,
        )
        db.add(sched)

    db.commit()
    db.refresh(sched)

    from app.services.scheduler_service import register_finops_scan, unregister_finops_scan, get_finops_scan_next_run
    if payload.is_enabled:
        register_finops_scan(sched)
    else:
        unregister_finops_scan(str(member.workspace_id))

    next_run = get_finops_scan_next_run(str(member.workspace_id)) if payload.is_enabled else None
    log_activity(
        db, member.user, "finops.scan_schedule.upsert", "FinOpsScanSchedule",
        resource_id=str(sched.id),
        detail=f"type={payload.schedule_type} time={payload.schedule_time} provider={payload.provider} enabled={payload.is_enabled}",
        provider="system",
    )
    return _scan_schedule_to_dict(sched, next_run)


@ws_router.delete("/scan-schedule", status_code=204)
def delete_scan_schedule(
    member: MemberContext = Depends(require_permission("finops.recommend")),
    db: Session = Depends(get_db),
):
    """Remove the FinOps auto-scan schedule. Pro-only."""
    _require_plan(_get_org_plan(member, db), "standard", "Análise automática agendada")

    sched = db.query(FinOpsScanSchedule).filter(
        FinOpsScanSchedule.workspace_id == member.workspace_id,
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Nenhum agendamento de scan configurado.")

    from app.services.scheduler_service import unregister_finops_scan
    unregister_finops_scan(str(member.workspace_id))
    db.delete(sched)
    db.commit()
    log_activity(db, member.user, "finops.scan_schedule.delete", "FinOpsScanSchedule", str(sched.id), {})
    return None


# ── Report Schedule ───────────────────────────────────────────────────────────


@ws_router.get("/report-schedule")
def get_report_schedule(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """Return the current report schedule for this workspace, or null."""
    sched = db.query(ReportSchedule).filter(
        ReportSchedule.workspace_id == member.workspace_id,
    ).first()
    if not sched:
        return {"schedule": None}
    from app.services.scheduler_service import get_report_next_run
    next_run = get_report_next_run(str(sched.id))
    return {"schedule": _report_schedule_to_dict(sched, next_run)}


@ws_router.post("/report-schedule", status_code=200)
def upsert_report_schedule(
    payload: ReportScheduleUpsert,
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """Create or update the report schedule for this workspace. Pro-only."""
    import re
    plan = _get_org_plan(member, db)
    _require_plan(plan, "standard", "Relatórios automáticos")

    if payload.schedule_type not in ("weekly", "monthly"):
        raise HTTPException(status_code=422, detail="schedule_type must be 'weekly' or 'monthly'")
    if not re.match(r"^\d{2}:\d{2}$", payload.send_time):
        raise HTTPException(status_code=422, detail="send_time must be HH:MM format")
    if payload.schedule_type == "weekly" and not (0 <= payload.send_day <= 6):
        raise HTTPException(status_code=422, detail="For weekly schedules, send_day must be 0 (Mon) to 6 (Sun)")
    if payload.schedule_type == "monthly" and not (1 <= payload.send_day <= 28):
        raise HTTPException(status_code=422, detail="For monthly schedules, send_day must be 1-28")
    if not payload.recipients:
        raise HTTPException(status_code=422, detail="At least one recipient email is required")

    sched = db.query(ReportSchedule).filter(
        ReportSchedule.workspace_id == member.workspace_id,
    ).first()

    if sched:
        sched.name = payload.name
        sched.schedule_type = payload.schedule_type
        sched.send_day = payload.send_day
        sched.send_time = payload.send_time
        sched.timezone = payload.timezone
        sched.recipients = payload.recipients
        sched.include_budgets = payload.include_budgets
        sched.include_finops = payload.include_finops
        sched.include_costs = payload.include_costs
        sched.is_enabled = payload.is_enabled
    else:
        sched = ReportSchedule(
            workspace_id=member.workspace_id,
            created_by=member.user.id,
            name=payload.name,
            schedule_type=payload.schedule_type,
            send_day=payload.send_day,
            send_time=payload.send_time,
            timezone=payload.timezone,
            recipients=payload.recipients,
            include_budgets=payload.include_budgets,
            include_finops=payload.include_finops,
            include_costs=payload.include_costs,
            is_enabled=payload.is_enabled,
        )
        db.add(sched)

    db.commit()
    db.refresh(sched)

    from app.services.scheduler_service import register_report_schedule, unregister_report_schedule, get_report_next_run
    if payload.is_enabled:
        register_report_schedule(sched)
    else:
        unregister_report_schedule(str(sched.id))

    next_run = get_report_next_run(str(sched.id)) if payload.is_enabled else None
    log_activity(
        db, member.user, "finops.report_schedule.upsert", "ReportSchedule",
        resource_id=str(sched.id),
        detail=f"type={payload.schedule_type} day={payload.send_day} time={payload.send_time} enabled={payload.is_enabled}",
        provider="system",
    )
    return _report_schedule_to_dict(sched, next_run)


@ws_router.delete("/report-schedule", status_code=204)
def delete_report_schedule(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """Remove the report schedule for this workspace."""
    sched = db.query(ReportSchedule).filter(
        ReportSchedule.workspace_id == member.workspace_id,
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Nenhum agendamento de relatório configurado.")

    from app.services.scheduler_service import unregister_report_schedule
    unregister_report_schedule(str(sched.id))
    sched_id = str(sched.id)
    db.delete(sched)
    db.commit()
    log_activity(db, member.user, "finops.report_schedule.delete", "ReportSchedule", sched_id, {})
    return None
