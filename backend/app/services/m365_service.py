"""
Backward-compatibility shim — imports from the refactored m365 package.

All code now lives in app.services.m365.* mixin modules.
"""

from app.services.m365 import M365Service, M365AuthError, GRAPH_V1, GRAPH_BETA  # noqa: F401

__all__ = ["M365Service", "M365AuthError", "GRAPH_V1", "GRAPH_BETA"]
