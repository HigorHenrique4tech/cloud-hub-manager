"""Prometheus metrics endpoint for monitoring"""

from fastapi import APIRouter
from fastapi.responses import Response
from app.core.metrics import get_metrics, get_metrics_content_type

router = APIRouter(
    tags=["Monitoring"],
    include_in_schema=False,  # Don't show in OpenAPI docs
)


@router.get("/metrics")
async def metrics():
    """
    Prometheus metrics endpoint.

    Scrape this endpoint from Prometheus to collect metrics about:
    - Migration worker status and performance
    - Graph API usage and rate limiting
    - Database operations
    - Task completion and failures
    - Data transfer statistics

    Example Prometheus config:
    ```yaml
    scrape_configs:
      - job_name: 'migration365'
        static_configs:
          - targets: ['localhost:8000']
        metrics_path: '/metrics'
        scrape_interval: 15s
    ```
    """
    return Response(
        content=get_metrics(),
        media_type=get_metrics_content_type()
    )
