"""
FinOps Service package — Waste detection, recommendations, and actionable savings.

Re-exports all public names for backward compatibility with:
    from app.services.finops_service import AWSFinOpsScanner, ...
"""

from .aws_scanner import AWSFinOpsScanner
from .azure_scanner import AzureFinOpsScanner
from .gcp_scanner import GCPFinOpsScanner
from .utils import detect_cost_anomalies

__all__ = [
    "AWSFinOpsScanner",
    "AzureFinOpsScanner",
    "GCPFinOpsScanner",
    "detect_cost_anomalies",
]
