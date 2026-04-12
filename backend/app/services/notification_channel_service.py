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
    # Recursos
    "resource.started",
    "resource.stopped",
    "resource.failed",
    # FinOps
    "alert.triggered",
    "finops.scan.completed",
    "budget.threshold_crossed",
    "anomaly.detected",
    # Segurança
    "security.alert.triggered",
    "security.playbook.executed",
    "security.incident.created",
    # Migração 365
    "migration.started",
    "migration.completed",
    "migration.failed",
    # Backup
    "backup.scan.completed",
    "backup.vm.unprotected",
    # Administrativo
    "billing.paid",
    "org.member.added",
    "schedule.executed",
    "schedule.failed",
    "approval.requested",
    # Teste
    "test.ping",
]

# ── Event metadata: label, emoji, Teams themeColor ────────────────────────────

_EVENT_META = {
    # Recursos
    "resource.started":          ("Recurso iniciado",               "🟢", "2ECC71"),
    "resource.stopped":          ("Recurso parado",                 "⚫", "7F8C8D"),
    "resource.failed":           ("Recurso com falha",              "🔴", "E74C3C"),
    # FinOps
    "alert.triggered":           ("Alerta de custo disparado",      "🔔", "E67E22"),
    "finops.scan.completed":     ("Scan FinOps concluído",          "⚡", "5B2D9E"),
    "budget.threshold_crossed":  ("Limite de orçamento atingido",   "💸", "F39C12"),
    "anomaly.detected":          ("Anomalia de custo detectada",    "📈", "E74C3C"),
    # Segurança
    "security.alert.triggered":  ("Alerta de segurança disparado",  "🚨", "C0392B"),
    "security.playbook.executed":("Playbook de segurança executado","🛡️", "E67E22"),
    "security.incident.created": ("Incidente de segurança criado",  "⚠️",  "E74C3C"),
    # Migração
    "migration.started":         ("Migração iniciada",              "🚀", "2980B9"),
    "migration.completed":       ("Migração concluída",             "✅", "27AE60"),
    "migration.failed":          ("Migração com falha",             "❌", "E74C3C"),
    # Backup
    "backup.scan.completed":     ("Scan de backup concluído",       "🗄️",  "0EA5E9"),
    "backup.vm.unprotected":     ("VM sem backup detectada",        "🔓", "E74C3C"),
    # Administrativo
    "billing.paid":              ("Fatura paga",                    "💳", "27AE60"),
    "org.member.added":          ("Membro adicionado",              "👤", "2980B9"),
    "schedule.executed":         ("Agenda executada",               "🕐", "2980B9"),
    "schedule.failed":           ("Agenda falhou",                  "🕐", "E67E22"),
    "approval.requested":        ("Aprovação solicitada",           "📋", "8E44AD"),
    # Teste
    "test.ping":                 ("Teste de conexão",               "🏓", "7F8C8D"),
}

def _event_label(event_type: str) -> str:
    return _EVENT_META.get(event_type, (event_type, "•", "0076D7"))[0]

def _event_emoji(event_type: str) -> str:
    return _EVENT_META.get(event_type, (event_type, "•", "0076D7"))[1]

def _event_color(event_type: str) -> str:
    return _EVENT_META.get(event_type, (event_type, "•", "0076D7"))[2]

# Backward compat
_EVENT_LABELS = {k: v[0] for k, v in _EVENT_META.items()}

# ── Formatters ────────────────────────────────────────────────────────────────

def _teams_payload(event_type: str, payload: dict) -> dict:
    """Build a Teams MessageCard from an event payload."""
    label = _event_label(event_type)
    emoji = _event_emoji(event_type)
    color = _event_color(event_type)

    # Build facts from payload, skipping internal fields
    _SKIP = {"workspace_id", "event", "timestamp"}
    _FIELD_LABELS = {
        "name": "Nome", "type": "Tipo", "status": "Status", "message": "Mensagem",
        "project_name": "Projeto", "completed_count": "Concluídas", "failed_count": "Falhas",
        "coverage_pct": "Cobertura (%)", "unprotected_vms": "VMs sem backup",
        "failing_backups": "Backups com falha", "vm_name": "VM", "provider": "Provedor",
        "resource_name": "Recurso", "playbook": "Playbook", "severity": "Severidade",
        "workspace_name": "Workspace", "user_email": "Usuário", "amount": "Valor",
    }
    facts = []
    for k, v in payload.items():
        if k in _SKIP or v is None:
            continue
        label_k = _FIELD_LABELS.get(k, str(k).replace("_", " ").title())
        facts.append({"name": label_k, "value": str(v)})

    ts = payload.get("timestamp", "")

    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": color,
        "summary": f"{label}",
        "sections": [
            {
                "activityTitle": f"{emoji} **{label}**",
                "activitySubtitle": f"Cloud Hub Manager · {ts[:16].replace('T', ' ')} UTC" if ts else "Cloud Hub Manager",
                "facts": facts,
                "markdown": True,
            }
        ],
    }


def _telegram_text(event_type: str, payload: dict) -> str:
    """Build a Telegram HTML message from an event payload."""
    label = _event_label(event_type)
    emoji = _event_emoji(event_type)

    _SKIP = {"workspace_id", "event", "timestamp"}
    _FIELD_LABELS = {
        "name": "Nome", "type": "Tipo", "status": "Status", "message": "Mensagem",
        "project_name": "Projeto", "completed_count": "Concluídas", "failed_count": "Falhas",
        "coverage_pct": "Cobertura (%)", "unprotected_vms": "VMs sem backup",
        "failing_backups": "Backups com falha", "vm_name": "VM", "provider": "Provedor",
        "resource_name": "Recurso", "playbook": "Playbook", "severity": "Severidade",
        "workspace_name": "Workspace", "user_email": "Usuário", "amount": "Valor",
    }

    ts = payload.get("timestamp", "")
    ts_str = ts[:16].replace("T", " ") + " UTC" if ts else ""

    lines = [
        f"{emoji} <b>{label}</b>",
        f"<i>Cloud Hub Manager{' · ' + ts_str if ts_str else ''}</i>",
        "",
    ]
    for k, v in payload.items():
        if k in _SKIP or v is None:
            continue
        label_k = _FIELD_LABELS.get(k, str(k).replace("_", " ").title())
        lines.append(f"• <b>{label_k}:</b> {v}")
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
    label = _event_label(event_type)
    emoji = _event_emoji(event_type)
    color = _event_color(event_type)
    hex_color = f"#{color}"

    _SKIP = {"workspace_id", "event", "timestamp"}
    _FIELD_LABELS = {
        "name": "Nome", "type": "Tipo", "status": "Status", "message": "Mensagem",
        "project_name": "Projeto", "completed_count": "Concluídas", "failed_count": "Falhas",
        "coverage_pct": "Cobertura (%)", "unprotected_vms": "VMs sem backup",
        "failing_backups": "Backups com falha", "vm_name": "VM", "provider": "Provedor",
        "resource_name": "Recurso", "playbook": "Playbook", "severity": "Severidade",
        "workspace_name": "Workspace", "user_email": "Usuário", "amount": "Valor",
    }

    rows = ""
    for k, v in payload.items():
        if k in _SKIP or v is None:
            continue
        label_k = _FIELD_LABELS.get(k, str(k).replace("_", " ").title())
        rows += (
            f'<tr>'
            f'<td style="padding:6px 12px;font-weight:600;color:#64748b;font-size:13px;white-space:nowrap;">{label_k}</td>'
            f'<td style="padding:6px 12px;color:#334155;font-size:13px;">{v}</td>'
            f'</tr>'
        )

    ts = payload.get("timestamp", "")
    ts_str = ts[:16].replace("T", " ") + " UTC" if ts else ""

    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:540px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
      <div style="background:{hex_color};padding:22px 24px;text-align:center;">
        <p style="color:#fff;margin:0;font-size:26px;">{emoji}</p>
        <h2 style="color:#fff;margin:6px 0 0;font-size:17px;font-weight:700;">{label}</h2>
        {f'<p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:12px;">{ts_str}</p>' if ts_str else ''}
      </div>
      <div style="background:#fff;padding:20px 24px;border:1px solid #e2e8f0;border-top:none;">
        <table style="width:100%;border-collapse:collapse;">{rows if rows else '<tr><td style="padding:8px;color:#94a3b8;font-size:13px;">Sem detalhes adicionais.</td></tr>'}</table>
      </div>
      <div style="padding:12px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">Notificação automática · Cloud Hub Manager</p>
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
