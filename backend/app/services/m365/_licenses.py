"""M365 Licenses mixin — license management."""

import logging

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class LicensesMixin:
    """License management methods for M365Service."""

    def get_licenses(self) -> list:
        """List all license SKUs with prepaid/consumed/available counts."""
        skus = self._get("/subscribedSkus").get("value", [])
        return [
            {
                "skuId": s["skuId"],
                "skuPartNumber": s["skuPartNumber"],
                "prepaid": s["prepaidUnits"]["enabled"],
                "consumed": s["consumedUnits"],
                "available": s["prepaidUnits"]["enabled"] - s["consumedUnits"],
                "suspended": s["prepaidUnits"].get("suspended", 0),
            }
            for s in skus
        ]

    def get_license_users(self, sku_id: str) -> list:
        """Return users who have a specific license SKU assigned."""
        users = self._get_all_pages(
            "/users",
            select="id,displayName,userPrincipalName,accountEnabled,assignedLicenses",
        )
        return [
            {
                "id": u["id"],
                "displayName": u.get("displayName"),
                "userPrincipalName": u.get("userPrincipalName"),
                "accountEnabled": u.get("accountEnabled"),
            }
            for u in users
            if any(lic.get("skuId") == sku_id for lic in u.get("assignedLicenses", []))
        ]

    def assign_license(self, user_id: str, sku_id: str) -> dict:
        """Assign a license SKU to a user."""
        return self._post(
            f"/users/{user_id}/assignLicense",
            {"addLicenses": [{"skuId": sku_id, "disabledPlans": []}], "removeLicenses": []},
        )

    def remove_license(self, user_id: str, sku_id: str) -> dict:
        """Remove a license SKU from a user."""
        return self._post(
            f"/users/{user_id}/assignLicense",
            {"addLicenses": [], "removeLicenses": [sku_id]},
        )
