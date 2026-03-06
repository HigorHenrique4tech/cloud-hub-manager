"""
Executive Reports API — workspace-scoped endpoints for managing monthly PDF reports.
"""
import base64
import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import ExecutiveReport, ExecutiveReportSettings
from app.services.log_service import log_activity

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/executive-reports",
    tags=["Executive Reports (workspace)"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────


class ReportSettingsUpsert(BaseModel):
    is_enabled: bool = False
    recipients: List[str] = []
    send_day: int = 1
    include_costs: bool = True
    include_anomalies: bool = True
    include_recommendations: bool = True
    include_schedules: bool = True


class GenerateRequest(BaseModel):
    period: Optional[str] = None   # "YYYY-MM", defaults to current month


# ── Helpers ───────────────────────────────────────────────────────────────────


def _report_to_dict(r: ExecutiveReport) -> dict:
    return {
        "id": str(r.id),
        "workspace_id": str(r.workspace_id),
        "period": r.period,
        "status": r.status,
        "has_pdf": r.pdf_bytes is not None,
        "summary_data": r.summary_data,
        "generated_at": r.generated_at.isoformat() if r.generated_at else None,
        "sent_at": r.sent_at.isoformat() if r.sent_at else None,
        "recipients": r.recipients,
        "error": r.error,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _settings_to_dict(s: ExecutiveReportSettings) -> dict:
    return {
        "is_enabled": s.is_enabled,
        "recipients": s.recipients or [],
        "send_day": s.send_day,
        "include_costs": s.include_costs,
        "include_anomalies": s.include_anomalies,
        "include_recommendations": s.include_recommendations,
        "include_schedules": s.include_schedules,
    }


# ── Settings endpoints ────────────────────────────────────────────────────────


@ws_router.get("/settings")
def get_settings(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    s = db.query(ExecutiveReportSettings).filter(
        ExecutiveReportSettings.workspace_id == member.workspace_id,
    ).first()
    if not s:
        return {
            "is_enabled": False,
            "recipients": [],
            "send_day": 1,
            "include_costs": True,
            "include_anomalies": True,
            "include_recommendations": True,
            "include_schedules": True,
        }
    return _settings_to_dict(s)


@ws_router.put("/settings")
def upsert_settings(
    body: ReportSettingsUpsert,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    import uuid as uuid_lib

    s = db.query(ExecutiveReportSettings).filter(
        ExecutiveReportSettings.workspace_id == member.workspace_id,
    ).first()

    if not s:
        s = ExecutiveReportSettings(
            id=uuid_lib.uuid4(),
            workspace_id=member.workspace_id,
        )
        db.add(s)

    s.is_enabled = body.is_enabled
    s.recipients = body.recipients
    s.send_day = max(1, min(28, body.send_day))
    s.include_costs = body.include_costs
    s.include_anomalies = body.include_anomalies
    s.include_recommendations = body.include_recommendations
    s.include_schedules = body.include_schedules
    s.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(s)
    return _settings_to_dict(s)


# ── Report endpoints ──────────────────────────────────────────────────────────


@ws_router.get("")
def list_reports(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    reports = (
        db.query(ExecutiveReport)
        .filter(ExecutiveReport.workspace_id == member.workspace_id)
        .order_by(ExecutiveReport.period.desc())
        .all()
    )
    return {"reports": [_report_to_dict(r) for r in reports], "total": len(reports)}


@ws_router.post("/generate", status_code=202)
def generate_report(
    body: GenerateRequest,
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    """Trigger report generation in the background. Returns immediately."""
    period = body.period or datetime.utcnow().strftime("%Y-%m")

    # Validate period format
    try:
        datetime.strptime(period, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=400, detail="Período inválido. Use o formato YYYY-MM.")

    # Check if a report for this period already exists and is ready
    existing = db.query(ExecutiveReport).filter(
        ExecutiveReport.workspace_id == member.workspace_id,
        ExecutiveReport.period == period,
        ExecutiveReport.status == "ready",
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Já existe um relatório pronto para o período {period}. Use o endpoint de download.",
        )

    from app.services.report_service import generate_report as _gen

    def _bg(workspace_id, period_):
        from app.database import SessionLocal
        with SessionLocal() as bg_db:
            _gen(bg_db, workspace_id, period_)

    background_tasks.add_task(_bg, member.workspace_id, period)

    return {"status": "queued", "period": period, "message": "Geração iniciada em segundo plano."}


@ws_router.get("/{report_id}/pdf")
def download_pdf(
    report_id: UUID,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    report = db.query(ExecutiveReport).filter(
        ExecutiveReport.id == report_id,
        ExecutiveReport.workspace_id == member.workspace_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado.")
    if report.status != "ready" or not report.pdf_bytes:
        raise HTTPException(status_code=409, detail="Relatório ainda não está pronto.")

    pdf_bytes = base64.b64decode(report.pdf_bytes)
    filename = f"relatorio-executivo-{report.period}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@ws_router.post("/{report_id}/send")
def send_report(
    report_id: UUID,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    """Re-send an existing report to the configured recipients."""
    report = db.query(ExecutiveReport).filter(
        ExecutiveReport.id == report_id,
        ExecutiveReport.workspace_id == member.workspace_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado.")

    report_settings = db.query(ExecutiveReportSettings).filter(
        ExecutiveReportSettings.workspace_id == member.workspace_id,
    ).first()

    recipients = (report_settings.recipients if report_settings else []) or []
    if not recipients:
        raise HTTPException(status_code=400, detail="Nenhum destinatário configurado nas configurações do relatório.")

    try:
        from app.services.report_service import send_report as _send
        _send(db, report_id, recipients)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"sent": True, "recipients": recipients}
