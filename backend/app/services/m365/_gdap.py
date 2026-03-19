"""M365 GDAP mixin — Granular Delegated Admin Privileges."""

import logging

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class GDAPMixin:
    """GDAP methods for M365Service."""

    def get_gdap_relationships(self) -> list:
        """GET /tenantRelationships/delegatedAdminRelationships"""
        data = self._get(f"{GRAPH_V1}/tenantRelationships/delegatedAdminRelationships")
        items = data.get("value", [])
        return [
            {
                "id": r.get("id"),
                "displayName": r.get("displayName"),
                "status": r.get("status"),
                "duration": r.get("duration"),
                "createdDateTime": r.get("createdDateTime"),
                "endDateTime": r.get("endDateTime"),
                "autoExtendDuration": r.get("autoExtendDuration"),
                "inviteUrl": r.get("inviteUrl"),
                "customer": r.get("customer"),
                "accessDetails": r.get("accessDetails"),
            }
            for r in items
        ]

    def get_gdap_customers(self) -> list:
        """GET /tenantRelationships/delegatedAdminCustomers"""
        data = self._get(f"{GRAPH_V1}/tenantRelationships/delegatedAdminCustomers")
        return data.get("value", [])

    def create_gdap_relationship(
        self,
        display_name: str,
        duration_days: int,
        roles: list,
        auto_extend: bool = False,
        customer_tenant_id: str = None,
    ) -> dict:
        """
        Step 1: POST /tenantRelationships/delegatedAdminRelationships
        Step 2: POST /.../{id}/requests { action: lockForApproval }
        Step 3: GET  /.../{id} -> returns object with inviteUrl
        """
        body = {
            "displayName": display_name,
            "duration": f"P{duration_days}D",
            "autoExtendDuration": "P180D" if auto_extend else "PT0S",
            "accessDetails": {
                "unifiedRoles": [{"roleDefinitionId": rid} for rid in roles]
            },
        }
        if customer_tenant_id:
            body["customer"] = {"tenantId": customer_tenant_id}
        rel = self._post(f"{GRAPH_V1}/tenantRelationships/delegatedAdminRelationships", body)
        rel_id = rel["id"]
        self._post(
            f"{GRAPH_V1}/tenantRelationships/delegatedAdminRelationships/{rel_id}/requests",
            {"action": "lockForApproval"},
        )
        return self._get(f"{GRAPH_V1}/tenantRelationships/delegatedAdminRelationships/{rel_id}")

    def expire_gdap_relationship(self, relationship_id: str) -> dict:
        """POST /tenantRelationships/delegatedAdminRelationships/{id}/requests { action: terminate }"""
        return self._post(
            f"{GRAPH_V1}/tenantRelationships/delegatedAdminRelationships/{relationship_id}/requests",
            {"action": "terminate"},
        )
