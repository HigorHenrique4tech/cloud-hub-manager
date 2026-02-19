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

    # Costs
    COSTS_VIEW = "costs.view"

    # Alerts
    ALERTS_VIEW   = "alerts.view"
    ALERTS_MANAGE = "alerts.manage"

    # Activity logs
    LOGS_VIEW = "logs.view"


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
    },

    "viewer": {
        Permission.RESOURCES_VIEW,
        Permission.LOGS_VIEW,
    },

    "billing": {
        Permission.COSTS_VIEW,
        Permission.ALERTS_VIEW,
        Permission.ALERTS_MANAGE,
        Permission.LOGS_VIEW,
    },
}

VALID_ROLES = set(ROLE_PERMISSIONS.keys())
