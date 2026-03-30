"""Celery application — used by migration worker."""
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "migration_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.migration_worker"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    result_expires=86400,           # resultados expiram em 1 dia
    worker_prefetch_multiplier=1,   # 1 task por worker (são pesadas)
    task_acks_late=True,            # só confirma após concluir — evita perda em crash
    task_reject_on_worker_lost=True,
    task_routes={
        "app.workers.migration_worker.*": {"queue": "migration"},
    },
)
