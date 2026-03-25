"""
Webhook delivery service.

Call fire_event() from any endpoint or background job to notify registered
webhook URLs about events in the system.

Retry policy: failed deliveries are retried up to MAX_ATTEMPTS times with
exponential backoff (10s, 40s, 90s).  retry_failed_deliveries() should be
called periodically (e.g. every 30s via APScheduler or a cron loop).
"""
import hmac
import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 4           # 1 original + 3 retries
BACKOFF_BASE_SECONDS = 10  # delay = base * attempt^2  →  10s, 40s, 90s

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
    "budget.threshold_crossed",
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


def _deliver(db, ep, event_type: str, payload_dict: dict, delivery=None) -> None:
    """POST payload to endpoint URL and record the delivery attempt.

    If `delivery` is provided (retry), updates the existing record instead of
    creating a new one.
    """
    from app.models.db_models import WebhookDelivery

    body = {
        "event": event_type,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "workspace_id": str(ep.workspace_id),
        "data": payload_dict,
    }
    body_bytes = json.dumps(body, default=str).encode()
    signature = _sign_payload(ep.secret, body_bytes)

    is_retry = delivery is not None
    if not is_retry:
        delivery = WebhookDelivery(
            webhook_id=ep.id,
            event_type=event_type,
            payload=body,
            status="pending",
            attempt_count=0,
        )
        db.add(delivery)
        db.commit()
        db.refresh(delivery)

    delivery.attempt_count += 1

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
            follow_redirects=False,
        )

        if resp.is_success:
            delivery.status = "delivered"
            delivery.next_retry_at = None
        else:
            _handle_failure(delivery, f"HTTP {resp.status_code}")
            delivery.http_status = resp.status_code
            delivery.response_body = (resp.text or "")[:500]

        if resp.is_success:
            delivery.http_status = resp.status_code
            delivery.response_body = (resp.text or "")[:500]

        delivery.delivered_at = datetime.utcnow()

    except Exception as exc:
        _handle_failure(delivery, str(exc)[:500])
        delivery.delivered_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as exc:
        logger.error("webhook delivery record commit failed: %s", exc)


def _handle_failure(delivery, error_msg: str) -> None:
    """Set delivery status and schedule retry if attempts remain."""
    delivery.response_body = error_msg
    if delivery.attempt_count < MAX_ATTEMPTS:
        delay = BACKOFF_BASE_SECONDS * (delivery.attempt_count ** 2)
        delivery.status = "retrying"
        delivery.next_retry_at = datetime.utcnow() + timedelta(seconds=delay)
        logger.warning(
            "Webhook delivery %s failed (attempt %d/%d), retry in %ds",
            delivery.id, delivery.attempt_count, MAX_ATTEMPTS, delay,
        )
    else:
        delivery.status = "failed"
        delivery.next_retry_at = None
        logger.error(
            "Webhook delivery %s permanently failed after %d attempts: %s",
            delivery.id, delivery.attempt_count, error_msg,
        )


def retry_failed_deliveries(db) -> int:
    """Retry all webhook deliveries that are due.

    Returns the number of retried deliveries. Call this from a scheduler
    job every ~30 seconds.
    """
    from app.models.db_models import WebhookDelivery, WebhookEndpoint

    now = datetime.utcnow()
    pending = (
        db.query(WebhookDelivery)
        .filter(
            WebhookDelivery.status == "retrying",
            WebhookDelivery.next_retry_at <= now,
        )
        .limit(50)  # process in batches to avoid long transactions
        .all()
    )

    retried = 0
    for delivery in pending:
        ep = db.query(WebhookEndpoint).filter(
            WebhookEndpoint.id == delivery.webhook_id,
            WebhookEndpoint.is_active == True,
        ).first()
        if not ep:
            delivery.status = "failed"
            delivery.response_body = "Endpoint desativado ou removido"
            delivery.next_retry_at = None
            db.commit()
            continue

        _deliver(db, ep, delivery.event_type, delivery.payload.get("data", {}), delivery=delivery)
        retried += 1

    return retried
