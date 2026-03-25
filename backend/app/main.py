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
            from jose import jwt as jose_jwt
            token = auth_header[7:]
            payload = jose_jwt.decode(
                token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
            )

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

# ── Security headers ──────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if not settings.DEBUG:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Policy", "Retry-After"],
)

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
    """Health check with DB connectivity verification"""
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
            db_ok = True
    except Exception:
        logger.warning("Health check: database unreachable")

    status = "healthy" if db_ok else "degraded"
    return {
        "status": status,
        "version": settings.APP_VERSION,
        "timestamp": datetime.now().isoformat(),
        "checks": {
            "database": "ok" if db_ok else "unreachable",
        },
    }


@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"AWS Region: {settings.AWS_DEFAULT_REGION}")
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
