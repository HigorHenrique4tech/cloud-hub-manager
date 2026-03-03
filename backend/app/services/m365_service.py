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
        self._tenant_id = tenant_id
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
        if not r.ok:
            try:
                err_body = r.json()
            except Exception:
                err_body = r.text
            logger.error(f"Graph API POST {path} {r.status_code}: {err_body}")
            raise Exception(f"Graph API {r.status_code}: {err_body}")
        return r.json() if r.content else {}

    # ── Exchange Online Admin API helpers ─────────────────────────────────────

    def _get_exo_token(self) -> str:
        """Acquire token for Exchange Online Admin API scope."""
        result = self._app.acquire_token_for_client(
            scopes=["https://outlook.office365.com/.default"]
        )
        if "access_token" not in result:
            raise M365AuthError(
                result.get("error_description") or result.get("error") or "EXO auth error"
            )
        return result["access_token"]

    def _exo_invoke(self, cmdlet: str, params: dict) -> dict:
        """Call Exchange Online Admin API beta InvokeCommand (requires Exchange.ManageAsApp)."""
        token = self._get_exo_token()
        url = f"https://outlook.office365.com/adminapi/beta/{self._tenant_id}/InvokeCommand"
        body = {"CmdletInput": {"CmdletName": cmdlet, "Parameters": params}}
        r = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-ResponseFormat": "json",
            },
            json=body,
            timeout=30,
        )
        if not r.ok:
            try:
                err = r.json()
            except Exception:
                err = r.text
            logger.error(f"EXO InvokeCommand {cmdlet} {r.status_code}: {err}")
            if r.status_code == 401:
                raise Exception(
                    "EXO_PERMISSION_REQUIRED: Permissão Exchange.ManageAsApp não configurada."
                )
            if ("isn't supported in this scenario" in str(err) or
                    "CmdletAccessDeniedException" in str(err) or
                    r.status_code == 403):
                raise Exception("EXO_RBAC_REQUIRED: Papel RBAC do Exchange não atribuído.")
            raise Exception(f"EXO API {r.status_code}: {err}")
        return r.json() if r.content else {}

    def _exo_mailbox(self, cmdlet: str, params: dict) -> dict:
        """Call Exchange Online Admin API v2.0 /Mailbox endpoint (official, for Set/Get-Mailbox)."""
        token = self._get_exo_token()
        url = f"https://outlook.office365.com/adminapi/v2.0/{self._tenant_id}/Mailbox"
        body = {"CmdletInput": {"CmdletName": cmdlet, "Parameters": params}}
        r = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-ResponseFormat": "json",
            },
            json=body,
            timeout=30,
        )
        if not r.ok:
            try:
                err = r.json()
            except Exception:
                err = r.text
            logger.error(f"EXO Mailbox {cmdlet} {r.status_code}: {err}")
            if r.status_code == 401:
                raise Exception(
                    "EXO_PERMISSION_REQUIRED: Permissão Exchange.ManageAsApp não configurada."
                )
            raise Exception(f"EXO API {r.status_code}: {err}")
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

    def get_groups(self) -> list:
        """
        List all groups in the tenant with type classification.
        Requires Directory.Read.All.
        """
        raw = self._get_all_pages(
            "/groups",
            select="id,displayName,description,groupTypes,mail,visibility,"
                   "resourceProvisioningOptions,createdDateTime,mailEnabled,securityEnabled",
        )
        result = []
        for g in raw:
            gtypes = g.get("groupTypes") or []
            is_team = "Team" in (g.get("resourceProvisioningOptions") or [])
            mail_enabled = g.get("mailEnabled", False)
            sec_enabled = g.get("securityEnabled", False)

            if "Unified" in gtypes:
                group_type = "M365 Group"
            elif mail_enabled and sec_enabled:
                group_type = "Mail-enabled Security"
            elif mail_enabled and not sec_enabled:
                group_type = "Distribution"
            else:
                group_type = "Security"

            result.append({
                "id": g["id"],
                "displayName": g.get("displayName"),
                "description": g.get("description"),
                "mail": g.get("mail"),
                "visibility": g.get("visibility"),
                "groupType": group_type,
                "isTeam": is_team,
                "createdDateTime": g.get("createdDateTime"),
            })
        return result

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
        import re
        # Strip @domain if user accidentally typed the full email address, then remove invalid chars
        raw = (mail_nickname or display_name.lower().replace(" ", "-")).split("@")[0]
        nickname = re.sub(r"[^a-zA-Z0-9-]", "", raw) or "group"
        is_m365 = group_type == "m365"
        is_dist = group_type == "distribution"
        # Graph API only supports: M365 Group, Security Group, Mail-enabled Security Group.
        # Pure distribution groups (mailEnabled=true, securityEnabled=false) are NOT creatable
        # via Graph API — use mail-enabled security group instead (functionally identical for email).
        body: dict = {
            "displayName": display_name,
            "mailNickname": nickname,
            "mailEnabled": is_m365 or is_dist,
            "securityEnabled": not is_m365,   # true for dist (mail-enabled security) and plain security
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

    # ── License assignment ────────────────────────────────────────────────────

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

    # ─────────────────────────────────────────────────────────────────────
    # SharePoint
    # ─────────────────────────────────────────────────────────────────────

    def get_sites(self, search: str = None) -> dict:
        """List SharePoint sites. Optionally filter by search term."""
        try:
            if search:
                url = f"{GRAPH_V1}/sites?search={search}&$top=50"
            else:
                url = f"{GRAPH_V1}/sites?search=*&$top=50"
            resp = self._get(url)
            sites = []
            for s in resp.get("value", []):
                sites.append({
                    "id": s.get("id"),
                    "name": s.get("name") or s.get("displayName"),
                    "display_name": s.get("displayName"),
                    "web_url": s.get("webUrl"),
                    "description": s.get("description", ""),
                    "created_at": s.get("createdDateTime"),
                    "last_modified": s.get("lastModifiedDateTime"),
                })
            return {"sites": sites, "total": len(sites)}
        except Exception as e:
            logger.error(f"Error getting SharePoint sites: {e}")
            return {"sites": [], "total": 0, "error": str(e)}

    def get_site(self, site_id: str) -> dict:
        """Get details of a specific SharePoint site."""
        try:
            s = self._get(f"{GRAPH_V1}/sites/{site_id}")
            return {
                "id": s.get("id"),
                "name": s.get("name") or s.get("displayName"),
                "display_name": s.get("displayName"),
                "web_url": s.get("webUrl"),
                "description": s.get("description", ""),
                "created_at": s.get("createdDateTime"),
                "last_modified": s.get("lastModifiedDateTime"),
                "site_collection": s.get("siteCollection"),
            }
        except Exception as e:
            logger.error(f"Error getting site {site_id}: {e}")
            return {"error": str(e)}

    def get_site_drives(self, site_id: str) -> dict:
        """List document libraries (drives) in a SharePoint site."""
        try:
            resp = self._get(f"{GRAPH_V1}/sites/{site_id}/drives")
            drives = []
            for d in resp.get("value", []):
                quota = d.get("quota", {})
                drives.append({
                    "id": d.get("id"),
                    "name": d.get("name"),
                    "drive_type": d.get("driveType"),
                    "web_url": d.get("webUrl"),
                    "quota_used": quota.get("used", 0),
                    "quota_total": quota.get("total", 0),
                    "quota_remaining": quota.get("remaining", 0),
                    "last_modified": d.get("lastModifiedDateTime"),
                })
            return {"drives": drives, "total": len(drives)}
        except Exception as e:
            logger.error(f"Error getting drives for site {site_id}: {e}")
            return {"drives": [], "total": 0, "error": str(e)}

    def get_drive_items(self, drive_id: str, folder_id: str = None) -> dict:
        """List items in a drive (root or a specific folder)."""
        try:
            if folder_id:
                url = f"{GRAPH_V1}/drives/{drive_id}/items/{folder_id}/children"
            else:
                url = f"{GRAPH_V1}/drives/{drive_id}/root/children"
            resp = self._get(f"{url}?$top=100&$select=id,name,size,file,folder,lastModifiedDateTime,webUrl")
            items = []
            for item in resp.get("value", []):
                items.append({
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "is_folder": "folder" in item,
                    "size": item.get("size", 0),
                    "web_url": item.get("webUrl"),
                    "last_modified": item.get("lastModifiedDateTime"),
                    "mime_type": (item.get("file") or {}).get("mimeType"),
                    "child_count": (item.get("folder") or {}).get("childCount", 0),
                })
            return {"items": items, "total": len(items)}
        except Exception as e:
            logger.error(f"Error getting drive items for {drive_id}: {e}")
            return {"items": [], "total": 0, "error": str(e)}

    def get_sharepoint_usage(self) -> dict:
        """Get SharePoint site usage report (last 30 days)."""
        import csv, io
        try:
            token = self._get_token()
            resp = requests.get(
                f"{GRAPH_V1}/reports/getSharePointSiteUsageDetail(period='D30')",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            resp.raise_for_status()
            reader = csv.DictReader(io.StringIO(resp.text))
            sites = []
            for row in reader:
                try:
                    sites.append({
                        "site_url": row.get("Site URL", ""),
                        "owner": row.get("Owner Display Name", ""),
                        "storage_used_bytes": int(row.get("Storage Used (Byte)", 0) or 0),
                        "storage_allocated_bytes": int(row.get("Storage Allocated (Byte)", 0) or 0),
                        "file_count": int(row.get("File Count", 0) or 0),
                        "last_activity": row.get("Last Activity Date", ""),
                        "page_views": int(row.get("Page View Count", 0) or 0),
                    })
                except Exception:
                    continue
            sites.sort(key=lambda x: x["storage_used_bytes"], reverse=True)
            return {"sites": sites, "total": len(sites)}
        except Exception as e:
            logger.error(f"Error getting SharePoint usage: {e}")
            return {"sites": [], "total": 0, "error": str(e)}

    # ─────────────────────────────────────────────────────────────────────
    # Exchange
    # ─────────────────────────────────────────────────────────────────────

    def get_mailboxes(self) -> dict:
        """List users (mailboxes). mailboxSettings cannot be $selected on the
        collection endpoint — individual settings are loaded per-user via
        get_mailbox_settings()."""
        try:
            resp = self._get(
                f"{GRAPH_V1}/users?$select=id,displayName,mail,userPrincipalName,"
                f"accountEnabled&$top=999"
            )
            mailboxes = []
            for u in resp.get("value", []):
                if not u.get("mail"):
                    continue  # skip service accounts / unlicensed users without mailbox
                mailboxes.append({
                    "id": u.get("id"),
                    "display_name": u.get("displayName"),
                    "mail": u.get("mail"),
                    "upn": u.get("userPrincipalName"),
                    "account_enabled": u.get("accountEnabled", True),
                })
            return {"mailboxes": mailboxes, "total": len(mailboxes)}
        except Exception as e:
            logger.error(f"Error getting mailboxes: {e}")
            return {"mailboxes": [], "total": 0, "error": str(e)}

    def get_mailbox_settings(self, user_id: str) -> dict:
        """Get detailed mailbox settings for a user."""
        try:
            ms = self._get(f"{GRAPH_V1}/users/{user_id}/mailboxSettings")
            auto_reply = ms.get("automaticRepliesSetting") or {}
            return {
                "auto_reply_status": auto_reply.get("status", "disabled"),
                "auto_reply_internal_message": auto_reply.get("internalReplyMessage", ""),
                "auto_reply_external_message": auto_reply.get("externalReplyMessage", ""),
                "auto_reply_scheduled_start": auto_reply.get("scheduledStartDateTime", {}).get("dateTime"),
                "auto_reply_scheduled_end": auto_reply.get("scheduledEndDateTime", {}).get("dateTime"),
                "timezone": ms.get("timeZone", ""),
                "language": (ms.get("language") or {}).get("displayName", ""),
                "language_locale": (ms.get("language") or {}).get("locale", ""),
                "archive_folder": ms.get("archiveFolder", ""),
            }
        except Exception as e:
            logger.error(f"Error getting mailbox settings for {user_id}: {e}")
            return {"error": str(e)}

    def update_mailbox_settings(self, user_id: str, settings: dict) -> dict:
        """Update mailbox settings for a user."""
        try:
            payload = {}
            if "auto_reply_enabled" in settings or "auto_reply_message" in settings:
                status = "enabled" if settings.get("auto_reply_enabled") else "disabled"
                auto_reply: dict = {"status": status}
                if settings.get("auto_reply_message"):
                    auto_reply["internalReplyMessage"] = settings["auto_reply_message"]
                    auto_reply["externalReplyMessage"] = settings["auto_reply_message"]
                payload["automaticRepliesSetting"] = auto_reply
            if settings.get("timezone"):
                payload["timeZone"] = settings["timezone"]
            token = self._get_token()
            resp = requests.patch(
                f"{GRAPH_V1}/users/{user_id}/mailboxSettings",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
            return {"updated": True}
        except Exception as e:
            logger.error(f"Error updating mailbox settings for {user_id}: {e}")
            raise

    def get_email_activity(self) -> dict:
        """Get email activity report for the last 30 days."""
        import csv, io
        try:
            token = self._get_token()
            resp = requests.get(
                f"{GRAPH_V1}/reports/getEmailActivityUserDetail(period='D30')",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            resp.raise_for_status()
            reader = csv.DictReader(io.StringIO(resp.text))
            activity = []
            for row in reader:
                try:
                    activity.append({
                        "upn": row.get("User Principal Name", ""),
                        "display_name": row.get("Display Name", ""),
                        "send_count": int(row.get("Send Count", 0) or 0),
                        "receive_count": int(row.get("Receive Count", 0) or 0),
                        "read_count": int(row.get("Read Count", 0) or 0),
                        "last_activity": row.get("Last Activity Date", ""),
                    })
                except Exception:
                    continue
            return {"activity": activity, "total": len(activity)}
        except Exception as e:
            logger.error(f"Error getting email activity: {e}")
            return {"activity": [], "total": 0, "error": str(e)}

    # ─────────────────────────────────────────────────────────────────────
    # Teams Admin
    # ─────────────────────────────────────────────────────────────────────

    def create_team(self, display_name: str, description: str = "", visibility: str = "Private") -> dict:
        """Create a new Microsoft Team."""
        return self._post("/teams", {
            "template@odata.bind": "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
            "displayName": display_name,
            "description": description,
            "visibility": visibility,
        })

    def update_team(self, team_id: str, settings: dict) -> dict:
        """Update team settings (displayName, description, visibility)."""
        payload = {}
        if settings.get("display_name"):
            payload["displayName"] = settings["display_name"]
        if settings.get("description") is not None:
            payload["description"] = settings["description"]
        if settings.get("visibility"):
            payload["visibility"] = settings["visibility"]
        token = self._get_token()
        resp = requests.patch(
            f"{GRAPH_V1}/teams/{team_id}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        if resp.status_code not in (200, 204):
            raise Exception(f"Update team failed: {resp.status_code} {resp.text}")
        return {"updated": True}

    def archive_team(self, team_id: str) -> dict:
        """Archive a team."""
        return self._post(f"/teams/{team_id}/archive", {})

    def get_channels(self, team_id: str) -> dict:
        """List channels in a team."""
        try:
            resp = self._get(f"{GRAPH_V1}/teams/{team_id}/channels")
            channels = []
            for c in resp.get("value", []):
                channels.append({
                    "id": c.get("id"),
                    "display_name": c.get("displayName"),
                    "description": c.get("description", ""),
                    "membership_type": c.get("membershipType", "standard"),
                    "is_favorite_by_default": c.get("isFavoriteByDefault"),
                    "web_url": c.get("webUrl"),
                    "created_at": c.get("createdDateTime"),
                })
            return {"channels": channels, "total": len(channels)}
        except Exception as e:
            logger.error(f"Error getting channels for team {team_id}: {e}")
            return {"channels": [], "total": 0, "error": str(e)}

    def create_channel(self, team_id: str, display_name: str, description: str = "",
                       channel_type: str = "standard") -> dict:
        """Create a channel in a team."""
        return self._post(f"/teams/{team_id}/channels", {
            "displayName": display_name,
            "description": description,
            "membershipType": channel_type,
        })

    def delete_channel(self, team_id: str, channel_id: str) -> dict:
        """Delete a channel from a team."""
        token = self._get_token()
        resp = requests.delete(
            f"{GRAPH_V1}/teams/{team_id}/channels/{channel_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if resp.status_code not in (200, 204):
            raise Exception(f"Delete channel failed: {resp.status_code} {resp.text}")
        return {"deleted": True}

    def update_member_role(self, team_id: str, member_id: str, roles: list) -> dict:
        """Update member role in a team. roles=[] for member, ['owner'] for owner."""
        token = self._get_token()
        resp = requests.patch(
            f"{GRAPH_V1}/teams/{team_id}/members/{member_id}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"@odata.type": "#microsoft.graph.aadUserConversationMember", "roles": roles},
            timeout=30,
        )
        if resp.status_code not in (200, 204):
            raise Exception(f"Update member role failed: {resp.status_code} {resp.text}")
        return {"updated": True}

    def remove_team_member(self, team_id: str, member_id: str) -> dict:
        """Remove a member from a team."""
        token = self._get_token()
        resp = requests.delete(
            f"{GRAPH_V1}/teams/{team_id}/members/{member_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if resp.status_code not in (200, 204):
            raise Exception(f"Remove team member failed: {resp.status_code} {resp.text}")
        return {"removed": True}

    def get_teams_activity(self) -> dict:
        """Get Teams user activity report (last 30 days)."""
        import csv, io
        try:
            token = self._get_token()
            resp = requests.get(
                f"{GRAPH_V1}/reports/getTeamsUserActivityUserDetail(period='D30')",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            resp.raise_for_status()
            reader = csv.DictReader(io.StringIO(resp.text))
            activity = []
            for row in reader:
                try:
                    activity.append({
                        "upn": row.get("User Principal Name", ""),
                        "display_name": row.get("Display Name", ""),
                        "channel_messages": int(row.get("Team Chat Message Count", 0) or 0),
                        "private_messages": int(row.get("Private Chat Message Count", 0) or 0),
                        "calls": int(row.get("Call Count", 0) or 0),
                        "meetings": int(row.get("Meeting Count", 0) or 0),
                        "screen_share_duration": int(row.get("Screen Share Duration", 0) or 0),
                        "last_activity": row.get("Last Activity Date", ""),
                    })
                except Exception:
                    continue
            return {"activity": activity, "total": len(activity)}
        except Exception as e:
            logger.error(f"Error getting Teams activity: {e}")
            return {"activity": [], "total": 0, "error": str(e)}

    # ─────────────────────────────────────────────────────────────────────
    # Guest Users
    # ─────────────────────────────────────────────────────────────────────

    def get_guests(self) -> dict:
        """List all guest users in the tenant."""
        try:
            select = (
                "id,displayName,mail,userPrincipalName,accountEnabled,"
                "createdDateTime,externalUserState,externalUserStateChangeDateTime,companyName"
            )
            resp = self._get(
                f"{GRAPH_V1}/users?$filter=userType eq 'Guest'"
                f"&$select={select}&$top=999"
            )
            guests = []
            for u in resp.get("value", []):
                guests.append({
                    "id": u.get("id"),
                    "display_name": u.get("displayName"),
                    "mail": u.get("mail") or u.get("userPrincipalName"),
                    "upn": u.get("userPrincipalName"),
                    "account_enabled": u.get("accountEnabled", True),
                    "created_at": u.get("createdDateTime"),
                    "invitation_state": u.get("externalUserState", "PendingAcceptance"),
                    "invitation_accepted_at": u.get("externalUserStateChangeDateTime"),
                    "company_name": u.get("companyName", ""),
                })
            return {"guests": guests, "total": len(guests)}
        except Exception as e:
            logger.error(f"Error getting guests: {e}")
            return {"guests": [], "total": 0, "error": str(e)}

    def invite_guest(self, email: str, display_name: str = "",
                     redirect_url: str = "https://myapps.microsoft.com",
                     message: str = "") -> dict:
        """Send an invitation to an external guest user."""
        body: dict = {
            "invitedUserEmailAddress": email,
            "inviteRedirectUrl": redirect_url,
            "sendInvitationMessage": True,
        }
        if display_name:
            body["invitedUserDisplayName"] = display_name
        msg_info: dict = {"messageLanguage": "pt-BR"}
        if message:
            msg_info["customizedMessageBody"] = message
        body["invitedUserMessageInfo"] = msg_info
        result = self._post("/invitations", body)
        return {
            "id": result.get("id"),
            "invite_redeem_url": result.get("inviteRedeemUrl"),
            "status": result.get("status", "PendingAcceptance"),
        }

    def delete_guest(self, user_id: str) -> dict:
        """Permanently delete a guest user from the tenant."""
        token = self._get_token()
        resp = requests.delete(
            f"{GRAPH_V1}/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if resp.status_code not in (200, 204):
            raise Exception(f"Delete guest failed: {resp.status_code} {resp.text}")
        return {"deleted": True}

    # ─────────────────────────────────────────────────────────────────────
    # Audit Logs
    # ─────────────────────────────────────────────────────────────────────

    def get_sign_ins(self, limit: int = 50, upn: str = None, status: str = None) -> dict:
        """List sign-in logs. Requires AuditLog.Read.All."""
        try:
            filters = []
            if upn:
                filters.append(f"userPrincipalName eq '{upn}'")
            if status == "success":
                filters.append("status/errorCode eq 0")
            elif status == "failure":
                filters.append("status/errorCode ne 0")
            url = f"{GRAPH_V1}/auditLogs/signIns?$top={limit}&$orderby=createdDateTime desc"
            if filters:
                url += f"&$filter={' and '.join(filters)}"
            resp = self._get(url)
            sign_ins = []
            for s in resp.get("value", []):
                loc = s.get("location") or {}
                geo = loc.get("geoCoordinates") or {}
                sign_ins.append({
                    "id": s.get("id"),
                    "user_display_name": s.get("userDisplayName"),
                    "upn": s.get("userPrincipalName"),
                    "app_display_name": s.get("appDisplayName"),
                    "ip_address": s.get("ipAddress"),
                    "city": loc.get("city"),
                    "country": loc.get("countryOrRegion"),
                    "status_code": (s.get("status") or {}).get("errorCode", 0),
                    "status_reason": (s.get("status") or {}).get("failureReason", ""),
                    "created_at": s.get("createdDateTime"),
                    "client_app_used": s.get("clientAppUsed"),
                    "conditional_access": s.get("conditionalAccessStatus"),
                    "device_os": (s.get("deviceDetail") or {}).get("operatingSystem"),
                    "browser": (s.get("deviceDetail") or {}).get("browser"),
                })
            return {"sign_ins": sign_ins, "total": len(sign_ins)}
        except Exception as e:
            logger.error(f"Error getting sign-ins: {e}")
            return {"sign_ins": [], "total": 0, "error": str(e)}

    def get_directory_audits(self, limit: int = 50, category: str = None) -> dict:
        """List directory audit logs. Requires AuditLog.Read.All."""
        try:
            url = f"{GRAPH_V1}/auditLogs/directoryAudits?$top={limit}&$orderby=activityDateTime desc"
            if category and category != "all":
                url += f"&$filter=category eq '{category}'"
            resp = self._get(url)
            audits = []
            for a in resp.get("value", []):
                initiated = (a.get("initiatedBy") or {})
                initiated_user = initiated.get("user") or {}
                initiated_app = initiated.get("app") or {}
                initiator_upn = initiated_user.get("userPrincipalName") or initiated_app.get("displayName", "")
                initiator_name = initiated_user.get("displayName") or initiated_app.get("displayName", "")
                targets = a.get("targetResources") or []
                target_name = targets[0].get("displayName") if targets else ""
                audits.append({
                    "id": a.get("id"),
                    "category": a.get("category"),
                    "activity_display_name": a.get("activityDisplayName"),
                    "result": a.get("result"),
                    "result_reason": a.get("resultReason", ""),
                    "initiated_by_upn": initiator_upn,
                    "initiated_by_display_name": initiator_name,
                    "target_display_name": target_name,
                    "activity_at": a.get("activityDateTime"),
                    "log_id": a.get("correlationId"),
                })
            return {"audits": audits, "total": len(audits)}
        except Exception as e:
            logger.error(f"Error getting directory audits: {e}")
            return {"audits": [], "total": 0, "error": str(e)}

    # ─────────────────────────────────────────────────────────────────────
    # OneDrive Usage
    # ─────────────────────────────────────────────────────────────────────

    def get_onedrive_usage(self) -> dict:
        """Get OneDrive usage per user (last 30 days). Requires Reports.Read.All."""
        import csv, io
        try:
            token = self._get_token()
            resp = requests.get(
                f"{GRAPH_V1}/reports/getOneDriveUsageAccountDetail(period='D30')",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            resp.raise_for_status()
            reader = csv.DictReader(io.StringIO(resp.text))
            usage = []
            for row in reader:
                try:
                    usage.append({
                        "upn": row.get("Owner Principal Name", ""),
                        "display_name": row.get("Owner Display Name", ""),
                        "is_deleted": row.get("Is Deleted", "False").lower() == "true",
                        "last_activity": row.get("Last Activity Date", ""),
                        "file_count": int(row.get("File Count", 0) or 0),
                        "storage_used_bytes": int(row.get("Storage Used (Byte)", 0) or 0),
                        "storage_allocated_bytes": int(row.get("Storage Allocated (Byte)", 0) or 0),
                    })
                except Exception:
                    continue
            usage.sort(key=lambda x: x["storage_used_bytes"], reverse=True)
            return {"usage": usage, "total": len(usage)}
        except Exception as e:
            logger.error(f"Error getting OneDrive usage: {e}")
            return {"usage": [], "total": 0, "error": str(e)}

    # ─────────────────────────────────────────────────────────────────────
    # Offboarding
    # ─────────────────────────────────────────────────────────────────────

    def offboard_user(self, user_id: str, options: dict) -> dict:
        """Orchestrate user offboarding. Non-fatal per step."""
        results = {}

        if options.get("disable_account", True):
            try:
                self.toggle_user_account(user_id, False)
                results["disable_account"] = True
            except Exception as e:
                results["disable_account"] = str(e)

        if options.get("revoke_sessions", True):
            try:
                self.revoke_user_sessions(user_id)
                results["revoke_sessions"] = True
            except Exception as e:
                results["revoke_sessions"] = str(e)

        if options.get("remove_licenses", False):
            try:
                # Fetch current licenses and remove all
                user = self._get(f"{GRAPH_V1}/users/{user_id}?$select=assignedLicenses")
                assigned = user.get("assignedLicenses") or []
                if assigned:
                    sku_ids = [lic["skuId"] for lic in assigned]
                    self._post(f"/users/{user_id}/assignLicense", {
                        "addLicenses": [],
                        "removeLicenses": sku_ids,
                    })
                results["remove_licenses"] = True
            except Exception as e:
                results["remove_licenses"] = str(e)

        auto_reply_msg = options.get("auto_reply_message")
        if auto_reply_msg:
            try:
                self.update_mailbox_settings(user_id, {
                    "auto_reply_enabled": True,
                    "auto_reply_message": auto_reply_msg,
                })
                results["auto_reply"] = True
            except Exception as e:
                results["auto_reply"] = str(e)

        return {"results": results}

    # ─────────────────────────────────────────────────────────────────────
    # Shared Mailboxes & Distribution Lists
    # ─────────────────────────────────────────────────────────────────────

    def get_shared_mailboxes(self) -> dict:
        """List shared mailboxes by filtering disabled accounts and verifying userPurpose='shared'.
        Requires User.Read.All + MailboxSettings.Read."""
        try:
            token = self._get_token()
            # Shared mailboxes always have accountEnabled=false in Azure AD
            resp = requests.get(
                f"{GRAPH_V1}/users",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "$filter": "accountEnabled eq false and mail ne null and userType eq 'Member'",
                    "$select": "id,displayName,mail,userPrincipalName,accountEnabled",
                    "$top": "100",
                },
                timeout=30,
            )
            resp.raise_for_status()
            candidates = resp.json().get("value", [])

            # Verify each candidate is actually a shared mailbox via mailboxSettings/userPurpose
            shared = []
            for user in candidates:
                try:
                    purpose_r = requests.get(
                        f"{GRAPH_V1}/users/{user['id']}/mailboxSettings",
                        headers={"Authorization": f"Bearer {token}"},
                        params={"$select": "userPurpose"},
                        timeout=10,
                    )
                    if purpose_r.ok and purpose_r.json().get("userPurpose") == "shared":
                        shared.append(user)
                except Exception:
                    pass

            mailboxes = [
                {
                    "id": u.get("id"),
                    "display_name": u.get("displayName"),
                    "mail": u.get("mail"),
                    "upn": u.get("userPrincipalName"),
                    "account_enabled": u.get("accountEnabled", False),
                }
                for u in shared
            ]
            return {"mailboxes": mailboxes, "total": len(mailboxes)}
        except Exception as e:
            logger.error(f"Error getting shared mailboxes: {e}")
            return {"mailboxes": [], "total": 0, "error": str(e)}

    def get_distribution_lists(self) -> dict:
        """List mail-enabled groups (distribution, mail-enabled security, M365).
        Graph API only supports creating M365 Groups as mail-enabled groups, so newly
        created distribution groups appear as M365 Groups. Reuses get_groups()."""
        try:
            all_groups = self.get_groups()
            dist = [g for g in all_groups if g.get("groupType") in ("Distribution", "Mail-enabled Security", "M365 Group")]
            return {"distribution_lists": dist, "total": len(dist)}
        except Exception as e:
            logger.error(f"Error getting distribution lists: {e}")
            return {"distribution_lists": [], "total": 0, "error": str(e)}

    def get_distribution_list_members(self, group_id: str) -> dict:
        """List members of a distribution group."""
        try:
            resp = self._get(
                f"/groups/{group_id}/members"
                "?$select=id,displayName,mail,userPrincipalName&$top=200"
            )
            members = [
                {
                    "id": m.get("id"),
                    "display_name": m.get("displayName"),
                    "mail": m.get("mail"),
                    "upn": m.get("userPrincipalName"),
                }
                for m in resp.get("value", [])
            ]
            return {"members": members, "total": len(members)}
        except Exception as e:
            logger.error(f"Error getting distribution list members: {e}")
            return {"members": [], "total": 0, "error": str(e)}

    def add_distribution_list_member(self, group_id: str, user_id: str) -> dict:
        """Add a user to a distribution group via directory reference."""
        token = self._get_token()
        body = {"@odata.id": f"{GRAPH_V1}/directoryObjects/{user_id}"}
        resp = requests.post(
            f"{GRAPH_V1}/groups/{group_id}/members/$ref",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body,
            timeout=30,
        )
        if resp.status_code not in (200, 204):
            raise Exception(f"Add member failed: {resp.status_code} {resp.text}")
        return {"added": True}

    def remove_distribution_list_member(self, group_id: str, user_id: str) -> dict:
        """Remove a user from a distribution group."""
        token = self._get_token()
        resp = requests.delete(
            f"{GRAPH_V1}/groups/{group_id}/members/{user_id}/$ref",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if resp.status_code not in (200, 204):
            raise Exception(f"Remove member failed: {resp.status_code} {resp.text}")
        return {"removed": True}

    # ── Domains ───────────────────────────────────────────────────────────────

    def get_domains(self) -> list:
        """List verified tenant domains. Requires Domain.Read.All."""
        try:
            resp = self._get("/domains?$select=id,isDefault,isInitial,isVerified")
            domains = [
                {
                    "id": d.get("id"),
                    "is_default": d.get("isDefault", False),
                    "is_initial": d.get("isInitial", False),
                }
                for d in resp.get("value", [])
                if d.get("isVerified")
            ]
            return sorted(domains, key=lambda d: (not d["is_default"], d["is_initial"], d["id"]))
        except Exception as e:
            logger.error(f"Error getting domains: {e}")
            return []

    # ── Shared Mailbox Management ─────────────────────────────────────────────

    def create_shared_mailbox(
        self, display_name: str, alias: str, domain: str, description: str = ""
    ) -> dict:
        """Create a shared mailbox via Exchange Online Admin API beta InvokeCommand.
        Requires Exchange.ManageAsApp permission + Recipient Management RBAC role."""
        import re
        clean_alias = re.sub(r"[^a-zA-Z0-9._-]", "", alias)
        params: dict = {
            "Shared": True,
            "Name": display_name,
            "DisplayName": display_name,
            "Alias": clean_alias,
            "PrimarySmtpAddress": f"{clean_alias}@{domain}",
        }
        if description:
            params["Notes"] = description
        return self._exo_invoke("New-Mailbox", params)

    # ── Mailbox Delegation ────────────────────────────────────────────────────

    def get_mailbox_delegates(self, mailbox_upn: str) -> dict:
        """Get Full Access, Send As and Send on Behalf delegates for a mailbox.
        Requires Exchange.ManageAsApp permission."""
        result: dict = {"full_access": [], "send_as": [], "send_on_behalf": []}

        # Full Access (Read and Manage)
        try:
            r = self._exo_invoke("Get-MailboxPermission", {"Identity": mailbox_upn})
            result["full_access"] = [
                {"user": p.get("User"), "access_rights": p.get("AccessRights")}
                for p in (r.get("value") or [])
                if p.get("User") and "NT AUTHORITY" not in str(p.get("User", ""))
                and "FullAccess" in str(p.get("AccessRights", ""))
            ]
        except Exception as e:
            logger.warning(f"Could not get FullAccess delegates: {e}")
            result["full_access_error"] = str(e)

        # Send As
        try:
            r = self._exo_invoke("Get-RecipientPermission", {"Identity": mailbox_upn})
            result["send_as"] = [
                {"user": p.get("Trustee"), "access_rights": p.get("AccessRights")}
                for p in (r.get("value") or [])
                if p.get("Trustee") and "NT AUTHORITY" not in str(p.get("Trustee", ""))
            ]
        except Exception as e:
            logger.warning(f"Could not get SendAs delegates: {e}")
            result["send_as_error"] = str(e)

        # Send on Behalf (via official v2.0 Mailbox endpoint)
        try:
            r = self._exo_mailbox("Get-Mailbox", {"Identity": mailbox_upn})
            mb = (r.get("value") or [{}])[0]
            raw = mb.get("GrantSendOnBehalfToWithDisplayNames") or mb.get("GrantSendOnBehalfTo") or []
            result["send_on_behalf"] = [{"user": u} for u in raw if u]
        except Exception as e:
            logger.warning(f"Could not get SendOnBehalf delegates: {e}")
            result["send_on_behalf_error"] = str(e)

        return result

    def add_mailbox_delegate(
        self, mailbox_upn: str, delegate_upn: str, permission_type: str
    ) -> dict:
        """Add a mailbox delegate. permission_type: full_access | send_as | send_on_behalf"""
        if permission_type == "full_access":
            self._exo_invoke("Add-MailboxPermission", {
                "Identity": mailbox_upn,
                "User": delegate_upn,
                "AccessRights": ["FullAccess"],
                "InheritanceType": "All",
                "AutoMapping": False,
                "Confirm": False,
            })
        elif permission_type == "send_as":
            self._exo_invoke("Add-RecipientPermission", {
                "Identity": mailbox_upn,
                "Trustee": delegate_upn,
                "AccessRights": ["SendAs"],
                "Confirm": False,
            })
        elif permission_type == "send_on_behalf":
            self._exo_mailbox("Set-Mailbox", {
                "Identity": mailbox_upn,
                "GrantSendOnBehalfTo": {
                    "add": [delegate_upn],
                    "@odata.type": "#Exchange.GenericHashTable",
                },
            })
        else:
            raise ValueError(f"Unknown permission_type: {permission_type}")
        return {"added": True, "permission_type": permission_type}

    def remove_mailbox_delegate(
        self, mailbox_upn: str, delegate_upn: str, permission_type: str
    ) -> dict:
        """Remove a mailbox delegate."""
        if permission_type == "full_access":
            self._exo_invoke("Remove-MailboxPermission", {
                "Identity": mailbox_upn,
                "User": delegate_upn,
                "AccessRights": ["FullAccess"],
                "InheritanceType": "All",
                "Confirm": False,
            })
        elif permission_type == "send_as":
            self._exo_invoke("Remove-RecipientPermission", {
                "Identity": mailbox_upn,
                "Trustee": delegate_upn,
                "AccessRights": ["SendAs"],
                "Confirm": False,
            })
        elif permission_type == "send_on_behalf":
            self._exo_mailbox("Set-Mailbox", {
                "Identity": mailbox_upn,
                "GrantSendOnBehalfTo": {
                    "remove": [delegate_upn],
                    "@odata.type": "#Exchange.GenericHashTable",
                },
            })
        else:
            raise ValueError(f"Unknown permission_type: {permission_type}")
        return {"removed": True, "permission_type": permission_type}
