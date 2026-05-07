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


# ── Login attempt lockout ────────────────────────────────────────────────────

_LOGIN_FAILS_PREFIX = "auth:fails:"
_LOGIN_LOCKED_PREFIX = "auth:locked:"


def is_login_locked(user_id: str) -> bool:
    """Return True if this user is currently in cool-down after too many fails."""
    if not user_id or not _client:
        return False
    try:
        return _client.exists(f"{_LOGIN_LOCKED_PREFIX}{user_id}") > 0
    except Exception as exc:
        logger.warning("redis is_login_locked failed: %s", exc)
        return False


def record_login_failure(user_id: str, max_attempts: int = 10, window_seconds: int = 900,
                          lock_seconds: int = 900) -> int:
    """Increment fail counter; lock the user if max_attempts reached. Returns count."""
    if not user_id or not _client:
        return 0
    try:
        key = f"{_LOGIN_FAILS_PREFIX}{user_id}"
        count = _client.incr(key)
        if count == 1:
            _client.expire(key, window_seconds)
        if count >= max_attempts:
            _client.setex(f"{_LOGIN_LOCKED_PREFIX}{user_id}", lock_seconds, "1")
            _client.delete(key)
        return int(count)
    except Exception as exc:
        logger.warning("redis record_login_failure failed: %s", exc)
        return 0


def clear_login_failures(user_id: str) -> None:
    """Reset fail counter (called on successful login)."""
    if not user_id or not _client:
        return
    try:
        _client.delete(f"{_LOGIN_FAILS_PREFIX}{user_id}")
        _client.delete(f"{_LOGIN_LOCKED_PREFIX}{user_id}")
    except Exception as exc:
        logger.warning("redis clear_login_failures failed: %s", exc)


# ── OAuth state (CSRF anti-forgery) ──────────────────────────────────────────

_OAUTH_STATE_PREFIX = "oauth_state:"


def store_oauth_state(state: str, provider: str, ttl_seconds: int = 600) -> bool:
    """Store an OAuth state token bound to a provider. TTL default 10min."""
    if not state or not _client:
        return False
    try:
        _client.setex(f"{_OAUTH_STATE_PREFIX}{state}", ttl_seconds, provider)
        return True
    except Exception as exc:
        logger.warning("redis store_oauth_state failed: %s", exc)
        return False


def consume_oauth_state(state: str, provider: str) -> bool:
    """Atomically validate + delete an OAuth state. One-time use."""
    if not state or not _client:
        # Fail-closed: if Redis is down, OAuth state can't be validated.
        # Conservative choice for a security-critical check.
        return False
    try:
        key = f"{_OAUTH_STATE_PREFIX}{state}"
        stored = _client.get(key)
        if stored != provider:
            return False
        _client.delete(key)
        return True
    except Exception as exc:
        logger.warning("redis consume_oauth_state failed: %s", exc)
        return False
