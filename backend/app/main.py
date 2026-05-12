from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import logging

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core import settings
from app.core.limiter import limiter, resolve_rate_limit
from app.api import api_router
from app.models import HealthResponse
from app.database import run_migrations, engine  # noqa: F401 - run_migrations used in dev/entrypoint

# ── Logging setup ────────────────────────────────────────────────────────────
if settings.DEBUG:
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
else:
    from pythonjsonlogger import jsonlogger
    handler = logging.StreamHandler()
    handler.setFormatter(jsonlogger.JsonFormatter(
        fmt='%(asctime)s %(name)s %(levelname)s %(message)s',
        rename_fields={"asctime": "timestamp", "levelname": "level"},
    ))
    logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL), handlers=[handler])

logger = logging.getLogger(__name__)

# ── FastAPI app ──────────────────────────────────────────────────────────────
_docs_url = "/docs" if settings.DEBUG else None
_redoc_url = "/redoc" if settings.DEBUG else None
_openapi_url = "/openapi.json" if settings.DEBUG else None

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Hub centralizado para gerenciamento multi-cloud e infraestrutura",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)

app.state.limiter = limiter


def _custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Return a friendly JSON 429 with Retry-After header."""
    retry_after = getattr(exc, "retry_after", 60)
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Limite de requisições excedido. Tente novamente em breve.",
            "retry_after": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


app.add_exception_handler(RateLimitExceeded, _custom_rate_limit_handler)
app.add_middleware(SlowAPIMiddleware)

# ── Request body size limit (2 MB default, protects against large payloads) ──
MAX_BODY_SIZE = 2 * 1024 * 1024  # 2 MB

@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_SIZE:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=413,
            content={"detail": "Payload muito grande. Limite: 2 MB."},
        )
    return await call_next(request)


# ── Inject user into request.state for per-user rate limiting ────────────────
@app.middleware("http")
async def inject_user_for_limiter(request: Request, call_next):
    """Parse JWT from Authorization header and attach user to request.state
    so that the rate limiter key_func can use user ID instead of IP."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from app.services.auth_service import decode_token_claims
            token = auth_header[7:]
            payload = decode_token_claims(token)
            if payload:
                class _MinimalUser:
                    def __init__(self, uid): self.id = uid
                user_id = payload.get("sub") or payload.get("user_id")
                if user_id:
                    request.state.user = _MinimalUser(int(user_id))
        except Exception:
            pass  # invalid/expired token — limiter falls back to IP
    response = await call_next(request)

    # Inject X-RateLimit headers so frontend knows the current limit
    tier = resolve_rate_limit(request)
    if tier:
        limit_value = tier.split("/")[0]
        response.headers["X-RateLimit-Limit"] = limit_value
        response.headers["X-RateLimit-Policy"] = tier
    return response

# ── CSRF protection (custom header check) ────────────────────────────────────
# For JWT-based SPAs, browsers can't add custom headers in cross-origin requests
# (form posts, image tags, etc.). Requiring X-Requested-With blocks CSRF attacks.
_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_CSRF_EXEMPT_PATHS = {
    "/health", "/", "/metrics",
    # Public/unauthenticated auth endpoints — pre-token, can't carry custom headers
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/resend-verification",
    "/api/v1/auth/google/callback",
    "/api/v1/auth/github/callback",
    "/api/v1/auth/microsoft/callback",
    "/api/v1/auth/mfa/verify",
    "/api/v1/auth/mfa/resend",
    "/api/v1/auth/oauth/state",
}
_CSRF_EXEMPT_PREFIXES = (
    "/api/v1/billing/webhook",   # payment provider callbacks (HMAC-validated)
    # Email verification / email-change confirm: tokenized public links
    "/api/v1/auth/verify-email/",
    "/api/v1/auth/email/confirm/",
    "/api/v1/auth/invitations/",  # /invitations/{token}/accept
)

@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    if request.method.upper() not in _CSRF_SAFE_METHODS:
        path = request.url.path
        if path not in _CSRF_EXEMPT_PATHS and not any(path.startswith(p) for p in _CSRF_EXEMPT_PREFIXES):
            # Require X-Requested-With header on all mutating requests.
            # Content-Type alone is not sufficient — modern browsers allow
            # cross-origin JSON requests via fetch().
            has_custom_header = request.headers.get("X-Requested-With")
            if not has_custom_header:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Requisição bloqueada: header X-Requested-With ausente."},
                )
    return await call_next(request)


# ── Security headers ──────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # CSP for API responses — strict policy since the backend only serves JSON.
    # blob: removed (not needed for API), data: limited to images only.
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:image/png data:image/jpeg data:image/gif data:image/webp; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    if not settings.DEBUG:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-CSRF-Token"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Policy", "Retry-After"],
)

# ── Protect /metrics endpoint ────────────────────────────────────────────────
_DOCKER_INTERNAL_PREFIXES = ("172.", "10.", "127.")

@app.middleware("http")
async def protect_metrics(request: Request, call_next):
    if request.url.path == "/metrics":
        if not settings.DEBUG:
            client_ip = (request.client.host or "") if request.client else ""
            # Allow Prometheus scraping from internal Docker/private networks without token
            is_internal = any(client_ip.startswith(p) for p in _DOCKER_INTERNAL_PREFIXES)
            if not is_internal:
                token = settings.METRICS_TOKEN
                if not token:
                    return JSONResponse(status_code=404, content={"detail": "Not found"})
                auth = request.headers.get("Authorization", "")
                import hmac as _hmac
                if not auth.startswith("Bearer ") or not _hmac.compare_digest(auth[7:], token):
                    return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return await call_next(request)

# ── Per-org request tracking ─────────────────────────────────────────────────
from app.core.metrics import org_requests_total

@app.middleware("http")
async def track_org_requests(request: Request, call_next):
    response = await call_next(request)
    try:
        path_params = dict(request.scope.get("path_params", {}))
        org_slug    = path_params.get("org_slug", "")
        workspace_id = path_params.get("workspace_id", "")
        if org_slug:
            route      = request.scope.get("route")
            route_path = route.path if route else request.url.path
            # Strip /api/v1 prefix to keep labels shorter
            route_path = route_path.removeprefix("/api/v1")
            status_class = f"{response.status_code // 100}xx"
            org_requests_total.labels(
                org_slug=org_slug,
                workspace_id=workspace_id or "_",
                method=request.method,
                status_class=status_class,
                route=route_path,
            ).inc()
    except Exception:
        pass
    return response

# ── Prometheus metrics ───────────────────────────────────────────────────────
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    excluded_handlers=["/health", "/metrics"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# ── API routes ───────────────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")


@app.get("/", response_model=HealthResponse)
async def root():
    """Root endpoint - Health check"""
    return HealthResponse(
        status="healthy",
        version=settings.APP_VERSION,
        timestamp=datetime.now()
    )


@app.get("/health")
async def health_check():
    """Health check with DB, Redis, Scheduler and SMTP verification"""
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
            db_ok = True
    except Exception:
        logger.warning("Health check: database unreachable")

    # Redis check
    redis_status = "not_configured"
    try:
        from app.core.cache import _get_client
        rc = _get_client()
        if rc:
            rc.ping()
            redis_status = "ok"
    except Exception:
        redis_status = "unreachable"

    # Scheduler check
    scheduler_status = "stopped"
    try:
        from app.services.scheduler_service import scheduler
        scheduler_status = "running" if scheduler.running else "stopped"
    except Exception:
        scheduler_status = "unknown"

    # SMTP check
    smtp_status = "not_configured"
    if settings.SMTP_HOST:
        try:
            import smtplib
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=3) as s:
                s.noop()
            smtp_status = "ok"
        except Exception:
            smtp_status = "unreachable"

    # Overall status: unhealthy if DB down, degraded if non-critical down
    if not db_ok:
        status = "unhealthy"
    elif redis_status == "unreachable" or smtp_status == "unreachable":
        status = "degraded"
    else:
        status = "healthy"

    return {
        "status": status,
        "version": settings.APP_VERSION,
        "timestamp": datetime.now().isoformat(),
        "checks": {
            "database": "ok" if db_ok else "unreachable",
            "redis": redis_status,
            "scheduler": scheduler_status,
            "smtp": smtp_status,
        },
    }


@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"AWS Region: {settings.AWS_DEFAULT_REGION}")

    if not settings.DEBUG:
        logger.warning(
            "SECURITY: Running in production mode. "
            "Ensure a reverse proxy (nginx/traefik/ALB) is configured to set "
            "X-Forwarded-For and X-Real-IP. Without this, per-IP rate limiting "
            "and audit log IPs will reflect the load balancer address instead of "
            "the real client IP. Verify get_real_ip() returns expected client IPs."
        )
    # In production, migrations run via entrypoint.sh BEFORE gunicorn starts.
    # In dev (uvicorn single-process), run them here.
    if settings.DEBUG:
        run_migrations()
        logger.info("Database migrations applied")

    # Start APScheduler and load all enabled scheduled actions from DB
    from app.services.scheduler_service import (
        scheduler, load_all_schedules, load_finops_scan_schedules, load_report_schedules,
    )
    from app.database import SessionLocal
    try:
        scheduler.start()
        with SessionLocal() as db:
            count = load_all_schedules(db)
            scan_count = load_finops_scan_schedules(db)
            report_count = load_report_schedules(db)
            logger.info(
                f"APScheduler started — {count} scheduled actions + "
                f"{scan_count} finops scan schedules + {report_count} report schedules loaded"
            )
    except Exception as exc:
        logger.error(f"APScheduler startup failed: {exc}")

    # Load security automation scans for workspaces with enabled settings
    try:
        from app.services.security_automation_service import schedule_security_scan
        from app.services.scheduler_service import scheduler as _sched
        from app.database import SessionLocal
        with SessionLocal() as db:
            # Re-schedule any jobs that were active before restart (check scheduler job store)
            existing_jobs = [j.id for j in _sched.get_jobs()
                             if j.id.startswith("security_scan_")]
            logger.info(f"Security scan jobs restored: {len(existing_jobs)}")
    except Exception as exc:
        logger.warning(f"Security scan scheduler init failed (non-fatal): {exc}")


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    from app.services.scheduler_service import scheduler
    try:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
    except Exception:
        pass
    logger.info(f"Shutting down {settings.APP_NAME}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )
