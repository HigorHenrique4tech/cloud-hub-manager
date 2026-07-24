"""M365 Overview mixin — tenant overview and service health."""

import logging
import requests

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class OverviewMixin:
    """Overview and service health methods for M365Service."""

    def _count_with_odata(self, path: str, timeout: int = 15) -> int | None:
        """Use $count + ConsistencyLevel:eventual to count entities without downloading them."""
        try:
            r = requests.get(
                f"{GRAPH_V1}{path}",
                headers={**self._headers(), "ConsistencyLevel": "eventual"},
                params={"$count": "true", "$top": "1", "$select": "id"},
                timeout=timeout,
            )
            r.raise_for_status()
            return r.json().get("@odata.count")
        except Exception as exc:
            logger.warning("Could not count %s: %s", path, exc)
            return None

    def get_overview(self) -> dict:
        """
        Tenant summary: users, licenses, groups.
        Uses $count for user totals and $filter for active — much faster than downloading all pages.
        """
        skus = self._get("/subscribedSkus").get("value", [])

        total_licenses = sum(s["prepaidUnits"]["enabled"] for s in skus)
        assigned_licenses = sum(s["consumedUnits"] for s in skus)

        # ── User counts via $count (fast, no pagination) ─────────────────────
        total_users = self._count_with_odata("/users") or 0
        active_users = 0
        disabled_users = 0
        try:
            r = requests.get(
                f"{GRAPH_V1}/users",
                headers={**self._headers(), "ConsistencyLevel": "eventual"},
                params={
                    "$count": "true",
                    "$top": "1",
                    "$select": "id",
                    "$filter": "accountEnabled eq true",
                },
                timeout=15,
            )
            r.raise_for_status()
            active_users = r.json().get("@odata.count", 0)
            disabled_users = total_users - active_users
        except Exception as exc:
            logger.warning("Could not count active users: %s", exc)

        # Licensed users ≈ consumed units from SKUs (no extra Graph call needed)
        licensed_users = assigned_licenses

        # ── Group count ──────────────────────────────────────────────────────
        total_teams = self._count_with_odata("/groups") or 0

        # ── Primary domain ────────────────────────────────────────────────────
        primary_domain = None
        try:
            org_resp = self._get("/organization?$select=verifiedDomains")
            org_domains = (org_resp.get("value") or [{}])[0].get("verifiedDomains", [])
            primary_domain = next(
                (d["name"] for d in org_domains if d.get("isDefault")),
                next((d["name"] for d in org_domains), None),
            )
        except Exception as exc:
            logger.warning("Could not fetch primary domain: %s", exc)

        # ── Device count ─────────────────────────────────────────────────────
        device_count = self._count_with_odata("/devices")

        # ── Global admins ─────────────────────────────────────────────────────
        global_admins = []
        GLOBAL_ADMIN_TEMPLATE_ID = "62e90394-69f5-4237-9190-012177145e10"
        try:
            roles = self._get("/directoryRoles?$select=id,displayName,roleTemplateId").get("value", [])
            ga_role = next(
                (r for r in roles if r.get("roleTemplateId") == GLOBAL_ADMIN_TEMPLATE_ID),
                None,
            )
            if ga_role:
                members = self._get(
                    f"/directoryRoles/{ga_role['id']}/members?$select=displayName,userPrincipalName"
                ).get("value", [])
                global_admins = [
                    {"name": m.get("displayName"), "upn": m.get("userPrincipalName")}
                    for m in members
                ]
        except Exception as exc:
            logger.warning("Could not fetch global admins: %s", exc)

        return {
            "total_users": total_users,
            "active_users": active_users,
            "licensed_users": licensed_users,
            "disabled_users": disabled_users,
            "total_licenses": total_licenses,
            "assigned_licenses": assigned_licenses,
            "available_licenses": total_licenses - assigned_licenses,
            "total_teams": total_teams,
            "sku_count": len(skus),
            "primary_domain": primary_domain,
            "device_count": device_count,
            "global_admins": global_admins,
        }

    def get_service_health(self) -> list:
        """
        Return the current health status for all M365 services.
        Requires ServiceHealth.Read.All.
        """
        try:
            raw = self._get("/admin/serviceAnnouncement/healthOverviews").get("value", [])
        except Exception as exc:
            logger.warning("Could not fetch service health: %s", exc)
            return []

        STATUS_MAP = {
            "serviceOperational":    ("operational", "Operacional"),
            "investigating":         ("warning",     "Investigando"),
            "restoringService":      ("warning",     "Restaurando"),
            "verifiedIssue":         ("warning",     "Problema verificado"),
            "serviceDegradation":    ("degraded",    "Degradado"),
            "serviceInterruption":   ("outage",      "Interrupção"),
            "extendedRecovery":      ("warning",     "Recuperação estendida"),
            "mitigated":             ("operational", "Mitigado"),
            "resolved":              ("operational", "Resolvido"),
            "falsePositive":         ("operational", "Falso positivo"),
        }
        result = []
        for svc in raw:
            raw_status = svc.get("status", "")
            status_key, status_label = STATUS_MAP.get(raw_status, ("unknown", raw_status))
            # Graph may return an empty displayName — fall back to id
            display = svc.get("displayName") or svc.get("id") or "Serviço desconhecido"
            result.append({
                "id": svc.get("id"),
                "displayName": display,
                "status": status_key,
                "statusLabel": status_label,
            })
        # Sort: non-operational first, then alphabetical
        return sorted(result, key=lambda x: (x["status"] == "operational", x["displayName"] or ""))
