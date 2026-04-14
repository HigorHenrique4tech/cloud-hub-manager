"""
Prometheus metrics for Cloud Hub Manager - Migration365
"""

from prometheus_client import (
    Counter, Histogram, Gauge, CollectorRegistry,
    generate_latest, CONTENT_TYPE_LATEST
)
from typing import Dict, Optional

# Create registry
registry = CollectorRegistry()

# ────────────────────────────────────────────────────────────────────────────
# MIGRATION WORKER METRICS
# ────────────────────────────────────────────────────────────────────────────

# Counter: Total tasks completed
migration_tasks_completed = Counter(
    'migration_tasks_completed_total',
    'Total migration tasks completed successfully',
    ['migration_type', 'source_type'],
    registry=registry
)

# Counter: Total tasks failed
migration_tasks_failed = Counter(
    'migration_tasks_failed_total',
    'Total migration tasks failed',
    ['migration_type', 'error_type'],
    registry=registry
)

# Counter: Tasks retried
migration_tasks_retried = Counter(
    'migration_tasks_retried_total',
    'Total migration task retries',
    ['migration_type', 'retry_reason'],
    registry=registry
)

# Histogram: Task execution time
migration_task_duration = Histogram(
    'migration_task_duration_seconds',
    'Time spent executing migration task',
    ['migration_type'],
    buckets=(60, 300, 600, 1800, 3600, 7200),  # 1min, 5min, 10min, 30min, 1h, 2h
    registry=registry
)

# Gauge: Pending tasks
migration_tasks_pending = Gauge(
    'migration_tasks_pending',
    'Number of migration tasks pending execution',
    registry=registry
)

# Gauge: Active tasks
migration_tasks_active = Gauge(
    'migration_tasks_active',
    'Number of migration tasks currently executing',
    registry=registry
)

# Gauge: Worker health status (0=offline, 1=online)
migration_worker_available = Gauge(
    'migration_worker_available',
    'Migration worker availability (0=offline, 1=online)',
    registry=registry
)

# Gauge: Worker memory usage
migration_worker_memory_bytes = Gauge(
    'migration_worker_memory_bytes',
    'Migration worker memory usage in bytes',
    registry=registry
)

# Gauge: Worker CPU usage
migration_worker_cpu_percent = Gauge(
    'migration_worker_cpu_percent',
    'Migration worker CPU usage percentage',
    registry=registry
)

# ────────────────────────────────────────────────────────────────────────────
# GRAPH API METRICS
# ────────────────────────────────────────────────────────────────────────────

# Counter: Total Graph API requests
graph_api_requests_total = Counter(
    'graph_api_requests_total',
    'Total requests to Microsoft Graph API',
    ['endpoint', 'method', 'status'],
    registry=registry
)

# Gauge: Requests per minute
graph_api_requests_per_minute = Gauge(
    'graph_api_requests_per_minute',
    'Microsoft Graph API requests per minute',
    registry=registry
)

# Counter: Rate limit errors
graph_api_throttled = Counter(
    'graph_api_throttled_total',
    'Graph API 429 (rate limit) responses',
    ['endpoint'],
    registry=registry
)

# Counter: Retry attempts
graph_api_retries = Counter(
    'graph_api_retries_total',
    'Graph API request retry attempts',
    ['endpoint', 'reason'],
    registry=registry
)

# Histogram: Graph API response time
graph_api_response_time = Histogram(
    'graph_api_response_time_seconds',
    'Graph API response time',
    ['endpoint', 'method'],
    buckets=(0.5, 1, 2, 5, 10),
    registry=registry
)

# ────────────────────────────────────────────────────────────────────────────
# DATABASE METRICS
# ────────────────────────────────────────────────────────────────────────────

# Counter: Ledger inserts
migration_ledger_inserts = Counter(
    'migration_ledger_inserts_total',
    'Total inserts into migration message ledger',
    ['migration_type'],
    registry=registry
)

# Histogram: Ledger query time
migration_ledger_query_time = Histogram(
    'migration_ledger_query_time_seconds',
    'Migration ledger query duration',
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0),
    registry=registry
)

# Counter: Duplicate detections
migration_ledger_duplicates_detected = Counter(
    'migration_ledger_duplicates_detected_total',
    'Duplicate messages detected by ledger',
    ['migration_type'],
    registry=registry
)

# ────────────────────────────────────────────────────────────────────────────
# DATA TRANSFER METRICS
# ────────────────────────────────────────────────────────────────────────────

# Counter: Bytes migrated
migration_bytes_transferred = Counter(
    'migration_bytes_transferred_total',
    'Total bytes transferred in migrations',
    ['migration_type', 'direction'],  # direction: download, upload
    registry=registry
)

# Counter: Items migrated
migration_items_migrated = Counter(
    'migration_items_migrated_total',
    'Total items (emails, files, etc) migrated',
    ['migration_type', 'item_type'],  # item_type: email, file, etc
    registry=registry
)

# Histogram: Item size distribution
migration_item_size_bytes = Histogram(
    'migration_item_size_bytes',
    'Size distribution of migrated items',
    ['migration_type', 'item_type'],
    buckets=(1e4, 1e5, 1e6, 1e7, 1e8, 1e9),  # 10KB to 1GB
    registry=registry
)

# ────────────────────────────────────────────────────────────────────────────
# PROJECT & MAILBOX METRICS
# ────────────────────────────────────────────────────────────────────────────

# Gauge: Active migration projects
active_migration_projects = Gauge(
    'active_migration_projects',
    'Number of active migration projects',
    ['status'],  # status: running, paused, failed
    registry=registry
)

# Gauge: Mailboxes by status
migration_mailboxes_by_status = Gauge(
    'migration_mailboxes_by_status',
    'Migration mailboxes grouped by status',
    ['project_id', 'status'],  # status: pending, running, completed, failed
    registry=registry
)

# Histogram: Mailbox migration time
mailbox_migration_duration = Histogram(
    'mailbox_migration_duration_seconds',
    'Time to migrate a single mailbox',
    ['migration_type'],
    buckets=(60, 300, 600, 1800, 3600, 7200),
    registry=registry
)

# ────────────────────────────────────────────────────────────────────────────
# API ENDPOINT METRICS (FastAPI)
# ────────────────────────────────────────────────────────────────────────────

# Counter: HTTP requests
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status'],
    registry=registry
)

# Histogram: HTTP request duration
http_request_duration = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint'],
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0, 5.0),
    registry=registry
)

# Counter: Migration API specific
migration_api_calls = Counter(
    'migration_api_calls_total',
    'Migration API endpoint calls',
    ['endpoint', 'method'],
    registry=registry
)

# ────────────────────────────────────────────────────────────────────────────
# ERROR & EXCEPTION METRICS
# ────────────────────────────────────────────────────────────────────────────

# Counter: Exceptions by type
exceptions_total = Counter(
    'exceptions_total',
    'Total exceptions raised',
    ['exception_type', 'location'],
    registry=registry
)

# Counter: Migration specific errors
migration_errors = Counter(
    'migration_errors_total',
    'Migration-specific errors',
    ['error_code', 'migration_type'],
    registry=registry
)

# ────────────────────────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ────────────────────────────────────────────────────────────────────────────

def get_metrics() -> bytes:
    """Get Prometheus metrics in text format"""
    return generate_latest(registry)


def get_metrics_content_type() -> str:
    """Get content type for Prometheus metrics"""
    return CONTENT_TYPE_LATEST


# ────────────────────────────────────────────────────────────────────────────
# CONVENIENCE WRAPPERS
# ────────────────────────────────────────────────────────────────────────────

class MigrationMetrics:
    """Convenience wrapper for migration metrics"""

    @staticmethod
    def record_task_completion(migration_type: str, source_type: str, duration_seconds: float):
        """Record successful task completion"""
        migration_tasks_completed.labels(
            migration_type=migration_type,
            source_type=source_type
        ).inc()
        migration_task_duration.labels(
            migration_type=migration_type
        ).observe(duration_seconds)

    @staticmethod
    def record_task_failure(migration_type: str, error_type: str):
        """Record task failure"""
        migration_tasks_failed.labels(
            migration_type=migration_type,
            error_type=error_type
        ).inc()

    @staticmethod
    def record_items_migrated(migration_type: str, item_type: str, count: int, total_bytes: int):
        """Record migrated items"""
        for _ in range(count):
            migration_items_migrated.labels(
                migration_type=migration_type,
                item_type=item_type
            ).inc()
            migration_bytes_transferred.labels(
                migration_type=migration_type,
                direction='upload'
            ).inc(total_bytes / count if count > 0 else 0)

    @staticmethod
    def set_pending_tasks(count: int):
        """Update pending tasks count"""
        migration_tasks_pending.set(count)

    @staticmethod
    def set_active_tasks(count: int):
        """Update active tasks count"""
        migration_tasks_active.set(count)

    @staticmethod
    def set_worker_status(available: bool):
        """Update worker status (0=offline, 1=online)"""
        migration_worker_available.set(1 if available else 0)

    @staticmethod
    def set_worker_memory(bytes_used: int):
        """Update worker memory usage"""
        migration_worker_memory_bytes.set(bytes_used)

    @staticmethod
    def set_worker_cpu(cpu_percent: float):
        """Update worker CPU usage"""
        migration_worker_cpu_percent.set(cpu_percent)

    @staticmethod
    def set_graph_api_rate(requests_per_minute: int):
        """Update Graph API request rate"""
        graph_api_requests_per_minute.set(requests_per_minute)

    @staticmethod
    def record_graph_api_throttle(endpoint: str):
        """Record Graph API rate limit hit"""
        graph_api_throttled.labels(endpoint=endpoint).inc()
