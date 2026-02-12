from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid

from app.models.db_models import User, CostAlert, AlertEvent
from app.core.dependencies import get_current_user
from app.services.log_service import log_activity
from app.database import get_db

router = APIRouter(prefix="/alerts", tags=["Alerts"])


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


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_alerts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all cost alerts for the current user."""
    alerts = db.query(CostAlert).filter(CostAlert.user_id == current_user.id).order_by(CostAlert.created_at.desc()).all()
    return [alert_to_dict(a) for a in alerts]


@router.post("", status_code=201)
async def create_alert(
    payload: AlertCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new cost alert."""
    alert = CostAlert(
        user_id=current_user.id,
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
    log_activity(db, current_user, 'alert.create', 'Alert',
                 resource_id=str(alert.id), resource_name=alert.name,
                 provider=alert.provider)
    return alert_to_dict(alert)


@router.put("/{alert_id}")
async def update_alert(
    alert_id: str,
    payload: AlertUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing cost alert."""
    alert = db.query(CostAlert).filter(
        CostAlert.id == alert_id,
        CostAlert.user_id == current_user.id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(alert, field, value)
    db.commit()
    db.refresh(alert)
    return alert_to_dict(alert)


@router.delete("/{alert_id}", status_code=204)
async def delete_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a cost alert."""
    alert = db.query(CostAlert).filter(
        CostAlert.id == alert_id,
        CostAlert.user_id == current_user.id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    log_activity(db, current_user, 'alert.delete', 'Alert',
                 resource_id=alert_id, resource_name=alert.name,
                 provider=alert.provider)
    db.delete(alert)
    db.commit()
    return None


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/events")
async def get_events(
    unread_only: bool = Query(False),
    limit: int = Query(50, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get alert events for the current user."""
    # Join with CostAlert to filter by user
    query = (
        db.query(AlertEvent)
        .join(CostAlert, AlertEvent.alert_id == CostAlert.id)
        .filter(CostAlert.user_id == current_user.id)
    )
    if unread_only:
        query = query.filter(AlertEvent.is_read == False)
    events = query.order_by(AlertEvent.triggered_at.desc()).limit(limit).all()
    return [event_to_dict(e) for e in events]


@router.post("/events/{event_id}/read")
async def mark_event_read(
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark an alert event as read."""
    event = (
        db.query(AlertEvent)
        .join(CostAlert, AlertEvent.alert_id == CostAlert.id)
        .filter(AlertEvent.id == event_id, CostAlert.user_id == current_user.id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    event.is_read = True
    db.commit()
    return {'success': True}


@router.post("/events/read-all")
async def mark_all_events_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all unread events as read for the current user."""
    (
        db.query(AlertEvent)
        .join(CostAlert, AlertEvent.alert_id == CostAlert.id)
        .filter(CostAlert.user_id == current_user.id, AlertEvent.is_read == False)
        .update({AlertEvent.is_read: True}, synchronize_session=False)
    )
    db.commit()
    return {'success': True}


# ── Evaluate ──────────────────────────────────────────────────────────────────

@router.post("/evaluate")
async def evaluate_alerts(
    payload: EvaluateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Evaluate active alerts against current cost values.
    Called by the frontend after fetching cost data.
    Creates AlertEvent records when thresholds are exceeded.
    """
    triggered = []

    alerts = db.query(CostAlert).filter(
        CostAlert.user_id == current_user.id,
        CostAlert.is_active == True,
        CostAlert.period == payload.period,
    ).all()

    for alert in alerts:
        # Filter by provider
        if alert.provider != 'all' and alert.provider != payload.provider:
            continue
        # Filter by service (None means all services)
        if alert.service and alert.service != payload.service:
            continue

        exceeded = False
        if alert.threshold_type == 'fixed':
            exceeded = payload.current_value >= alert.threshold_value
        elif alert.threshold_type == 'percentage':
            # percentage alerts need comparison baseline — skip for now
            # (future: compare with previous period)
            exceeded = False

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
