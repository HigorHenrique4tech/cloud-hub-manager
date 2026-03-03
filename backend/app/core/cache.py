"""
Redis cache utility.

Usage:
    from app.core.cache import cache_get, cache_set, cache_delete, cache_invalidate_prefix

    # Read
    data = cache_get("my-key")

    # Write (ttl in seconds)
    cache_set("my-key", {"some": "data"}, ttl=300)

    # Delete
    cache_delete("my-key")

    # Invalidate all keys matching a prefix (e.g. all keys for a workspace)
    cache_invalidate_prefix("m365:42:")
"""

import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_redis_client = None


def _get_client():
    """Return a Redis client, creating it lazily. Returns None if Redis is unavailable."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis
        from app.core.config import settings
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        _redis_client.ping()
        logger.info("Redis cache connected: %s", settings.REDIS_URL)
    except Exception as exc:
        logger.warning("Redis unavailable — cache disabled: %s", exc)
        _redis_client = None
    return _redis_client


def cache_get(key: str) -> Optional[Any]:
    """Return cached value (deserialized from JSON) or None on miss/error."""
    client = _get_client()
    if client is None:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("cache_get(%s) error: %s", key, exc)
        return None


def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    """Serialize value to JSON and store in Redis with the given TTL (seconds)."""
    client = _get_client()
    if client is None:
        return
    try:
        client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as exc:
        logger.warning("cache_set(%s) error: %s", key, exc)


def cache_delete(key: str) -> None:
    """Delete a single key from Redis."""
    client = _get_client()
    if client is None:
        return
    try:
        client.delete(key)
    except Exception as exc:
        logger.warning("cache_delete(%s) error: %s", key, exc)


def cache_invalidate_prefix(prefix: str) -> None:
    """Delete all keys that start with `prefix` (uses SCAN to avoid blocking)."""
    client = _get_client()
    if client is None:
        return
    try:
        keys = list(client.scan_iter(f"{prefix}*"))
        if keys:
            client.delete(*keys)
    except Exception as exc:
        logger.warning("cache_invalidate_prefix(%s) error: %s", prefix, exc)
