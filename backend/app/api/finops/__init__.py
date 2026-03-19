"""
FinOps REST API — waste detection, recommendations, budgets, and actions.

Routes are workspace-scoped (org_slug + workspace_id in the path).

This package splits the monolithic finops.py into domain-specific sub-modules.
All endpoints are registered on the single `ws_router` defined here.
"""
from fastapi import APIRouter

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/finops",
    tags=["FinOps (workspace)"],
)

# Import sub-modules so their @ws_router decorators register endpoints.
from . import _summary       # noqa: E402, F401  — GET /summary, GET /cost-trend
from . import _recommendations  # noqa: E402, F401  — recommendations CRUD + bulk
from . import _scans          # noqa: E402, F401  — POST /scan, GET /scan/status
from . import _actions        # noqa: E402, F401  — GET /actions, POST rollback
from . import _budgets        # noqa: E402, F401  — budgets CRUD + evaluate
from . import _anomalies      # noqa: E402, F401  — anomaly scan/list/acknowledge
from . import _schedules       # noqa: E402, F401  — scan-schedule + report-schedule

# Re-export symbols that external code imports from `app.api.finops`:
from ._helpers import _persist_findings  # noqa: E402, F401  — used by scheduler_service
from ._anomalies import detect_and_save_anomalies  # noqa: E402, F401  — used by scheduler_service
from ._actions_helpers import _apply_recommendation_logic  # noqa: E402, F401  — used by approvals
