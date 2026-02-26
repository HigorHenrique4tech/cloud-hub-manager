"""
Microsoft 365 service — Microsoft Graph API integration.

Uses Client Credentials Flow (app-to-app), so no user sign-in is required.
The caller must have an Azure AD App Registration with the following
Application permissions (admin consent required):
  - User.Read.All
  - Organization.Read.All
  - Reports.Read.All
  - Team.ReadBasic.All
  - Directory.Read.All
  - IdentityRiskyUser.Read.All
  - SubscribedSku.Read.All
"""

import logging
import requests

logger = logging.getLogger(__name__)

try:
    import msal
    _MSAL_AVAILABLE = True
except ImportError:
    _MSAL_AVAILABLE = False
    logger.warning("msal not installed — M365 integration unavailable. Run: pip install msal>=1.28.0")


GRAPH_V1 = "https://graph.microsoft.com/v1.0"
GRAPH_BETA = "https://graph.microsoft.com/beta"


class M365AuthError(Exception):
    """Raised when MSAL token acquisition fails."""


class M365Service:
    """Thin wrapper around Microsoft Graph API for M365 data retrieval."""

    def __init__(self, tenant_id: str, client_id: str, client_secret: str):
        if not _MSAL_AVAILABLE:
            raise RuntimeError("msal package is not installed. Add msal>=1.28.0 to requirements.txt")
        self._app = msal.ConfidentialClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret,
        )

    # ── Auth ──────────────────────────────────────────────────────────────────

    def _get_token(self) -> str:
        result = self._app.acquire_token_for_client(
            scopes=["https://graph.microsoft.com/.default"]
        )
        if "access_token" not in result:
            raise M365AuthError(
                result.get("error_description") or result.get("error") or "Unknown M365 auth error"
            )
        return result["access_token"]

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_token()}"}

    # ── HTTP helpers ──────────────────────────────────────────────────────────

    def _get(self, url: str, params: dict = None) -> dict:
        """GET a single Graph URL (absolute or relative to v1)."""
        full_url = url if url.startswith("https://") else f"{GRAPH_V1}{url}"
        r = requests.get(full_url, headers=self._headers(), params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def _get_all_pages(self, path: str, select: str = None, base: str = GRAPH_V1) -> list:
        """Paginate via @odata.nextLink and return all items."""
        params: dict = {}
        if select:
            params["$select"] = select
        items: list = []
        url = f"{base}{path}"
        token = self._get_token()
        while url:
            r = requests.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
                params=params,
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
            items.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
            params = {}  # nextLink already includes query string
        return items

    # ── Public API ────────────────────────────────────────────────────────────

    def get_overview(self) -> dict:
        """
        Tenant summary: users, licenses, teams.
        Lightweight — uses $select to reduce payload.
        """
        users = self._get_all_pages(
            "/users", select="id,assignedLicenses,accountEnabled"
        )
        skus = self._get("/subscribedSkus").get("value", [])
        try:
            teams_resp = self._get("/teams", params={"$top": 1, "$count": "true"})
            total_teams = teams_resp.get("@odata.count", len(teams_resp.get("value", [])))
        except Exception:
            total_teams = 0

        total_licenses = sum(s["prepaidUnits"]["enabled"] for s in skus)
        assigned_licenses = sum(s["consumedUnits"] for s in skus)

        return {
            "total_users": len(users),
            "licensed_users": sum(
                1 for u in users if u.get("assignedLicenses") and u.get("accountEnabled")
            ),
            "disabled_users": sum(1 for u in users if not u.get("accountEnabled")),
            "total_licenses": total_licenses,
            "assigned_licenses": assigned_licenses,
            "available_licenses": total_licenses - assigned_licenses,
            "total_teams": total_teams,
            "sku_count": len(skus),
        }

    def get_users(self) -> list:
        """
        List all users with license count, last sign-in, and MFA status.
        MFA data comes from the beta endpoint (Reports.Read.All required).
        """
        raw = self._get_all_pages(
            "/users",
            select=(
                "id,displayName,userPrincipalName,jobTitle,department,"
                "accountEnabled,assignedLicenses,signInActivity"
            ),
        )

        # MFA registration details (beta)
        mfa_map: dict = {}
        try:
            mfa_items = self._get_all_pages(
                "/reports/credentialUserRegistrationDetails", base=GRAPH_BETA
            )
            mfa_map = {
                r["userPrincipalName"]: r.get("isMfaRegistered", False)
                for r in mfa_items
            }
        except Exception as exc:
            logger.warning("Could not fetch MFA details: %s", exc)

        return [
            {
                "id": u["id"],
                "displayName": u.get("displayName"),
                "userPrincipalName": u.get("userPrincipalName"),
                "jobTitle": u.get("jobTitle"),
                "department": u.get("department"),
                "accountEnabled": u.get("accountEnabled"),
                "licensedCount": len(u.get("assignedLicenses", [])),
                "lastSignIn": (u.get("signInActivity") or {}).get("lastSignInDateTime"),
                "mfaRegistered": mfa_map.get(u.get("userPrincipalName")),
            }
            for u in raw
        ]

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

    def get_teams(self) -> list:
        """
        List all Teams with member count.
        Note: fetching member count per team requires one extra call per team.
        """
        raw = self._get_all_pages("/teams", select="id,displayName,visibility")
        result = []
        for t in raw:
            try:
                members_resp = self._get(f"/teams/{t['id']}/members")
                member_count = len(members_resp.get("value", []))
            except Exception:
                member_count = None
            result.append(
                {
                    "id": t["id"],
                    "displayName": t.get("displayName"),
                    "visibility": t.get("visibility"),
                    "membersCount": member_count,
                }
            )
        return result

    def get_security_overview(self) -> dict:
        """
        Security summary:
        - MFA registration coverage (from beta credentialUserRegistrationDetails)
        - Risky users from Entra ID Identity Protection
        """
        # MFA
        mfa_raw: list = []
        try:
            mfa_raw = self._get_all_pages(
                "/reports/credentialUserRegistrationDetails", base=GRAPH_BETA
            )
        except Exception as exc:
            logger.warning("Could not fetch MFA registration details: %s", exc)

        total = len(mfa_raw)
        mfa_enabled = sum(1 for u in mfa_raw if u.get("isMfaRegistered"))
        users_without_mfa = [
            {
                "userPrincipalName": u.get("userPrincipalName"),
                "displayName": u.get("userDisplayName"),
            }
            for u in mfa_raw
            if not u.get("isMfaRegistered")
        ][:50]

        # Risky users (Entra ID Identity Protection)
        risky_users: list = []
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
            logger.warning("Could not fetch risky users: %s", exc)

        return {
            "total_users_checked": total,
            "mfa_enabled": mfa_enabled,
            "mfa_coverage_pct": round(mfa_enabled / total, 4) if total else 0.0,
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
        }
