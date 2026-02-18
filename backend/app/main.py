from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import logging

from app.core import settings
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
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Hub centralizado para gerenciamento multi-cloud e infraestrutura",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    logger.info(f"Shutting down {settings.APP_NAME}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )
