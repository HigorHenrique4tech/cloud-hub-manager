"""
Rate limiting configuration with Redis backend and smart key functions.

Key functions:
- get_real_ip: proxy-aware IP extraction (X-Forwarded-For / X-Real-IP)
- get_user_or_ip: uses user ID for authenticated requests, IP for anonymous

Tiers (applied automatically by path + HTTP method):
- AUTH_STRICT  = "3/minute"   → login, register, password reset
- AUTH_NORMAL  = "10/minute"  → other auth endpoints
- CLOUD_API    = "20/minute"  → external cloud provider calls (mutations)
- ADMIN        = "30/minute"  → admin panel operations
- MUTATION     = "30/minute"  → POST/PUT/PATCH/DELETE on resources
- READ         = "60/minute"  → GET endpoints
- GLOBAL       = "120/minute" → default catch-all
"""

import logging
import re
from fastapi import Request
from slowapi import Limiter

logger = logging.getLogger(__name__)

# ── Tier constants ───────────────────────────────────────────────────────────
AUTH_STRICT = "3/minute"
AUTH_NORMAL = "10/minute"
MUTATION = "30/minute"
READ = "60/minute"
CLOUD_API = "20/minute"
ADMIN = "30/minute"
BILLING = "5/minute"
GLOBAL = "120/minute"


# ── Key functions ────────────────────────────────────────────────────────────
def get_real_ip(request: Request) -> str:
    """Extract the real client IP, respecting reverse-proxy headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def get_user_or_ip(request: Request) -> str:
    """Use user ID if authenticated, otherwise fall back to IP."""
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return f"user:{user.id}"
    return get_real_ip(request)


# ── Build storage URI ────────────────────────────────────────────────────────
def _get_storage_uri() -> str:
    """Return Redis URI for rate limit storage, or 'memory://' as fallback."""
    try:
        from app.core.config import settings
        redis_url = getattr(settings, "REDIS_URL", None)
        if redis_url:
            return redis_url
    except Exception:
        pass
    logger.warning("Redis URL not found — rate limiter using in-memory storage")
    return "memory://"


# ── Limiter instance ─────────────────────────────────────────────────────────
limiter = Limiter(
    key_func=get_user_or_ip,
    default_limits=[GLOBAL],
    storage_uri=_get_storage_uri(),
    strategy="fixed-window-elastic-expiry",
)


# ── Path-based tier resolution ───────────────────────────────────────────────
# Cloud provider paths that call external APIs
_CLOUD_PATHS = re.compile(
    r"^/api/v1/orgs/[^/]+/workspaces/\d+/(aws|azure|gcp|m365|finops|inventory|pricing)"
)
_ADMIN_PATHS = re.compile(r"^/api/v1/admin")
_AUTH_PATHS = re.compile(r"^/api/v1/auth")
_BILLING_PATHS = re.compile(r"^/api/v1/orgs/[^/]+/billing")

# Auth endpoints that deserve the strictest limits
_AUTH_STRICT_ENDPOINTS = {
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/mfa/verify",
}


def resolve_rate_limit(request: Request) -> str:
    """Determine the appropriate rate limit tier for a request based on path and method.
    Called by the custom middleware in main.py to apply tiered limits."""
    path = request.url.path
    method = request.method.upper()

    # Health / metrics — no limit
    if path in ("/", "/health", "/metrics"):
        return ""

    # Auth — strictest for sensitive operations
    if path in _AUTH_STRICT_ENDPOINTS:
        return AUTH_STRICT
    if _AUTH_PATHS.match(path):
        return AUTH_NORMAL

    # Billing
    if _BILLING_PATHS.match(path) and method != "GET":
        return BILLING

    # Admin panel
    if _ADMIN_PATHS.match(path):
        return ADMIN

    # Cloud provider APIs — tighter limit for mutations
    if _CLOUD_PATHS.match(path):
        if method in ("POST", "PUT", "PATCH", "DELETE"):
            return CLOUD_API
        return READ

    # Generic mutations on other endpoints
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        return MUTATION

    # Default for GET/HEAD/OPTIONS
    return READ
