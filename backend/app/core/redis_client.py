"""Redis client singleton for app-level caching and JWT revocation.

Distinct from the slowapi rate-limit storage in `limiter.py` — this client is
imported directly for cache reads/writes and `jti` blacklist operations.

If Redis is unavailable, all helpers fail safe: cache misses return None and
revocation checks return False (allowing the request through). The intent is
to avoid cascading outages — revocation is best-effort defense in depth.
"""

import logging
from typing import Optional

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    _client: Optional[redis.Redis] = redis.Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    _client.ping()
    logger.info("Redis client connected: %s", settings.REDIS_URL)
except Exception as exc:
    logger.warning("Redis unavailable (%s) — cache and JTI revocation disabled", exc)
    _client = None


def get_client() -> Optional[redis.Redis]:
    return _client


# ── Generic cache helpers ────────────────────────────────────────────────────

def cache_get(key: str) -> Optional[str]:
    if not _client:
        return None
    try:
        return _client.get(key)
    except Exception as exc:
        logger.warning("redis cache_get failed key=%s: %s", key, exc)
        return None


def cache_set(key: str, value: str, ttl_seconds: int) -> bool:
    if not _client:
        return False
    try:
        _client.setex(key, ttl_seconds, value)
        return True
    except Exception as exc:
        logger.warning("redis cache_set failed key=%s: %s", key, exc)
        return False


# ── JWT revocation list ──────────────────────────────────────────────────────

_JTI_PREFIX = "revoked_jti:"


def revoke_jti(jti: str, ttl_seconds: int) -> bool:
    """Mark a JWT id as revoked. TTL should match remaining token lifetime."""
    if not jti or ttl_seconds <= 0 or not _client:
        return False
    try:
        _client.setex(f"{_JTI_PREFIX}{jti}", ttl_seconds, "1")
        return True
    except Exception as exc:
        logger.warning("redis revoke_jti failed: %s", exc)
        return False


def is_jti_revoked(jti: str) -> bool:
    """Return True if `jti` is in the revocation list. Fail-safe = False."""
    if not jti or not _client:
        return False
    try:
        return _client.exists(f"{_JTI_PREFIX}{jti}") > 0
    except Exception as exc:
        logger.warning("redis is_jti_revoked failed: %s", exc)
        return False
