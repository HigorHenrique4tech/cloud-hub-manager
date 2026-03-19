"""
Backward-compatibility shim — all logic now lives in app.services.finops package.

Existing imports like:
    from app.services.finops_service import AWSFinOpsScanner
continue to work unchanged.
"""

from app.services.finops import (  # noqa: F401
    AWSFinOpsScanner,
    AzureFinOpsScanner,
    GCPFinOpsScanner,
    detect_cost_anomalies,
)
