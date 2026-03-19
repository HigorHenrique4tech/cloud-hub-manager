"""
Microsoft 365 REST API — workspace-scoped integration + MSP master tenant summary.

Workspace endpoints: /orgs/{org_slug}/workspaces/{workspace_id}/m365/...
Org-level endpoint:  /orgs/{org_slug}/m365/tenants  (MSP master only)
"""

from fastapi import APIRouter

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/m365",
    tags=["Microsoft 365 (workspace)"],
)

org_router = APIRouter(
    prefix="/orgs",
    tags=["Microsoft 365 (MSP)"],
)

# Import sub-modules to register their endpoints on the routers above.
# The order matters for route matching: more specific paths (e.g. /teams/activity)
# must be registered before parameterized paths (e.g. /teams/{team_id}).
from . import _credentials   # noqa: E402, F401
from . import _dashboard     # noqa: E402, F401
from . import _users         # noqa: E402, F401
from . import _groups        # noqa: E402, F401
from . import _teams         # noqa: E402, F401
from . import _licenses      # noqa: E402, F401
from . import _sharepoint    # noqa: E402, F401
from . import _exchange      # noqa: E402, F401
from . import _guests        # noqa: E402, F401
from . import _audit         # noqa: E402, F401
from . import _security      # noqa: E402, F401
from . import _offboarding   # noqa: E402, F401
from . import _gdap          # noqa: E402, F401
from . import _msp           # noqa: E402, F401
