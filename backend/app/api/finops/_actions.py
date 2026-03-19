"""FinOps Actions endpoints (list actions, rollback)."""
import math
import logging
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import FinOpsAction, FinOpsRecommendation
from app.services.log_service import log_activity

from . import ws_router
from ._helpers import (
    _action_to_dict,
    _get_aws_scanner,
    _get_azure_scanner,
    _get_gcp_scanner,
    _get_org_plan,
    _require_plan,
)
from ._actions_helpers import _rollback_aws, _rollback_azure, _rollback_gcp

logger = logging.getLogger(__name__)


@ws_router.get("/actions")
async def list_actions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    q = db.query(FinOpsAction).filter(FinOpsAction.workspace_id == member.workspace_id)
    total = q.count()
    actions = q.order_by(FinOpsAction.executed_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [_action_to_dict(a) for a in actions],
        "total": total,
        "page": page,
        "pages": math.ceil(total / page_size) if total else 1,
        "page_size": page_size,
    }


@ws_router.post("/actions/{action_id}/rollback", status_code=200)
def rollback_action(
    action_id: UUID,
    member: MemberContext = Depends(require_permission("finops.execute")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Desfazer ação")

    action = db.query(FinOpsAction).filter(
        FinOpsAction.id == action_id,
        FinOpsAction.workspace_id == member.workspace_id,
        FinOpsAction.status == "executed",
    ).first()
    if not action:
        raise HTTPException(status_code=404, detail="Ação não encontrada ou não pode ser desfeita.")

    if not action.rollback_data:
        raise HTTPException(status_code=400, detail="Esta ação não possui rollback disponível.")

    if action.executed_at and (datetime.utcnow() - action.executed_at) >= timedelta(hours=24):
        raise HTTPException(status_code=400, detail="Janela de rollback de 24h expirada.")

    try:
        if action.provider == "aws":
            scanner = _get_aws_scanner(member.workspace_id, db)
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta AWS configurada.")
            _rollback_aws(action, scanner)
        elif action.provider == "azure":
            scanner = _get_azure_scanner(member.workspace_id, db)
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta Azure configurada.")
            _rollback_azure(action, scanner)
        elif action.provider == "gcp":
            scanner = _get_gcp_scanner(member.workspace_id, db)
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta GCP configurada.")
            _rollback_gcp(action, scanner)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Rollback falhou: {exc}")

    action.status = "rolled_back"
    # mark rec back to pending so it shows up again
    if action.recommendation_id:
        rec = db.query(FinOpsRecommendation).filter(
            FinOpsRecommendation.id == action.recommendation_id
        ).first()
        if rec:
            rec.status = "pending"
            rec.applied_at = None
            rec.applied_by = None

    db.commit()

    log_activity(
        db=db, user=member.user,
        action="finops.rollback",
        resource_type=action.resource_type,
        resource_id=action.resource_id,
        resource_name=action.resource_name,
        provider=action.provider,
        status="success",
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    return _action_to_dict(action)
