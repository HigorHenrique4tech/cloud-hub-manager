from fastapi import APIRouter
from .aws import ws_router as aws_ws_router
from .azure import ws_router as azure_ws_router
from .auth import router as auth_router
from .alerts import ws_router as alerts_ws_router
from .logs import ws_router as logs_ws_router
from .orgs import router as orgs_router
from .workspaces import router as workspaces_router
from .cloud_accounts import router as cloud_accounts_router

api_router = APIRouter()

# Auth (no org scope)
api_router.include_router(auth_router)

# Org-level
api_router.include_router(orgs_router)
api_router.include_router(workspaces_router)

# Workspace-scoped (multi-tenant)
api_router.include_router(cloud_accounts_router)
api_router.include_router(aws_ws_router)
api_router.include_router(azure_ws_router)
api_router.include_router(alerts_ws_router)
api_router.include_router(logs_ws_router)

__all__ = ["api_router"]
