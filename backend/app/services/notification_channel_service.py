"""
Notification Channel Service — delivers events to Teams, Telegram, and Email channels.

Drop-in replacement for webhook_service: fire_event() has the same signature.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import requests
from sqlalchemy.orm import Session

from app.models.db_models import NotificationChannel, NotificationDelivery

logger = logging.getLogger(__name__)

CHANNEL_TYPES = ("teams", "telegram", "email")

SUPPORTED_EVENTS = [
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
]

# ── Event label map (PT-BR) ───────────────────────────────────────────────────

_EVENT_LABELS = {
    "alert.triggered":         "Alerta disparado",
    "resource.started":        "Recurso iniciado",
    "resource.stopped":        "Recurso parado",
    "resource.failed":         "Recurso com falha",
    "finops.scan.completed":   "Scan FinOps concluído",
    "billing.paid":            "Fatura paga",
    "org.member.added":        "Membro adicionado",
    "schedule.executed":       "Agenda executada",
    "schedule.failed":         "Agenda falhou",
    "budget.threshold_crossed": "Limite de orçamento atingido",
    "test.ping":               "Teste de conexão",
}

# ── Formatters ────────────────────────────────────────────────────────────────

def _teams_payload(event_type: str, payload: dict) -> dict:
    """Build a Teams MessageCard from an event payload."""
    label = _EVENT_LABELS.get(event_type, event_type)
    facts = []
    for k, v in payload.items():
        if k in ("workspace_id",):
            continue
        facts.append({"name": str(k).replace("_", " ").title(), "value": str(v)})

    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "0076D7",
        "summary": f"Cloud Hub Manager — {label}",
        "sections": [
            {
                "activityTitle": f"☁️ **Cloud Hub Manager**",
                "activitySubtitle": label,
                "facts": facts,
                "markdown": True,
            }
        ],
    }


def _telegram_text(event_type: str, payload: dict) -> str:
    """Build a Telegram HTML message from an event payload."""
    label = _EVENT_LABELS.get(event_type, event_type)
    lines = [f"☁️ <b>Cloud Hub Manager</b>", f"<b>{label}</b>", ""]
    for k, v in payload.items():
        if k in ("workspace_id",):
            continue
        lines.append(f"• <b>{str(k).replace('_', ' ').title()}:</b> {v}")
    return "\n".join(lines)


# ── Delivery ──────────────────────────────────────────────────────────────────

def _deliver_teams(url: str, event_type: str, payload: dict) -> tuple[bool, str | None]:
    try:
        resp = requests.post(url, json=_teams_payload(event_type, payload), timeout=10)
        if resp.status_code < 300:
            return True, None
        return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
    except Exception as exc:
        return False, str(exc)


def _deliver_telegram(bot_token: str, chat_id: str, event_type: str, payload: dict) -> tuple[bool, str | None]:
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        resp = requests.post(url, json={
            "chat_id": chat_id,
            "text": _telegram_text(event_type, payload),
            "parse_mode": "HTML",
        }, timeout=10)
        data = resp.json()
        if data.get("ok"):
            return True, None
        return False, data.get("description", "Unknown error")
    except Exception as exc:
        return False, str(exc)


def _email_html(event_type: str, payload: dict) -> str:
    """Build an HTML email body from an event payload."""
    label = _EVENT_LABELS.get(event_type, event_type)
    rows = ""
    for k, v in payload.items():
        if k in ("workspace_id",):
            continue
        rows += f'<tr><td style="padding:4px 8px;font-weight:600;color:#64748b;font-size:13px;">{str(k).replace("_", " ").title()}</td><td style="padding:4px 8px;color:#334155;font-size:13px;">{v}</td></tr>'

    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#1E6FD9,#0ea5e9);padding:20px;border-radius:10px 10px 0 0;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:16px;">☁️ Cloud Hub Manager</h2>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px;">{label}</p>
      </div>
      <div style="background:#fff;padding:20px;border:1px solid #e2e8f0;border-top:none;">
        <table style="width:100%;border-collapse:collapse;">{rows}</table>
      </div>
      <div style="padding:12px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;text-align:center;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">Notificação automática — Cloud Hub Manager</p>
      </div>
    </div>
    """


def _deliver_email(recipients: str, event_type: str, payload: dict) -> tuple[bool, str | None]:
    """Send event notification via SMTP to one or more email addresses."""
    try:
        from app.services.email_service import _send_email
        label = _EVENT_LABELS.get(event_type, event_type)
        html = _email_html(event_type, payload)
        emails = [e.strip() for e in recipients.split(",") if e.strip()]
        if not emails:
            return False, "Nenhum destinatário configurado"
        for email in emails:
            ok = _send_email(email, f"Cloud Hub Manager — {label}", html)
            if not ok:
                return False, f"Falha ao enviar para {email}"
        return True, None
    except Exception as exc:
        return False, str(exc)


def _send_to_channel(channel: NotificationChannel, event_type: str, payload: dict) -> tuple[bool, str | None]:
    cfg = channel.config or {}
    if channel.channel_type == "teams":
        url = cfg.get("url", "")
        if not url:
            return False, "URL do Teams não configurada"
        return _deliver_teams(url, event_type, payload)
    elif channel.channel_type == "telegram":
        bot_token = cfg.get("bot_token", "")
        chat_id = cfg.get("chat_id", "")
        if not bot_token or not chat_id:
            return False, "Bot token ou Chat ID não configurados"
        return _deliver_telegram(bot_token, chat_id, event_type, payload)
    elif channel.channel_type == "email":
        recipients = cfg.get("recipients", "")
        if not recipients:
            return False, "Destinatários de email não configurados"
        return _deliver_email(recipients, event_type, payload)
    return False, f"Tipo de canal desconhecido: {channel.channel_type}"


# ── Public API (same signature as old webhook_service.fire_event) ─────────────

def fire_event(db: Session, workspace_id: str, event_type: str, payload: dict[str, Any]) -> None:
    """
    Deliver an event to all active notification channels subscribed to event_type.
    Non-blocking: errors are logged but never raised.
    """
    try:
        channels: list[NotificationChannel] = (
            db.query(NotificationChannel)
            .filter(
                NotificationChannel.workspace_id == workspace_id,
                NotificationChannel.is_active == True,
            )
            .all()
        )

        full_payload = {
            "event": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "workspace_id": str(workspace_id),
            **payload,
        }

        for ch in channels:
            events: list = ch.events or []
            if event_type not in events:
                continue

            ok, error = _send_to_channel(ch, event_type, full_payload)

            delivery = NotificationDelivery(
                channel_id=ch.id,
                event_type=event_type,
                payload=full_payload,
                status="delivered" if ok else "failed",
                error_message=error,
            )
            db.add(delivery)

        db.commit()
    except Exception as exc:
        logger.error("fire_event error for workspace %s event %s: %s", workspace_id, event_type, exc)
