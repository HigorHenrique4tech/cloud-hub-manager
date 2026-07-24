"""FinOps Recommendation endpoints (list, export, request-approval, apply, dismiss, bulk)."""
import csv
import io
import json
import math
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import (
    FinOpsAction,
    FinOpsRecommendation,
    ScheduledAction,
)
from app.services.log_service import log_activity

from . import ws_router
from ._schemas import BulkApplyRequest, BulkDismissRequest, DismissRequest
from ._helpers import (
    _action_to_dict,
    _get_aws_scanner,
    _get_azure_scanner,
    _get_gcp_scanner,
    _get_org_plan,
    _rec_to_dict,
    _require_plan,
)
from ._actions_helpers import (
    _apply_aws,
    _apply_azure,
    _apply_gcp,
    _apply_recommendation_logic,
)

logger = logging.getLogger(__name__)


@ws_router.get("/recommendations")
async def list_recommendations(
    status: Optional[str] = Query(None, description="pending|applied|dismissed|failed"),
    provider: Optional[str] = Query(None, description="aws|azure|gcp"),
    severity: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)

    q = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.workspace_id == member.workspace_id,
    )
    if status:
        q = q.filter(FinOpsRecommendation.status == status)
    if provider:
        q = q.filter(FinOpsRecommendation.provider == provider)
    if severity:
        q = q.filter(FinOpsRecommendation.severity == severity)

    q = q.order_by(FinOpsRecommendation.estimated_saving_monthly.desc())
    total = q.count()
    recs = q.offset((page - 1) * page_size).limit(page_size).all()

    data = [_rec_to_dict(r) for r in recs]

    # Plan gate: free plan sees top 3 only
    if plan == "free" and (not status or status == "pending"):
        for i, item in enumerate(data):
            if (page - 1) * page_size + i >= 3:
                item["_locked"] = True
                item["reasoning"] = ""
                item["current_spec"] = None
                item["recommended_spec"] = None

    return {
        "items": data,
        "total": total,
        "page": page,
        "pages": math.ceil(total / page_size) if total else 1,
        "page_size": page_size,
    }


@ws_router.get("/recommendations/export")
def export_recommendations(
    format: str = Query("csv", description="csv|json"),
    status: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    """Export all matching recommendations as CSV or JSON (no pagination — full dump)."""
    q = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.workspace_id == member.workspace_id,
    )
    if status:
        q = q.filter(FinOpsRecommendation.status == status)
    if provider:
        q = q.filter(FinOpsRecommendation.provider == provider)
    if severity:
        q = q.filter(FinOpsRecommendation.severity == severity)
    recs = q.order_by(FinOpsRecommendation.estimated_saving_monthly.desc()).all()

    if format == "json":
        return [_rec_to_dict(r) for r in recs]

    # CSV export
    from datetime import date as _date
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Provider", "Recurso", "Tipo de Recurso", "Região",
        "Recomendação", "Severidade", "Economia Estimada/mês (USD)",
        "Custo Atual/mês (USD)", "Status", "Detectado Em",
    ])
    for r in recs:
        writer.writerow([
            str(r.id),
            r.provider,
            r.resource_name or r.resource_id,
            r.resource_type,
            r.region or "",
            r.recommendation_type,
            r.severity,
            f"{r.estimated_saving_monthly:.2f}" if r.estimated_saving_monthly is not None else "",
            f"{r.current_monthly_cost:.2f}" if r.current_monthly_cost is not None else "",
            r.status,
            r.detected_at.isoformat() if r.detected_at else "",
        ])
    output.seek(0)
    filename = f"finops-recomendacoes-{_date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@ws_router.post("/recommendations/{rec_id}/request-approval", status_code=201)
def request_recommendation_approval(
    rec_id: UUID,
    member: MemberContext = Depends(require_permission("finops.execute")),
    db: Session = Depends(get_db),
):
    """
    Create an ApprovalRequest for a high-impact recommendation.
    Called by the frontend when the user clicks 'Solicitar Aprovação'.
    """
    plan = _get_org_plan(member, db)
    _require_plan(plan, "standard", "Solicitar aprovação")

    rec = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.id == rec_id,
        FinOpsRecommendation.workspace_id == member.workspace_id,
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recomendação não encontrada.")
    if rec.status != "pending":
        raise HTTPException(status_code=400, detail=f"Status atual é '{rec.status}', não pode ser solicitada.")

    from app.services.approval_service import create_approval

    approval = create_approval(
        db=db,
        workspace_id=member.workspace_id,
        requester_id=member.user.id,
        action_type="apply_recommendation",
        action_payload={
            "action_type": "apply_recommendation",
            "recommendation_id": str(rec.id),
            "provider": rec.provider,
            "resource_id": rec.resource_id,
            "resource_name": rec.resource_name,
            "resource_type": rec.resource_type,
            "recommendation_type": rec.recommendation_type,
            "severity": rec.severity,
            "estimated_saving_monthly": rec.estimated_saving_monthly,
            "reasoning": rec.reasoning,
        },
    )

    log_activity(
        db=db, user=member.user,
        action="finops.request_approval",
        resource_type=rec.resource_type,
        resource_id=rec.resource_id,
        resource_name=rec.resource_name,
    )

    return {"approval_id": str(approval.id), "status": "pending"}


@ws_router.post("/recommendations/{rec_id}/apply", status_code=200)
def apply_recommendation(
    rec_id: UUID,
    member: MemberContext = Depends(require_permission("finops.execute")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "standard", "Aplicar recomendações")

    rec = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.id == rec_id,
        FinOpsRecommendation.workspace_id == member.workspace_id,
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recomendação não encontrada.")
    if rec.status != "pending":
        raise HTTPException(status_code=400, detail=f"Status atual é '{rec.status}', não pode ser aplicada.")

    # Handle schedule type separately (no cloud API call needed — just create ScheduledActions)
    if rec.recommendation_type == "schedule":
        from app.services.scheduler_service import register_schedule
        spec = rec.recommended_spec or {}
        created_ids = []
        for action in ("start", "stop"):
            time_key = "suggested_start" if action == "start" else "suggested_stop"
            schedule_time = spec.get(time_key, "08:00" if action == "start" else "19:00")
            s = ScheduledAction(
                workspace_id=member.workspace_id,
                provider=rec.provider,
                resource_id=rec.resource_id,
                resource_name=rec.resource_name,
                resource_type=rec.resource_type,
                action=action,
                schedule_type=spec.get("schedule_type", "weekdays"),
                schedule_time=schedule_time,
                timezone=spec.get("timezone", "America/Sao_Paulo"),
                is_enabled=True,
                created_by=member.user.id,
                created_at=datetime.utcnow(),
            )
            db.add(s)
            db.flush()
            register_schedule(s)
            created_ids.append(str(s.id))

        rec.status = "applied"
        rec.applied_at = datetime.utcnow()
        rec.applied_by = member.user.id

        finops_action = FinOpsAction(
            workspace_id=member.workspace_id,
            recommendation_id=rec.id,
            action_type="schedule",
            provider=rec.provider,
            resource_id=rec.resource_id,
            resource_name=rec.resource_name,
            resource_type=rec.resource_type,
            estimated_saving=rec.estimated_saving_monthly,
            status="executed",
            executed_by=member.user.id,
            rollback_data={"scheduled_action_ids": created_ids},
        )
        db.add(finops_action)
        db.commit()
        db.refresh(finops_action)

        log_activity(
            db=db, user=member.user,
            action="finops.schedule_recommendation",
            resource_type=rec.resource_type,
            resource_id=rec.resource_id,
            resource_name=rec.resource_name,
            provider=rec.provider,
            status="executed",
            detail=json.dumps({"saving_monthly": rec.estimated_saving_monthly, "schedules": created_ids}),
            organization_id=member.organization_id,
            workspace_id=member.workspace_id,
        )
        return {"action": _action_to_dict(finops_action), "recommendation": _rec_to_dict(rec)}

    # Build scanner for the right provider
    rollback_data: dict = {}
    error_msg: Optional[str] = None
    action_status = "executed"

    try:
        if rec.provider == "aws":
            scanner = _get_aws_scanner(
                member.workspace_id, db,
                account_id=str(rec.cloud_account_id) if rec.cloud_account_id else None,
            )
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta AWS configurada.")
            rollback_data = _apply_aws(rec, scanner)

        elif rec.provider == "azure":
            scanner = _get_azure_scanner(
                member.workspace_id, db,
                account_id=str(rec.cloud_account_id) if rec.cloud_account_id else None,
            )
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta Azure configurada.")
            rollback_data = _apply_azure(rec, scanner)

        elif rec.provider == "gcp":
            scanner = _get_gcp_scanner(
                member.workspace_id, db,
                account_id=str(rec.cloud_account_id) if rec.cloud_account_id else None,
            )
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta GCP configurada.")
            rollback_data = _apply_gcp(rec, scanner)

        else:
            raise HTTPException(status_code=400, detail=f"Provider '{rec.provider}' não suportado.")

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error applying finops rec {rec_id}: {exc}")
        error_msg = str(exc)
        action_status = "failed"
        rec.status = "failed"
        db.commit()

    if action_status == "executed":
        rec.status = "applied"
        rec.applied_at = datetime.utcnow()
        rec.applied_by = member.user.id

    # Record action
    finops_action = FinOpsAction(
        workspace_id=member.workspace_id,
        recommendation_id=rec.id,
        action_type=rec.recommendation_type,
        provider=rec.provider,
        resource_id=rec.resource_id,
        resource_name=rec.resource_name,
        resource_type=rec.resource_type,
        estimated_saving=rec.estimated_saving_monthly,
        status=action_status,
        executed_by=member.user.id,
        rollback_data=rollback_data if rollback_data else None,
        error_message=error_msg,
    )
    db.add(finops_action)
    db.commit()
    db.refresh(finops_action)

    log_activity(
        db=db, user=member.user,
        action="finops.apply_recommendation",
        resource_type=rec.resource_type,
        resource_id=rec.resource_id,
        resource_name=rec.resource_name,
        provider=rec.provider,
        status=action_status,
        detail=json.dumps({
            "saving_monthly": rec.estimated_saving_monthly,
            "type": rec.recommendation_type,
            "severity": rec.severity,
            "error": error_msg,
        }),
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )

    return {
        "action": _action_to_dict(finops_action),
        "recommendation": _rec_to_dict(rec),
    }


@ws_router.post("/recommendations/{rec_id}/dismiss", status_code=200)
async def dismiss_recommendation(
    rec_id: UUID,
    payload: DismissRequest = None,
    member: MemberContext = Depends(require_permission("finops.recommend")),
    db: Session = Depends(get_db),
):
    rec = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.id == rec_id,
        FinOpsRecommendation.workspace_id == member.workspace_id,
        FinOpsRecommendation.status == "pending",
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recomendação não encontrada ou já processada.")

    rec.status = "dismissed"
    db.commit()

    log_activity(
        db=db, user=member.user,
        action="finops.dismiss_recommendation",
        resource_type=rec.resource_type,
        resource_id=rec.resource_id,
        resource_name=rec.resource_name,
        provider=rec.provider,
        status="success",
        detail=payload.reason if payload else None,
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    return _rec_to_dict(rec)


# ── Bulk Actions ───────────────────────────────────────────────────────────────


@ws_router.post("/recommendations/bulk-dismiss", status_code=200)
async def bulk_dismiss_recommendations(
    payload: BulkDismissRequest,
    member: MemberContext = Depends(require_permission("finops.execute")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "standard", "Bulk dismiss")

    dismissed = 0
    not_found: List[str] = []
    for rec_id in payload.rec_ids:
        rec = db.query(FinOpsRecommendation).filter(
            FinOpsRecommendation.id == rec_id,
            FinOpsRecommendation.workspace_id == member.workspace_id,
            FinOpsRecommendation.status == "pending",
        ).first()
        if not rec:
            not_found.append(rec_id)
            continue
        rec.status = "dismissed"
        dismissed += 1
        log_activity(
            db=db, user=member.user,
            action="finops.dismiss_recommendation",
            resource_type=rec.resource_type,
            resource_id=rec.resource_id,
            resource_name=rec.resource_name,
            provider=rec.provider,
            status="success",
            detail=payload.reason or None,
            organization_id=member.organization_id,
            workspace_id=member.workspace_id,
        )
    db.commit()
    return {"dismissed": dismissed, "not_found": not_found}


@ws_router.post("/recommendations/bulk-apply", status_code=200)
def bulk_apply_recommendations(
    payload: BulkApplyRequest,
    member: MemberContext = Depends(require_permission("finops.execute")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "standard", "Bulk apply")

    applied = 0
    failed: List[dict] = []
    for rec_id in payload.rec_ids:
        rec = db.query(FinOpsRecommendation).filter(
            FinOpsRecommendation.id == rec_id,
            FinOpsRecommendation.workspace_id == member.workspace_id,
            FinOpsRecommendation.status == "pending",
        ).first()
        if not rec:
            failed.append({"id": rec_id, "error": "Recomendação não encontrada ou já processada."})
            continue
        try:
            _apply_recommendation_logic(rec, member, db)
            applied += 1
        except Exception as exc:
            failed.append({"id": rec_id, "error": str(exc)[:200]})
    return {"applied": applied, "failed": failed}
