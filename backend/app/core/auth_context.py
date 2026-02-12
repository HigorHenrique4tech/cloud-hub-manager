"""Dataclass returned by RBAC dependency injection."""

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from app.models.db_models import User
from app.core.permissions import ROLE_PERMISSIONS


@dataclass
class MemberContext:
    """Fully-resolved auth context for a request."""

    user: User
    organization_id: Optional[UUID] = None
    workspace_id: Optional[UUID] = None
    role: Optional[str] = None

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"

    @property
    def is_admin_or_above(self) -> bool:
        return self.role in ("owner", "admin")

    def has_permission(self, permission: str) -> bool:
        if not self.role:
            return False
        return permission in ROLE_PERMISSIONS.get(self.role, set())
