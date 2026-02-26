"""
Webhook management API (workspace-scoped).

Endpoints:
  GET    /webhooks                           — list webhooks + supported events
  POST   /webhooks                           — create webhook
  PUT    /webhooks/{webhook_id}              — update webhook
  DELETE /webhooks/{webhook_id}              — delete webhook
  POST   /webhooks/{webhook_id}/test         — send test ping
  POST   /webhooks/{webhook_id}/regenerate-secret — rotate secret
  GET    /webhooks/{webhook_id}/deliveries   — delivery history (paginated)
"""
import secrets
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.db_models import WebhookEndpoint, WebhookDelivery
from app.core.dependencies import require_permission
from app.core.auth_context import MemberContext
from app.services.webhook_service import SUPPORTED_EVENTS, fire_event, _deliver

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/webhooks",
    tags=["Webhooks"],
)

_MAX_WEBHOOKS_PER_WORKSPACE = 10


# ── Schemas ───────────────────────────────────────────────────────────────────


class WebhookCreate(BaseModel):
    name: str
    url: str
    events: List[str]
    is_active: bool = True


class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _wh_dict(wh: WebhookEndpoint) -> dict:
    return {
        "id":         str(wh.id),
        "name":       wh.name,
        "url":        wh.url,
        "events":     wh.events or [],
        "is_active":  wh.is_active,
        "secret":     wh.secret,
        "created_at": wh.created_at.isoformat() if wh.created_at else None,
    }


def _validate_events(events: List[str]) -> None:
    invalid = [e for e in events if e not in SUPPORTED_EVENTS]
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Eventos não suportados: {', '.join(invalid)}. "
                   f"Suportados: {', '.join(sorted(SUPPORTED_EVENTS))}",
        )


def _get_or_404(db: Session, webhook_id: str, workspace_id) -> WebhookEndpoint:
    wh = db.query(WebhookEndpoint).filter(
        WebhookEndpoint.id == webhook_id,
        WebhookEndpoint.workspace_id == workspace_id,
    ).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook não encontrado")
    return wh


# ── Endpoints ─────────────────────────────────────────────────────────────────


@ws_router.get("")
def list_webhooks(
    member: MemberContext = Depends(require_permission("webhooks.view")),
    db: Session = Depends(get_db),
):
    """List all webhooks for this workspace and the supported event types."""
    webhooks = (
        db.query(WebhookEndpoint)
        .filter(WebhookEndpoint.workspace_id == member.workspace_id)
        .order_by(WebhookEndpoint.created_at.desc())
        .all()
    )
    return {
        "webhooks":         [_wh_dict(wh) for wh in webhooks],
        "supported_events": sorted(SUPPORTED_EVENTS - {"test.ping"}),
    }


@ws_router.post("", status_code=201)
def create_webhook(
    payload: WebhookCreate,
    member: MemberContext = Depends(require_permission("webhooks.manage")),
    db: Session = Depends(get_db),
):
    """Create a new webhook endpoint."""
    _validate_events(payload.events)

    count = db.query(WebhookEndpoint).filter(
        WebhookEndpoint.workspace_id == member.workspace_id,
    ).count()
    if count >= _MAX_WEBHOOKS_PER_WORKSPACE:
        raise HTTPException(
            status_code=400,
            detail=f"Limite de {_MAX_WEBHOOKS_PER_WORKSPACE} webhooks por workspace atingido.",
        )

    wh = WebhookEndpoint(
        workspace_id=member.workspace_id,
        created_by=member.user.id,
        name=payload.name,
        url=payload.url,
        events=payload.events,
        secret=secrets.token_hex(32),
        is_active=payload.is_active,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return _wh_dict(wh)


@ws_router.put("/{webhook_id}")
def update_webhook(
    webhook_id: str,
    payload: WebhookUpdate,
    member: MemberContext = Depends(require_permission("webhooks.manage")),
    db: Session = Depends(get_db),
):
    """Update name, URL, events, or active state."""
    wh = _get_or_404(db, webhook_id, member.workspace_id)

    if payload.name is not None:
        wh.name = payload.name
    if payload.url is not None:
        wh.url = payload.url
    if payload.events is not None:
        _validate_events(payload.events)
        wh.events = payload.events
    if payload.is_active is not None:
        wh.is_active = payload.is_active

    db.commit()
    db.refresh(wh)
    return _wh_dict(wh)


@ws_router.delete("/{webhook_id}", status_code=204)
def delete_webhook(
    webhook_id: str,
    member: MemberContext = Depends(require_permission("webhooks.manage")),
    db: Session = Depends(get_db),
):
    """Delete webhook and all its delivery history."""
    wh = _get_or_404(db, webhook_id, member.workspace_id)
    db.delete(wh)
    db.commit()
    return None


@ws_router.post("/{webhook_id}/test")
def test_webhook(
    webhook_id: str,
    member: MemberContext = Depends(require_permission("webhooks.manage")),
    db: Session = Depends(get_db),
):
    """Send a test.ping event to the webhook URL and return the delivery result."""
    wh = _get_or_404(db, webhook_id, member.workspace_id)

    _deliver(db, wh, "test.ping", {
        "message": "Isso é um teste de webhook do CloudAtlas.",
        "triggered_by": member.user.email,
    })

    last = (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.webhook_id == wh.id)
        .order_by(WebhookDelivery.created_at.desc())
        .first()
    )
    return {
        "status":      last.status if last else "unknown",
        "http_status": last.http_status if last else None,
        "response":    last.response_body if last else None,
    }


@ws_router.post("/{webhook_id}/regenerate-secret")
def regenerate_secret(
    webhook_id: str,
    member: MemberContext = Depends(require_permission("webhooks.manage")),
    db: Session = Depends(get_db),
):
    """Rotate the signing secret for a webhook."""
    wh = _get_or_404(db, webhook_id, member.workspace_id)
    wh.secret = secrets.token_hex(32)
    db.commit()
    db.refresh(wh)
    return {"secret": wh.secret}


@ws_router.get("/{webhook_id}/deliveries")
def list_deliveries(
    webhook_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    member: MemberContext = Depends(require_permission("webhooks.view")),
    db: Session = Depends(get_db),
):
    """Paginated delivery history for a webhook."""
    wh = _get_or_404(db, webhook_id, member.workspace_id)

    total = db.query(WebhookDelivery).filter(WebhookDelivery.webhook_id == wh.id).count()
    deliveries = (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.webhook_id == wh.id)
        .order_by(WebhookDelivery.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    import math
    pages = math.ceil(total / page_size) if total else 1
    return {
        "items": [
            {
                "id":            str(d.id),
                "event_type":    d.event_type,
                "status":        d.status,
                "http_status":   d.http_status,
                "response_body": d.response_body,
                "attempt_count": d.attempt_count,
                "delivered_at":  d.delivered_at.isoformat() if d.delivered_at else None,
                "created_at":    d.created_at.isoformat() if d.created_at else None,
            }
            for d in deliveries
        ],
        "total":     total,
        "page":      page,
        "pages":     pages,
        "page_size": page_size,
    }
