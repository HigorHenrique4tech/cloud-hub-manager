from fastapi import APIRouter
from .aws import router as aws_router, ws_router as aws_ws_router
from .azure import router as azure_router, ws_router as azure_ws_router
from .auth import router as auth_router
from .users import router as users_router
from .alerts import router as alerts_router, ws_router as alerts_ws_router
from .logs import router as logs_router, ws_router as logs_ws_router
from .orgs import router as orgs_router
from .workspaces import router as workspaces_router
from .cloud_accounts import router as cloud_accounts_router

api_router = APIRouter()

# Auth & user (no org scope)
api_router.include_router(auth_router)
api_router.include_router(users_router)

# Org-level
api_router.include_router(orgs_router)
api_router.include_router(workspaces_router)

# Workspace-scoped (multi-tenant)
api_router.include_router(cloud_accounts_router)
api_router.include_router(aws_ws_router)
api_router.include_router(azure_ws_router)
api_router.include_router(alerts_ws_router)
api_router.include_router(logs_ws_router)

# Legacy (user-scoped, kept for backward compat)
api_router.include_router(aws_router)
api_router.include_router(azure_router)
api_router.include_router(alerts_router)
api_router.include_router(logs_router)

__all__ = ["api_router"]
