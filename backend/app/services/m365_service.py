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

    def _post(self, path: str, body: dict) -> dict:
        """POST to a Graph URL and return JSON response."""
        full_url = path if path.startswith("https://") else f"{GRAPH_V1}{path}"
        r = requests.post(full_url, headers=self._headers(), json=body, timeout=30)
        r.raise_for_status()
        return r.json() if r.content else {}

    # ── Public API ────────────────────────────────────────────────────────────

    def get_overview(self) -> dict:
        """
        Tenant summary: users, licenses, groups.
        Lightweight — uses $select to reduce payload.
        """
        users = self._get_all_pages(
            "/users", select="id,assignedLicenses,accountEnabled"
        )
        skus = self._get("/subscribedSkus").get("value", [])

        # Count groups via /groups (Directory.Read.All) — avoids Team.ReadBasic.All requirement.
        total_teams = 0
        try:
            r = requests.get(
                f"{GRAPH_V1}/groups",
                headers={**self._headers(), "ConsistencyLevel": "eventual"},
                params={"$count": "true", "$top": "1", "$select": "id"},
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
            total_teams = data.get("@odata.count", len(data.get("value", [])))
        except Exception as exc:
            logger.warning("Could not count groups: %s", exc)

        total_licenses = sum(s["prepaidUnits"]["enabled"] for s in skus)
        assigned_licenses = sum(s["consumedUnits"] for s in skus)

        return {
            "total_users": len(users),
            "active_users": sum(1 for u in users if u.get("accountEnabled")),
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
        signInActivity requires AuditLog.Read.All; if missing the call is retried
        without that field so users still load (lastSignIn will be null).
        """
        base_select = (
            "id,displayName,userPrincipalName,jobTitle,department,"
            "accountEnabled,assignedLicenses"
        )
        try:
            raw = self._get_all_pages(
                "/users",
                select=base_select + ",signInActivity",
            )
        except Exception as exc:
            if "403" in str(exc) or "Forbidden" in str(exc) or "Authorization_RequestDenied" in str(exc):
                logger.warning(
                    "signInActivity field requires AuditLog.Read.All — "
                    "retrying without it. Grant that permission in Azure AD for last-sign-in data."
                )
                raw = self._get_all_pages("/users", select=base_select)
            else:
                raise

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
        Falls back to the /groups endpoint (filtered for Teams) if /teams is
        unavailable (e.g. Team.ReadBasic.All not yet consented).
        """
        raw: list = []

        # Primary: /teams endpoint
        try:
            raw = self._get_all_pages(
                "/teams", select="id,displayName,visibility,description,isArchived"
            )
        except Exception as exc:
            logger.warning("GET /teams failed (%s) — trying /groups fallback", exc)

        # Fallback: list ALL Microsoft 365 Groups.
        # resourceProvisioningOptions can be empty even for real Teams groups
        # when provisioned outside the Teams UI — so we show all groups.
        if not raw:
            try:
                url = f"{GRAPH_V1}/groups"
                params = {
                    "$select": "id,displayName,visibility,description,resourceProvisioningOptions",
                    "$top": "999",
                }
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
                    raw.extend(data.get("value", []))
                    url = data.get("@odata.nextLink")
                    params = {}
                logger.info("Groups fallback: %d groups loaded", len(raw))
            except Exception as exc2:
                logger.warning("GET /groups fallback also failed: %s", exc2)

        result = []
        is_teams_source = True  # set False when result came from /groups fallback
        # Detect source: /teams items have isArchived field natively; /groups items don't
        if raw and "isArchived" not in raw[0]:
            is_teams_source = False

        for t in raw:
            member_count = None
            try:
                if is_teams_source:
                    # /teams/{id}/members — works when Team.ReadBasic.All is granted
                    resp = self._get(f"/teams/{t['id']}/members")
                else:
                    # /groups/{id}/members — works with Directory.Read.All
                    resp = self._get(f"/groups/{t['id']}/members")
                member_count = len(resp.get("value", []))
            except Exception:
                pass
            result.append(
                {
                    "id": t["id"],
                    "displayName": t.get("displayName"),
                    "visibility": t.get("visibility"),
                    "description": t.get("description"),
                    "isArchived": t.get("isArchived", False),
                    "membersCount": member_count,
                    "isTeam": "Team" in t.get("resourceProvisioningOptions", []) or is_teams_source,
                }
            )
        return result

    def get_team_members(self, team_id: str) -> list:
        """Return the full member list for a Team or M365 Group."""
        # Try /teams/{id}/members first; fall back to /groups/{id}/members
        try:
            raw = self._get(f"/teams/{team_id}/members").get("value", [])
        except Exception:
            raw = self._get(f"/groups/{team_id}/members").get("value", [])
        return [
            {
                "id": m["id"],
                "displayName": m.get("displayName"),
                "email": m.get("mail") or m.get("email") or m.get("userPrincipalName"),
                "roles": m.get("roles", []),
                "userId": m.get("id"),
            }
            for m in raw
            if m.get("@odata.type") in (
                "#microsoft.graph.user",
                "#microsoft.graph.aadUserConversationMember",
                None,
            )
        ]

    def create_user(
        self,
        display_name: str,
        upn: str,
        password: str,
        first_name: str = "",
        last_name: str = "",
        job_title: str = "",
        department: str = "",
        usage_location: str = "BR",
        mail_nickname: str = "",
        account_enabled: bool = True,
        force_change_password: bool = True,
    ) -> dict:
        """
        Create a new user in the tenant.
        Requires User.ReadWrite.All application permission.
        """
        nickname = mail_nickname or upn.split("@")[0]
        body: dict = {
            "accountEnabled": account_enabled,
            "displayName": display_name,
            "mailNickname": nickname,
            "userPrincipalName": upn,
            "usageLocation": usage_location,
            "passwordProfile": {
                "forceChangePasswordNextSignIn": force_change_password,
                "password": password,
            },
        }
        if first_name:
            body["givenName"] = first_name
        if last_name:
            body["surname"] = last_name
        if job_title:
            body["jobTitle"] = job_title
        if department:
            body["department"] = department
        return self._post("/users", body)

    def create_group(
        self,
        display_name: str,
        mail_nickname: str = "",
        description: str = "",
        group_type: str = "m365",
        visibility: str = "Private",
    ) -> dict:
        """
        Create a Microsoft 365 Group or Security Group.
        Requires Group.ReadWrite.All application permission.
        """
        nickname = mail_nickname or display_name.lower().replace(" ", "-")
        is_m365 = group_type == "m365"
        body: dict = {
            "displayName": display_name,
            "mailNickname": nickname,
            "mailEnabled": is_m365,
            "securityEnabled": not is_m365,
            "groupTypes": ["Unified"] if is_m365 else [],
        }
        if description:
            body["description"] = description
        if is_m365:
            body["visibility"] = visibility
        return self._post("/groups", body)

    def add_team_member(self, team_id: str, user_id: str, roles: list = None) -> dict:
        """
        Add a user to a Team or M365 Group.
        - Teams endpoint (TeamMember.ReadWrite.All): POST /teams/{id}/members
        - Groups fallback (Group.ReadWrite.All): POST /groups/{id}/members/$ref
        Falls back to the groups endpoint when the team ID refers to a plain
        M365 group (i.e. not provisioned as a Microsoft Teams team).
        """
        # Try Teams endpoint first
        try:
            body = {
                "@odata.type": "#microsoft.graph.aadUserConversationMember",
                "roles": roles or [],
                "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{user_id}')",
            }
            return self._post(f"/teams/{team_id}/members", body)
        except Exception as exc:
            # Only fall back on 403/404 — plain groups don't support /teams endpoint
            if not any(code in str(exc) for code in ("403", "404", "Forbidden", "NotFound")):
                raise
            logger.warning(
                "POST /teams/%s/members failed (%s) — retrying via /groups/$ref", team_id, exc
            )

        # Fallback: standard directory group member add (returns 204 No Content)
        ref_body = {
            "@odata.id": f"https://graph.microsoft.com/v1.0/directoryObjects/{user_id}"
        }
        return self._post(f"/groups/{team_id}/members/$ref", ref_body)

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

    # ── User authentication methods ───────────────────────────────────────────

    # Maps Graph @odata.type suffix → (type_key, beta endpoint segment)
    _METHOD_META: dict = {
        "microsoftAuthenticatorAuthenticationMethod": ("microsoftAuthenticator", "microsoftAuthenticatorMethods", "Microsoft Authenticator"),
        "phoneAuthenticationMethod":                  ("phone",                 "phoneAuthenticationMethods",              "Telefone"),
        "emailAuthenticationMethod":                  ("email",                 "emailAuthenticationMethods",              "E-mail"),
        "fido2AuthenticationMethod":                  ("fido2",                 "fido2Methods",                            "Chave FIDO2"),
        "windowsHelloForBusinessAuthenticationMethod":("windowsHello",          "windowsHelloForBusinessMethods",          "Windows Hello"),
        "temporaryAccessPassAuthenticationMethod":     ("tap",                   "temporaryAccessPassMethods",              "Acesso Temporário"),
        "softwareOathAuthenticationMethod":            ("oath",                  "softwareOathMethods",                     "App OATH"),
        "passwordAuthenticationMethod":                ("password",              None,                                      "Senha"),
    }

    def get_user_auth_methods(self, user_id: str) -> list:
        """
        Return all authentication methods registered for a user.
        Requires UserAuthenticationMethod.Read.All (beta endpoint).
        """
        try:
            raw = self._get_all_pages(
                f"/users/{user_id}/authentication/methods", base=GRAPH_BETA
            )
        except Exception as exc:
            logger.warning("Could not fetch auth methods for user %s: %s", user_id, exc)
            return []

        result = []
        for m in raw:
            odata = m.get("@odata.type", "")
            suffix = odata.split(".")[-1]
            type_key, _, label = self._METHOD_META.get(suffix, ("unknown", None, suffix))
            _, endpoint_seg, _ = self._METHOD_META.get(suffix, ("unknown", None, suffix))
            result.append({
                "id": m["id"],
                "methodType": type_key,
                "label": label,
                "detail": (
                    m.get("displayName")
                    or m.get("phoneNumber")
                    or m.get("emailAddress")
                    or m.get("device", {}).get("displayName")
                    or ""
                ),
                "createdDateTime": m.get("createdDateTime"),
                "deletable": type_key not in ("password",) and endpoint_seg is not None,
            })
        return result

    def revoke_user_sessions(self, user_id: str) -> dict:
        """
        Revoke all active sign-in sessions for a user.
        Requires User.ReadWrite.All.
        """
        url = f"{GRAPH_V1}/users/{user_id}/revokeSignInSessions"
        r = requests.post(url, headers=self._headers(), timeout=30)
        r.raise_for_status()
        return r.json() if r.content else {"value": True}

    def delete_user_auth_method(self, user_id: str, method_type: str, method_id: str) -> None:
        """
        Delete a specific authentication method for a user.
        Requires UserAuthenticationMethod.ReadWrite.All.
        method_type must be one of the type_key values in _METHOD_META.
        """
        # Find endpoint segment for this type key
        endpoint_seg = None
        for _, (key, seg, _) in self._METHOD_META.items():
            if key == method_type:
                endpoint_seg = seg
                break
        if not endpoint_seg:
            raise ValueError(f"Cannot delete method of type '{method_type}'")
        url = f"{GRAPH_BETA}/users/{user_id}/authentication/{endpoint_seg}/{method_id}"
        r = requests.delete(url, headers=self._headers(), timeout=30)
        r.raise_for_status()

    # ── User management actions ───────────────────────────────────────────────

    def toggle_user_account(self, user_id: str, enabled: bool) -> dict:
        """
        Enable or disable a user account.
        Requires User.ReadWrite.All.
        """
        url = f"{GRAPH_V1}/users/{user_id}"
        r = requests.patch(
            url,
            headers={**self._headers(), "Content-Type": "application/json"},
            json={"accountEnabled": enabled},
            timeout=30,
        )
        r.raise_for_status()
        return {"accountEnabled": enabled}

    def reset_user_password(
        self,
        user_id: str,
        new_password: str,
        force_change: bool = True,
    ) -> dict:
        """
        Reset a user's password.
        Requires User.ReadWrite.All. Cannot reset passwords of admins unless the caller has
        a higher-privileged admin role.
        """
        url = f"{GRAPH_V1}/users/{user_id}"
        r = requests.patch(
            url,
            headers={**self._headers(), "Content-Type": "application/json"},
            json={
                "passwordProfile": {
                    "forceChangePasswordNextSignIn": force_change,
                    "password": new_password,
                }
            },
            timeout=30,
        )
        r.raise_for_status()
        return {"detail": "Senha alterada com sucesso"}

    def create_tap(
        self,
        user_id: str,
        lifetime_minutes: int = 60,
        is_usable_once: bool = True,
    ) -> dict:
        """
        Create a Temporary Access Pass (TAP) for a user.
        The TAP code is returned in the response — show it to the admin immediately.
        Requires UserAuthenticationMethod.ReadWrite.All (beta).
        """
        body: dict = {
            "lifetimeInMinutes": max(10, min(lifetime_minutes, 480)),
            "isUsableOnce": is_usable_once,
        }
        url = f"{GRAPH_BETA}/users/{user_id}/authentication/temporaryAccessPassMethods"
        r = requests.post(
            url,
            headers={**self._headers(), "Content-Type": "application/json"},
            json=body,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        return {
            "id": data.get("id"),
            "temporaryAccessPass": data.get("temporaryAccessPass"),
            "lifetimeInMinutes": data.get("lifetimeInMinutes"),
            "startDateTime": data.get("startDateTime"),
            "isUsableOnce": data.get("isUsableOnce"),
        }

    def get_user_groups(self, user_id: str) -> list:
        """
        Return the groups a user is a direct member of.
        Requires Directory.Read.All.
        """
        try:
            raw = self._get_all_pages(
                f"/users/{user_id}/memberOf",
                select="id,displayName,groupTypes,securityEnabled,mailEnabled",
            )
        except Exception as exc:
            logger.warning("Could not fetch groups for user %s: %s", user_id, exc)
            return []
        return [
            {
                "id": obj["id"],
                "displayName": obj.get("displayName"),
                "isM365Group": "Unified" in obj.get("groupTypes", []),
                "isSecurity": obj.get("securityEnabled", False),
            }
            for obj in raw
            if obj.get("@odata.type") in (
                "#microsoft.graph.group",
                "#microsoft.graph.directoryRole",
                None,
            )
        ]

    # ── Service health ────────────────────────────────────────────────────────

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
            result.append({
                "id": svc.get("id"),
                "displayName": svc.get("displayName"),
                "status": status_key,
                "statusLabel": status_label,
            })
        # Sort: non-operational first, then alphabetical
        return sorted(result, key=lambda x: (x["status"] == "operational", x["displayName"] or ""))
