"""
Notification helper — creates AlertEvent rows for system events
(anomaly detected, budget threshold, scheduled action, finops scan).

These events are surfaced in the header bell in the same way cost alerts are.
"""
import logging

logger = logging.getLogger(__name__)


def push_notification(
    db,
    workspace_id,
    notification_type: str,
    message: str,
    link_to: str = None,
) -> None:
    """
    Create an in-app notification (AlertEvent) for a workspace.
    Non-fatal — any DB error is logged and swallowed.

    notification_type values:
        'cost_alert'   — triggered by a CostAlert threshold (legacy, set by alerts.py)
        'anomaly'      — FinOps cost anomaly detected
        'budget'       — FinOps budget threshold crossed
        'schedule'     — Scheduled resource action executed or failed
        'finops_scan'  — FinOps scan completed
    """
    try:
        from app.models.db_models import AlertEvent
        event = AlertEvent(
            workspace_id=workspace_id,
            alert_id=None,
            notification_type=notification_type,
            message=message,
            link_to=link_to,
            current_value=None,
            threshold_value=None,
        )
        db.add(event)
        db.commit()
    except Exception as exc:
        logger.warning("push_notification failed (non-fatal): %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
