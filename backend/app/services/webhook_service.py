"""
Webhook delivery service.

Call fire_event() from any endpoint or background job to notify registered
webhook URLs about events in the system.
"""
import hmac
import hashlib
import json
import logging
import secrets
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# All event types supported by the system
SUPPORTED_EVENTS = frozenset({
    "alert.triggered",
    "resource.started",
    "resource.stopped",
    "resource.failed",
    "finops.scan.completed",
    "billing.paid",
    "org.member.added",
    "schedule.executed",
    "schedule.failed",
    "test.ping",
})


def _sign_payload(secret: str, payload_bytes: bytes) -> str:
    """Return HMAC-SHA256 hex digest for payload verification."""
    return hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()


def fire_event(db, workspace_id, event_type: str, payload: dict) -> None:
    """
    Deliver a webhook event to all active endpoints subscribed to that event.
    Non-fatal: errors are logged but never propagate to the caller.
    """
    try:
        from app.models.db_models import WebhookEndpoint

        endpoints = db.query(WebhookEndpoint).filter(
            WebhookEndpoint.workspace_id == workspace_id,
            WebhookEndpoint.is_active == True,
        ).all()

        for ep in endpoints:
            if event_type in (ep.events or []):
                _deliver(db, ep, event_type, payload)

    except Exception as exc:
        logger.error(
            "webhook fire_event failed (workspace=%s event=%s): %s",
            workspace_id, event_type, exc,
        )


def _deliver(db, ep, event_type: str, payload_dict: dict) -> None:
    """POST payload to endpoint URL and record the delivery attempt."""
    from app.models.db_models import WebhookDelivery

    body = {
        "event": event_type,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "workspace_id": str(ep.workspace_id),
        "data": payload_dict,
    }
    body_bytes = json.dumps(body, default=str).encode()
    signature = _sign_payload(ep.secret, body_bytes)

    delivery = WebhookDelivery(
        webhook_id=ep.id,
        event_type=event_type,
        payload=body,
        status="pending",
        attempt_count=1,
    )
    db.add(delivery)
    db.commit()
    db.refresh(delivery)

    try:
        resp = httpx.post(
            ep.url,
            content=body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-CloudAtlas-Event": event_type,
                "X-CloudAtlas-Signature": f"sha256={signature}",
                "User-Agent": "CloudAtlas-Webhooks/1.0",
            },
            timeout=10.0,
            follow_redirects=True,
        )
        delivery.status = "delivered" if resp.is_success else "failed"
        delivery.http_status = resp.status_code
        delivery.response_body = (resp.text or "")[:500]
        delivery.delivered_at = datetime.utcnow()

    except Exception as exc:
        delivery.status = "failed"
        delivery.response_body = str(exc)[:500]
        delivery.delivered_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as exc:
        logger.error("webhook delivery record commit failed: %s", exc)
