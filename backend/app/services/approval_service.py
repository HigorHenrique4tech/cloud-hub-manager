"""
Approval Service — create, resolve and query ApprovalRequests.

High-impact FinOps actions (severity=high, type=delete/stop) are gated
behind an ApprovalRequest before execution.  Admins/owners approve or
reject the request; on approval the caller is responsible for executing
the stored action_payload.
"""
import logging
import uuid
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.db_models import ApprovalRequest, OrganizationMember, User, Workspace

logger = logging.getLogger(__name__)

# Actions that are considered high-impact and require approval
HIGH_IMPACT_REC_TYPES = {"stop", "delete", "right_size"}
HIGH_IMPACT_SEVERITIES = {"high"}


def needs_approval(severity: str, recommendation_type: str) -> bool:
    """Return True if a recommendation requires approval before execution."""
    return (
        severity in HIGH_IMPACT_SEVERITIES
        or recommendation_type in HIGH_IMPACT_REC_TYPES
    )


def create_approval(
    db: Session,
    workspace_id: UUID,
    requester_id: UUID,
    action_type: str,
    action_payload: dict,
) -> ApprovalRequest:
    """
    Create a pending ApprovalRequest and notify workspace admins/owners.
    """
    approval = ApprovalRequest(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        requester_id=requester_id,
        action_type=action_type,
        action_payload=action_payload,
        status="pending",
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)

    # Notify admins/owners
    try:
        from app.services.notification_service import push_notification

        resource_name = action_payload.get("resource_name", "recurso")
        push_notification(
            db, workspace_id, "approval",
            f"Aprovação necessária: {action_type.replace('_', ' ')} em '{resource_name}'",
            link_to=f"/approvals",
        )
    except Exception as exc:
        logger.warning("Could not send approval notification: %s", exc)

    # Email admins/owners of the workspace
    try:
        from app.services.email_service import send_approval_pending_email
        from app.services.branding_service import get_branding_for_workspace

        branding = get_branding_for_workspace(db, workspace_id)
        resource_name = action_payload.get("resource_name", "recurso")
        requester = db.query(User).filter(User.id == requester_id).first()
        requester_name = requester.name or requester.email if requester else "Usuário"

        # Find workspace admins/owners
        ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if ws:
            admins = (
                db.query(OrganizationMember)
                .filter(
                    OrganizationMember.organization_id == ws.organization_id,
                    OrganizationMember.role.in_(["owner", "admin"]),
                )
                .all()
            )
            for m in admins:
                admin_user = db.query(User).filter(User.id == m.user_id).first()
                if admin_user and admin_user.id != requester_id:
                    send_approval_pending_email(
                        to_email=admin_user.email,
                        approver_name=admin_user.name or admin_user.email,
                        requester_name=requester_name,
                        action_type=action_type,
                        resource_name=resource_name,
                        branding=branding,
                    )
    except Exception as exc:
        logger.warning("Could not send approval pending email: %s", exc)

    return approval


def resolve_approval(
    db: Session,
    approval_id: UUID,
    resolver_id: UUID,
    approved: bool,
    notes: Optional[str] = None,
) -> ApprovalRequest:
    """
    Approve or reject an ApprovalRequest.
    Does NOT execute the action — callers must do that after checking status.
    """
    approval = db.query(ApprovalRequest).filter(ApprovalRequest.id == approval_id).first()
    if not approval:
        raise ValueError("Aprovação não encontrada.")
    if approval.status != "pending":
        raise ValueError(f"Aprovação já foi {approval.status}.")

    approval.status = "approved" if approved else "rejected"
    approval.resolved_by = resolver_id
    approval.notes = notes
    approval.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(approval)

    # Notify requester
    try:
        from app.services.notification_service import push_notification

        verb = "aprovada" if approved else "rejeitada"
        resource_name = approval.action_payload.get("resource_name", "recurso")
        push_notification(
            db, approval.workspace_id, "approval",
            f"Sua solicitação para '{resource_name}' foi {verb}.",
            link_to="/approvals",
        )
    except Exception as exc:
        logger.warning("Could not send resolution notification: %s", exc)

    # Email requester about resolution
    try:
        from app.services.email_service import send_approval_resolved_email
        from app.services.branding_service import get_branding_for_workspace

        branding = get_branding_for_workspace(db, approval.workspace_id)
        resource_name = approval.action_payload.get("resource_name", "recurso")
        requester = db.query(User).filter(User.id == approval.requester_id).first()
        resolver = db.query(User).filter(User.id == resolver_id).first()
        if requester:
            send_approval_resolved_email(
                to_email=requester.email,
                requester_name=requester.name or requester.email,
                action_type=approval.action_type,
                resource_name=resource_name,
                approved=approved,
                resolver_name=(resolver.name or resolver.email) if resolver else "Admin",
                notes=notes,
                branding=branding,
            )
    except Exception as exc:
        logger.warning("Could not send approval resolved email: %s", exc)

    return approval


def get_pending_count(db: Session, workspace_id: UUID) -> int:
    return (
        db.query(ApprovalRequest)
        .filter(
            ApprovalRequest.workspace_id == workspace_id,
            ApprovalRequest.status == "pending",
        )
        .count()
    )


def approval_to_dict(a: ApprovalRequest) -> dict:
    return {
        "id": str(a.id),
        "workspace_id": str(a.workspace_id),
        "requester_id": str(a.requester_id) if a.requester_id else None,
        "requester_name": (
            a.requester.name or a.requester.email
            if a.requester else None
        ),
        "resolved_by": str(a.resolved_by) if a.resolved_by else None,
        "resolver_name": (
            a.resolver.name or a.resolver.email
            if a.resolver else None
        ),
        "action_type": a.action_type,
        "action_payload": a.action_payload,
        "status": a.status,
        "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
    }
