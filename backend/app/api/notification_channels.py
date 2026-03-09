"""
Notification Channels API — Teams and Telegram delivery channels.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import get_db, get_workspace_member
from app.models.db_models import NotificationChannel, NotificationDelivery
from app.services.notification_channel_service import (
    SUPPORTED_EVENTS,
    _send_to_channel,
)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/notification-channels",
    tags=["notification-channels"],
)

MAX_CHANNELS = 20
CHANNEL_TYPES = ("teams", "telegram")


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    name: str
    channel_type: str
    config: dict[str, Any]
    events: list[str]
    is_active: bool = True

    @field_validator("channel_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in CHANNEL_TYPES:
            raise ValueError(f"channel_type deve ser: {', '.join(CHANNEL_TYPES)}")
        return v

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: list[str]) -> list[str]:
        invalid = [e for e in v if e not in SUPPORTED_EVENTS]
        if invalid:
            raise ValueError(f"Eventos inválidos: {invalid}")
        return v


class ChannelUpdate(BaseModel):
    name: str | None = None
    config: dict[str, Any] | None = None
    events: list[str] | None = None
    is_active: bool | None = None

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        invalid = [e for e in v if e not in SUPPORTED_EVENTS]
        if invalid:
            raise ValueError(f"Eventos inválidos: {invalid}")
        return v


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mask_config(channel_type: str, config: dict) -> dict:
    masked = dict(config)
    if channel_type == "telegram" and "bot_token" in masked:
        token = masked["bot_token"]
        masked["bot_token"] = token[:8] + "***" if len(token) > 8 else "***"
    return masked


def _serialize(ch: NotificationChannel) -> dict:
    return {
        "id": str(ch.id),
        "name": ch.name,
        "channel_type": ch.channel_type,
        "config": _mask_config(ch.channel_type, ch.config or {}),
        "events": ch.events or [],
        "is_active": ch.is_active,
        "created_at": ch.created_at.isoformat() if ch.created_at else None,
        "updated_at": ch.updated_at.isoformat() if ch.updated_at else None,
    }


def _require_view(ctx: MemberContext) -> None:
    if not ctx.has_permission("webhooks.view"):
        raise HTTPException(403, "Permissão insuficiente")


def _require_manage(ctx: MemberContext) -> None:
    if not ctx.has_permission("webhooks.manage"):
        raise HTTPException(403, "Permissão insuficiente")


def _get_channel(db: Session, workspace_id, channel_id: UUID) -> NotificationChannel:
    ch = db.query(NotificationChannel).filter(
        NotificationChannel.id == channel_id,
        NotificationChannel.workspace_id == workspace_id,
    ).first()
    if not ch:
        raise HTTPException(404, "Canal não encontrado")
    return ch


def _validate_config(channel_type: str, config: dict) -> None:
    if channel_type == "teams":
        if not config.get("url"):
            raise HTTPException(422, "config.url é obrigatório para canais Teams")
    elif channel_type == "telegram":
        if not config.get("bot_token"):
            raise HTTPException(422, "config.bot_token é obrigatório para canais Telegram")
        if not config.get("chat_id"):
            raise HTTPException(422, "config.chat_id é obrigatório para canais Telegram")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@ws_router.get("")
def list_channels(
    ctx: MemberContext = Depends(get_workspace_member),
    db: Session = Depends(get_db),
):
    _require_view(ctx)
    channels = (
        db.query(NotificationChannel)
        .filter(NotificationChannel.workspace_id == ctx.workspace_id)
        .order_by(NotificationChannel.created_at)
        .all()
    )
    return {
        "channels": [_serialize(ch) for ch in channels],
        "supported_events": SUPPORTED_EVENTS,
    }


@ws_router.post("", status_code=201)
def create_channel(
    body: ChannelCreate,
    ctx: MemberContext = Depends(get_workspace_member),
    db: Session = Depends(get_db),
):
    _require_manage(ctx)

    count = db.query(NotificationChannel).filter(
        NotificationChannel.workspace_id == ctx.workspace_id
    ).count()
    if count >= MAX_CHANNELS:
        raise HTTPException(400, f"Limite de {MAX_CHANNELS} canais atingido")

    _validate_config(body.channel_type, body.config)

    ch = NotificationChannel(
        workspace_id=ctx.workspace_id,
        created_by=ctx.user.id,
        name=body.name,
        channel_type=body.channel_type,
        config=body.config,
        events=body.events,
        is_active=body.is_active,
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return _serialize(ch)


@ws_router.put("/{channel_id}")
def update_channel(
    channel_id: UUID,
    body: ChannelUpdate,
    ctx: MemberContext = Depends(get_workspace_member),
    db: Session = Depends(get_db),
):
    _require_manage(ctx)
    ch = _get_channel(db, ctx.workspace_id, channel_id)

    if body.name is not None:
        ch.name = body.name
    if body.config is not None:
        # Merge with existing config so omitted fields (e.g. bot_token) are preserved
        merged = {**(ch.config or {}), **body.config}
        # Remove empty string values that the frontend sends when leaving a field blank
        merged = {k: v for k, v in merged.items() if v != ""}
        _validate_config(ch.channel_type, merged)
        ch.config = merged
    if body.events is not None:
        ch.events = body.events
    if body.is_active is not None:
        ch.is_active = body.is_active
    ch.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ch)
    return _serialize(ch)


@ws_router.delete("/{channel_id}", status_code=204)
def delete_channel(
    channel_id: UUID,
    ctx: MemberContext = Depends(get_workspace_member),
    db: Session = Depends(get_db),
):
    _require_manage(ctx)
    ch = _get_channel(db, ctx.workspace_id, channel_id)
    db.delete(ch)
    db.commit()


@ws_router.post("/{channel_id}/test")
def test_channel(
    channel_id: UUID,
    ctx: MemberContext = Depends(get_workspace_member),
    db: Session = Depends(get_db),
):
    _require_manage(ctx)
    ch = _get_channel(db, ctx.workspace_id, channel_id)

    payload = {
        "event": "test.ping",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "workspace_id": str(ctx.workspace_id),
        "message": "Teste de conexão do Cloud Hub Manager",
    }
    ok, error = _send_to_channel(ch, "test.ping", payload)

    delivery = NotificationDelivery(
        channel_id=ch.id,
        event_type="test.ping",
        payload=payload,
        status="delivered" if ok else "failed",
        error_message=error,
    )
    db.add(delivery)
    db.commit()

    if not ok:
        raise HTTPException(502, f"Falha no envio: {error}")
    return {"ok": True, "message": "Mensagem de teste enviada com sucesso"}


@ws_router.get("/{channel_id}/deliveries")
def list_deliveries(
    channel_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx: MemberContext = Depends(get_workspace_member),
    db: Session = Depends(get_db),
):
    _require_view(ctx)
    ch = _get_channel(db, ctx.workspace_id, channel_id)

    total = db.query(NotificationDelivery).filter(
        NotificationDelivery.channel_id == ch.id
    ).count()
    deliveries = (
        db.query(NotificationDelivery)
        .filter(NotificationDelivery.channel_id == ch.id)
        .order_by(NotificationDelivery.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "deliveries": [
            {
                "id": str(d.id),
                "event_type": d.event_type,
                "status": d.status,
                "error_message": d.error_message,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in deliveries
        ],
    }
