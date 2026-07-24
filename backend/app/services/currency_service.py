"""
Currency Service — USD→BRL exchange rate via BCB (Banco Central do Brasil) API.

Provides manual and automatic exchange rate support per organization.
"""
import logging
import time
from datetime import datetime
from typing import Optional

import httpx

from sqlalchemy.orm import Session
from app.models.db_models import Organization

logger = logging.getLogger(__name__)

# ── In-memory cache ─────────────────────────────────────────────────────────

_cached_rate: Optional[float] = None
_cached_at: float = 0.0
_CACHE_TTL = 3600  # 1 hour


BCB_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json"
DEFAULT_RATE = 5.50


def fetch_bcb_rate() -> float:
    """Fetch the latest USD→BRL commercial exchange rate from BCB.

    Returns cached value if within TTL. Falls back to DEFAULT_RATE on error.
    """
    global _cached_rate, _cached_at

    now = time.time()
    if _cached_rate and (now - _cached_at) < _CACHE_TTL:
        return _cached_rate

    try:
        resp = httpx.get(BCB_URL, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data and isinstance(data, list) and len(data) > 0:
            rate = float(data[-1].get("valor", DEFAULT_RATE))
            _cached_rate = rate
            _cached_at = now
            logger.info("BCB USD→BRL rate fetched: %.4f", rate)
            return rate
    except Exception as exc:
        logger.warning("Failed to fetch BCB rate: %s", exc)

    return _cached_rate or DEFAULT_RATE


def get_exchange_rate(db: Session, org: Organization) -> Optional[float]:
    """Return the exchange rate for an org. None = no conversion (show USD).

    - Auto mode: fetches from BCB and updates org if stale (>1h).
    - Manual mode: returns org.exchange_rate_brl.
    - Neither: returns None.
    """
    if org.exchange_rate_auto:
        rate = fetch_bcb_rate()
        # Update org record if stale
        now = datetime.utcnow()
        if (
            not org.exchange_rate_updated_at
            or (now - org.exchange_rate_updated_at).total_seconds() > _CACHE_TTL
        ):
            org.exchange_rate_brl = rate
            org.exchange_rate_updated_at = now
            db.commit()
        return rate

    if org.exchange_rate_brl:
        return org.exchange_rate_brl

    return None


def convert_usd_to_brl(amount: float, rate: float) -> float:
    """Convert a USD amount to BRL using the given rate."""
    return round(amount * rate, 2)
