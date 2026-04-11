"""
Approval Flow API — workspace-scoped endpoints for managing ApprovalRequests.

High-impact FinOps actions (severity=high, type=delete/stop/right_size) are
gated behind a human review.  Admins/owners approve or reject; on approval
the stored action_payload is used to execute the action automatically.
"""
import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.core.permissions import ROLE_PERMISSIONS
from app.database import get_db
from app.models.db_models import ApprovalRequest, FinOpsRecommendation, OrganizationMember
from app.services.approval_service import (
    approval_to_dict,
    create_approval,
    get_pending_count,
    resolve_approval,
)
from app.services.log_service import log_activity

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/approvals",
    tags=["Approvals (workspace)"],
)

# ── Schemas ───────────────────────────────────────────────────────────────────


class ResolveRequest(BaseModel):
    notes: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

_APPROVE_PERMISSION = "resources.manage"


def _is_approver(member: MemberContext, db: Session) -> bool:
    """Return True if the member's effective role has the approve permission.
    Uses the workspace effective role (role_override) when available,
    falling back to the org-level role.
    """
    role_perms = ROLE_PERMISSIONS.get(member.role, set())
    return _APPROVE_PERMISSION in role_perms


# ── Endpoints ────────────────────────────────────────────────────────────────


@ws_router.get("")
def list_approvals(
    status: Optional[str] = Query(None, description="pending|approved|rejected|cancelled"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    q = db.query(ApprovalRequest).filter(
        ApprovalRequest.workspace_id == member.workspace_id
    )
    if status:
        q = q.filter(ApprovalRequest.status == status)

    total = q.count()
    items = (
        q.order_by(ApprovalRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [approval_to_dict(a) for a in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@ws_router.get("/count")
def pending_count(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    return {"pending": get_pending_count(db, member.workspace_id)}


@ws_router.get("/{approval_id}")
def get_approval(
    approval_id: UUID,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    a = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == approval_id,
        ApprovalRequest.workspace_id == member.workspace_id,
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Aprovação não encontrada.")
    return approval_to_dict(a)


@ws_router.post("/{approval_id}/approve")
def approve_request(
    approval_id: UUID,
    body: ResolveRequest,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    if not _is_approver(member, db):
        raise HTTPException(status_code=403, detail="Apenas admins e owners podem aprovar solicitações.")

    approval = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == approval_id,
        ApprovalRequest.workspace_id == member.workspace_id,
    ).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Aprovação não encontrada.")

    resolved = resolve_approval(db, approval_id, member.user.id, approved=True, notes=body.notes)

    # Execute the action stored in the payload
    payload = resolved.action_payload
    execution_result = _execute_payload(payload, member, db)

    log_activity(
        db=db, user=member.user,
        action="approval.approved",
        resource_type="ApprovalRequest",
        resource_id=str(approval_id),
        resource_name=payload.get("resource_name", ""),
    )

    return {**approval_to_dict(resolved), "execution": execution_result}


@ws_router.post("/{approval_id}/reject")
def reject_request(
    approval_id: UUID,
    body: ResolveRequest,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    if not _is_approver(member, db):
        raise HTTPException(status_code=403, detail="Apenas admins e owners podem rejeitar solicitações.")

    approval = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == approval_id,
        ApprovalRequest.workspace_id == member.workspace_id,
    ).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Aprovação não encontrada.")

    resolved = resolve_approval(db, approval_id, member.user.id, approved=False, notes=body.notes)

    log_activity(
        db=db, user=member.user,
        action="approval.rejected",
        resource_type="ApprovalRequest",
        resource_id=str(approval_id),
        resource_name=approval.action_payload.get("resource_name", ""),
    )

    return approval_to_dict(resolved)


@ws_router.delete("/{approval_id}")
def cancel_approval(
    approval_id: UUID,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    a = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == approval_id,
        ApprovalRequest.workspace_id == member.workspace_id,
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Aprovação não encontrada.")
    if a.status != "pending":
        raise HTTPException(status_code=400, detail="Só é possível cancelar aprovações pendentes.")

    # Requester can cancel their own; admins/owners can cancel any
    is_own = str(a.requester_id) == str(member.user.id)
    if not is_own and not _is_approver(member, db):
        raise HTTPException(status_code=403, detail="Sem permissão para cancelar esta solicitação.")

    a.status = "cancelled"
    a.resolved_at = datetime.utcnow()
    a.resolved_by = member.user.id
    db.commit()

    return {"cancelled": True, "id": str(approval_id)}


# ── Action executor ───────────────────────────────────────────────────────────


def _execute_payload(payload: dict, member: MemberContext, db: Session) -> dict:
    """
    Execute the action stored in an approved ApprovalRequest payload.
    Currently supports: apply_recommendation.
    """
    action_type = payload.get("action_type", "")

    if action_type == "apply_recommendation":
        rec_id = payload.get("recommendation_id")
        if not rec_id:
            return {"status": "error", "detail": "recommendation_id ausente no payload."}
        try:
            from app.api.finops import _apply_recommendation_logic

            rec = db.query(FinOpsRecommendation).filter(
                FinOpsRecommendation.id == rec_id,
                FinOpsRecommendation.workspace_id == member.workspace_id,
            ).first()
            if not rec:
                return {"status": "error", "detail": "Recomendação não encontrada."}
            if rec.status != "pending":
                return {"status": "skipped", "detail": f"Recomendação já está '{rec.status}'."}

            _apply_recommendation_logic(rec, member, db)
            return {"status": "success", "detail": "Recomendação aplicada com sucesso."}
        except Exception as exc:
            logger.exception("Error executing approved payload: %s", exc)
            return {"status": "error", "detail": str(exc)[:300]}

    return {"status": "skipped", "detail": f"Tipo de ação '{action_type}' não executável automaticamente."}
