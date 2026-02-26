from fastapi import APIRouter
from .aws import ws_router as aws_ws_router
from .azure import ws_router as azure_ws_router
from .gcp import ws_router as gcp_ws_router
from .auth import router as auth_router
from .alerts import ws_router as alerts_ws_router
from .logs import ws_router as logs_ws_router
from .finops import ws_router as finops_ws_router
from .resource_templates import ws_router as templates_ws_router
from .orgs import router as orgs_router
from .workspaces import router as workspaces_router
from .cloud_accounts import router as cloud_accounts_router
from .billing import router as billing_router, webhook_router as billing_webhook_router
from .schedules import ws_router as schedules_ws_router
from .dashboard_config import ws_router as dashboard_config_ws_router
from .admin import admin_router, leads_router

api_router = APIRouter()

# Auth (no org scope)
api_router.include_router(auth_router)

# Org-level
api_router.include_router(orgs_router)
api_router.include_router(workspaces_router)
api_router.include_router(billing_router)
api_router.include_router(billing_webhook_router)

# Admin (platform-level)
api_router.include_router(admin_router)
api_router.include_router(leads_router)

# Workspace-scoped (multi-tenant)
api_router.include_router(cloud_accounts_router)
api_router.include_router(aws_ws_router)
api_router.include_router(azure_ws_router)
api_router.include_router(gcp_ws_router)
api_router.include_router(alerts_ws_router)
api_router.include_router(logs_ws_router)
api_router.include_router(finops_ws_router)
api_router.include_router(templates_ws_router)
api_router.include_router(schedules_ws_router)
api_router.include_router(dashboard_config_ws_router)

__all__ = ["api_router"]
