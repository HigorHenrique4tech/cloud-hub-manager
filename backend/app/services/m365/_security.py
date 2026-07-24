"""M365 Security mixin — security overview, incidents, alerts."""

import logging
import requests

from ._base import GRAPH_V1, GRAPH_BETA

logger = logging.getLogger(__name__)


class SecurityMixin:
    """Security methods for M365Service."""

    def get_security_overview(self) -> dict:
        """
        Security summary:
        - MFA registration coverage (from beta credentialUserRegistrationDetails)
        - Risky users from Entra ID Identity Protection (requires P2 + IdentityRiskyUser.Read.All)
        Each data source tracks its own error so the UI can surface specific guidance.
        """
        # MFA registration details (Reports.Read.All + admin consent required)
        mfa_raw: list = []
        mfa_error: str | None = None
        try:
            mfa_raw = self._get_all_pages(
                "/reports/credentialUserRegistrationDetails", base=GRAPH_BETA
            )
        except Exception as exc:
            err_str = str(exc)
            logger.warning("Could not fetch MFA registration details: %s", exc)
            if "403" in err_str or "Forbidden" in err_str:
                mfa_error = "permission_denied"
            else:
                mfa_error = "error"

        total = len(mfa_raw)
        mfa_enabled = sum(1 for u in mfa_raw if u.get("isMfaRegistered"))
        users_without_mfa = [
            {
                "id": u.get("id"),
                "userPrincipalName": u.get("userPrincipalName"),
                "displayName": u.get("userDisplayName"),
                "authMethods": u.get("authMethods", []),
            }
            for u in mfa_raw
            if not u.get("isMfaRegistered")
        ][:50]

        # Risky users — requires Identity Protection (Azure AD P2) + IdentityRiskyUser.Read.All
        risky_users: list = []
        risky_error: str | None = None
        try:
            risky_raw = self._get_all_pages(
                "/identityProtection/riskyUsers",
                base=GRAPH_BETA,
            )
            risky_users = [
                u for u in risky_raw
                if u.get("riskLevel") not in (None, "none", "hidden")
            ]
        except Exception as exc:
            err_str = str(exc)
            logger.warning("Could not fetch risky users: %s", exc)
            if "403" in err_str or "Forbidden" in err_str:
                risky_error = "permission_denied"
            elif "404" in err_str:
                risky_error = "not_available"   # tenant doesn't have Identity Protection
            else:
                risky_error = "error"

        return {
            "total_users_checked": total,
            "mfa_enabled": mfa_enabled,
            "mfa_coverage_pct": round(mfa_enabled / total, 4) if total else 0.0,
            "mfa_error": mfa_error,
            "users_without_mfa": users_without_mfa,
            "risky_users_count": len(risky_users),
            "risky_users": [
                {
                    "id": u.get("id"),
                    "userPrincipalName": u.get("userPrincipalName"),
                    "riskLevel": u.get("riskLevel"),
                    "riskState": u.get("riskState"),
                }
                for u in risky_users[:20]
            ],
            "risky_error": risky_error,
        }

    def get_security_incidents(self, limit: int = 50) -> dict:
        """
        Fetch security incidents from Microsoft Defender via Graph API.
        Requires Application permission: SecurityIncident.Read.All (admin consent).
        Endpoint: GET /security/incidents
        """
        SECURITY_BASE = "https://graph.microsoft.com/v1.0"
        params = {
            "$top": min(limit, 100),
            "$orderby": "createdDateTime desc",
            "$select": (
                "id,displayName,severity,status,classification,"
                "determination,createdDateTime,lastUpdateDateTime,"
                "tags,comments,systemTags"
            ),
        }
        url = f"{SECURITY_BASE}/security/incidents"
        r = requests.get(url, headers=self._headers(), params=params, timeout=30)
        if r.status_code == 403:
            return {"incidents": [], "error": "permission_denied", "total": 0}
        r.raise_for_status()
        data = r.json()
        raw = data.get("value", [])
        incidents = []
        for inc in raw:
            alerts_raw = inc.get("alerts", []) or []
            products = []
            for a in alerts_raw:
                prod = a.get("serviceSource") or a.get("detectionSource") or ""
                if prod and prod not in products:
                    products.append(prod)
            incidents.append({
                "id": inc.get("id"),
                "title": inc.get("displayName") or "—",
                "severity": inc.get("severity", "unknown"),
                "status": inc.get("status", "unknown"),
                "classification": inc.get("classification"),
                "determination": inc.get("determination"),
                "created_at": inc.get("createdDateTime"),
                "updated_at": inc.get("lastUpdateDateTime"),
                "products": products,
                "alert_count": len(alerts_raw),
                "tags": inc.get("tags") or [],
            })
        return {"incidents": incidents, "total": len(incidents)}

    def get_security_alerts(self, limit: int = 50, severity: str = None) -> dict:
        """
        Fetch security alerts v2 from Microsoft Defender via Graph API.
        Requires Application permission: SecurityEvents.Read.All or SecurityAlert.Read.All (admin consent).
        Endpoint: GET /security/alerts_v2
        """
        SECURITY_BASE = "https://graph.microsoft.com/v1.0"
        params: dict = {
            "$top": min(limit, 100),
            "$orderby": "createdDateTime desc",
            "$select": (
                "id,title,severity,status,category,serviceSource,detectionSource,"
                "createdDateTime,lastUpdateDateTime,description,recommendedActions,"
                "incidentId,assignedTo,classification,determination"
            ),
        }
        if severity:
            params["$filter"] = f"severity eq '{severity}'"
        url = f"{SECURITY_BASE}/security/alerts_v2"
        r = requests.get(url, headers=self._headers(), params=params, timeout=30)
        if r.status_code == 403:
            return {"alerts": [], "error": "permission_denied", "total": 0}
        r.raise_for_status()
        data = r.json()
        raw = data.get("value", [])
        alerts = []
        for a in raw:
            alerts.append({
                "id": a.get("id"),
                "title": a.get("title") or "—",
                "severity": a.get("severity", "unknown"),
                "status": a.get("status", "unknown"),
                "category": a.get("category"),
                "service_source": a.get("serviceSource"),
                "detection_source": a.get("detectionSource"),
                "incident_id": a.get("incidentId"),
                "assigned_to": a.get("assignedTo"),
                "classification": a.get("classification"),
                "determination": a.get("determination"),
                "created_at": a.get("createdDateTime"),
                "updated_at": a.get("lastUpdateDateTime"),
                "description": a.get("description"),
                "recommended_actions": a.get("recommendedActions"),
            })
        return {"alerts": alerts, "total": len(alerts)}
