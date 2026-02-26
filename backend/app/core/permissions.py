"""
RBAC permission system.

Permissions are defined as code (not in the database) because
every new permission requires a code change in the endpoint handler.
"""

from enum import Enum
from typing import Dict, Set


class Permission(str, Enum):
    # Organization
    ORG_SETTINGS_VIEW  = "org.settings.view"
    ORG_SETTINGS_EDIT  = "org.settings.edit"
    ORG_MEMBERS_VIEW   = "org.members.view"
    ORG_MEMBERS_MANAGE = "org.members.manage"
    ORG_DELETE         = "org.delete"

    # Workspace
    WS_CREATE = "workspace.create"
    WS_EDIT   = "workspace.edit"
    WS_DELETE = "workspace.delete"

    # Cloud accounts (credentials)
    ACCOUNTS_VIEW   = "accounts.view"
    ACCOUNTS_CREATE = "accounts.create"
    ACCOUNTS_DELETE = "accounts.delete"

    # Resources (EC2, VMs, etc.)
    RESOURCES_VIEW       = "resources.view"
    RESOURCES_CREATE     = "resources.create"
    RESOURCES_START_STOP = "resources.start_stop"
    RESOURCES_DELETE     = "resources.delete"

    # Costs
    COSTS_VIEW = "costs.view"

    # Alerts
    ALERTS_VIEW   = "alerts.view"
    ALERTS_MANAGE = "alerts.manage"

    # Activity logs
    LOGS_VIEW = "logs.view"

    # FinOps
    FINOPS_VIEW      = "finops.view"      # see recommendations and dashboard
    FINOPS_RECOMMEND = "finops.recommend" # see full detail + reasoning
    FINOPS_EXECUTE   = "finops.execute"   # apply / dismiss / rollback actions
    FINOPS_BUDGET    = "finops.budget"    # create / edit budgets

    # Resource Templates
    TEMPLATES_VIEW   = "templates.view"   # see and load templates
    TEMPLATES_MANAGE = "templates.manage" # create / edit / delete templates

    # Webhooks
    WEBHOOKS_VIEW   = "webhooks.view"   # list webhooks and delivery history
    WEBHOOKS_MANAGE = "webhooks.manage" # create / edit / delete / test webhooks


_ALL_PERMISSIONS: Set[str] = {p.value for p in Permission}

ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    "owner": _ALL_PERMISSIONS,

    "admin": _ALL_PERMISSIONS - {
        Permission.ORG_DELETE,
    },

    "operator": {
        Permission.RESOURCES_VIEW,
        Permission.RESOURCES_CREATE,
        Permission.RESOURCES_START_STOP,
        Permission.LOGS_VIEW,
        Permission.FINOPS_VIEW,
        Permission.FINOPS_RECOMMEND,
        Permission.TEMPLATES_VIEW,
        Permission.TEMPLATES_MANAGE,
        Permission.WEBHOOKS_VIEW,
        Permission.WEBHOOKS_MANAGE,
    },

    "viewer": {
        Permission.RESOURCES_VIEW,
        Permission.LOGS_VIEW,
        Permission.FINOPS_VIEW,
        Permission.TEMPLATES_VIEW,
        Permission.WEBHOOKS_VIEW,
    },

    "billing": {
        Permission.COSTS_VIEW,
        Permission.ALERTS_VIEW,
        Permission.ALERTS_MANAGE,
        Permission.LOGS_VIEW,
        Permission.FINOPS_VIEW,
        Permission.FINOPS_RECOMMEND,
        Permission.TEMPLATES_VIEW,
    },
}

VALID_ROLES = set(ROLE_PERMISSIONS.keys())
