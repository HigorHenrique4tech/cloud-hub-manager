from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.models.db_models import CostAlert, AlertEvent
from app.core.dependencies import require_permission
from app.core.auth_context import MemberContext
from app.services.log_service import log_activity
from app.database import get_db


# ── Schemas ──────────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    name: str
    provider: str          # 'aws' | 'azure' | 'all'
    service: Optional[str] = None
    threshold_type: str    # 'fixed' | 'percentage'
    threshold_value: float
    period: str            # 'daily' | 'monthly'


class AlertUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    service: Optional[str] = None
    threshold_type: Optional[str] = None
    threshold_value: Optional[float] = None
    period: Optional[str] = None
    is_active: Optional[bool] = None


class EvaluateRequest(BaseModel):
    provider: str          # 'aws' | 'azure' | 'all'
    current_value: float
    service: Optional[str] = None
    period: str = 'monthly'


# ── Helper ────────────────────────────────────────────────────────────────────

def alert_to_dict(alert: CostAlert) -> dict:
    return {
        'id': str(alert.id),
        'name': alert.name,
        'provider': alert.provider,
        'service': alert.service,
        'threshold_type': alert.threshold_type,
        'threshold_value': alert.threshold_value,
        'period': alert.period,
        'is_active': alert.is_active,
        'created_at': alert.created_at.isoformat() if alert.created_at else None,
    }


def event_to_dict(event: AlertEvent) -> dict:
    return {
        'id': str(event.id),
        'alert_id': str(event.alert_id),
        'triggered_at': event.triggered_at.isoformat() if event.triggered_at else None,
        'current_value': event.current_value,
        'threshold_value': event.threshold_value,
        'message': event.message,
        'is_read': event.is_read,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Workspace-scoped router (multi-tenant, RBAC)
# ═══════════════════════════════════════════════════════════════════════════════

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/alerts",
    tags=["Alerts (workspace)"],
)


@ws_router.get("")
async def ws_list_alerts(
    member: MemberContext = Depends(require_permission("alerts.view")),
    db: Session = Depends(get_db),
):
    """List cost alerts for this workspace."""
    alerts = (
        db.query(CostAlert)
        .filter(CostAlert.workspace_id == member.workspace_id)
        .order_by(CostAlert.created_at.desc())
        .all()
    )
    return [alert_to_dict(a) for a in alerts]


@ws_router.post("", status_code=201)
async def ws_create_alert(
    payload: AlertCreate,
    member: MemberContext = Depends(require_permission("alerts.manage")),
    db: Session = Depends(get_db),
):
    """Create a cost alert in this workspace."""
    alert = CostAlert(
        user_id=member.user.id,
        workspace_id=member.workspace_id,
        created_by=member.user.id,
        name=payload.name,
        provider=payload.provider,
        service=payload.service,
        threshold_type=payload.threshold_type,
        threshold_value=payload.threshold_value,
        period=payload.period,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    log_activity(db, member.user, 'alert.create', 'Alert',
                 resource_id=str(alert.id), resource_name=alert.name,
                 provider=alert.provider,
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return alert_to_dict(alert)


@ws_router.put("/{alert_id}")
async def ws_update_alert(
    alert_id: str,
    payload: AlertUpdate,
    member: MemberContext = Depends(require_permission("alerts.manage")),
    db: Session = Depends(get_db),
):
    """Update a cost alert in this workspace."""
    alert = db.query(CostAlert).filter(
        CostAlert.id == alert_id,
        CostAlert.workspace_id == member.workspace_id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(alert, field, value)
    db.commit()
    db.refresh(alert)
    return alert_to_dict(alert)


@ws_router.delete("/{alert_id}", status_code=204)
async def ws_delete_alert(
    alert_id: str,
    member: MemberContext = Depends(require_permission("alerts.manage")),
    db: Session = Depends(get_db),
):
    """Delete a cost alert in this workspace."""
    alert = db.query(CostAlert).filter(
        CostAlert.id == alert_id,
        CostAlert.workspace_id == member.workspace_id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    log_activity(db, member.user, 'alert.delete', 'Alert',
                 resource_id=alert_id, resource_name=alert.name,
                 provider=alert.provider,
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    db.delete(alert)
    db.commit()
    return None


# ── Events (workspace-scoped) ──────────────────────────────────────────────

@ws_router.get("/events")
async def ws_get_events(
    unread_only: bool = Query(False),
    limit: int = Query(50, le=200),
    member: MemberContext = Depends(require_permission("alerts.view")),
    db: Session = Depends(get_db),
):
    """Get alert events for this workspace."""
    query = (
        db.query(AlertEvent)
        .join(CostAlert, AlertEvent.alert_id == CostAlert.id)
        .filter(CostAlert.workspace_id == member.workspace_id)
    )
    if unread_only:
        query = query.filter(AlertEvent.is_read == False)
    events = query.order_by(AlertEvent.triggered_at.desc()).limit(limit).all()
    return [event_to_dict(e) for e in events]


@ws_router.post("/events/{event_id}/read")
async def ws_mark_event_read(
    event_id: str,
    member: MemberContext = Depends(require_permission("alerts.view")),
    db: Session = Depends(get_db),
):
    event = (
        db.query(AlertEvent)
        .join(CostAlert, AlertEvent.alert_id == CostAlert.id)
        .filter(AlertEvent.id == event_id, CostAlert.workspace_id == member.workspace_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    event.is_read = True
    db.commit()
    return {'success': True}


@ws_router.post("/events/read-all")
async def ws_mark_all_events_read(
    member: MemberContext = Depends(require_permission("alerts.view")),
    db: Session = Depends(get_db),
):
    (
        db.query(AlertEvent)
        .join(CostAlert, AlertEvent.alert_id == CostAlert.id)
        .filter(CostAlert.workspace_id == member.workspace_id, AlertEvent.is_read == False)
        .update({AlertEvent.is_read: True}, synchronize_session=False)
    )
    db.commit()
    return {'success': True}


# ── Evaluate (workspace-scoped) ────────────────────────────────────────────

@ws_router.post("/evaluate")
async def ws_evaluate_alerts(
    payload: EvaluateRequest,
    member: MemberContext = Depends(require_permission("alerts.manage")),
    db: Session = Depends(get_db),
):
    """Evaluate workspace alerts against current cost values."""
    triggered = []

    alerts = db.query(CostAlert).filter(
        CostAlert.workspace_id == member.workspace_id,
        CostAlert.is_active == True,
        CostAlert.period == payload.period,
    ).all()

    for alert in alerts:
        if alert.provider != 'all' and alert.provider != payload.provider:
            continue
        if alert.service and alert.service != payload.service:
            continue

        exceeded = False
        if alert.threshold_type == 'fixed':
            exceeded = payload.current_value >= alert.threshold_value

        if exceeded:
            message = (
                f"Alerta '{alert.name}': custo {payload.provider.upper()} de "
                f"${payload.current_value:.2f} atingiu o limite de ${alert.threshold_value:.2f}"
            )
            event = AlertEvent(
                alert_id=alert.id,
                current_value=payload.current_value,
                threshold_value=alert.threshold_value,
                message=message,
            )
            db.add(event)
            triggered.append({'alert_id': str(alert.id), 'message': message})

    db.commit()
    return {'triggered': len(triggered), 'events': triggered}
