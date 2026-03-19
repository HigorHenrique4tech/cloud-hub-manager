"""M365 Users mixin — user CRUD and authentication methods."""

import logging
import requests

from ._base import GRAPH_V1, GRAPH_BETA

logger = logging.getLogger(__name__)


class UsersMixin:
    """User management methods for M365Service."""

    def get_users(self) -> list:
        """
        List all users with license count, last sign-in, and MFA status.
        MFA data comes from the beta endpoint (Reports.Read.All required).
        signInActivity requires AuditLog.Read.All; if missing the call is retried
        without that field so users still load (lastSignIn will be null).
        """
        base_select = (
            "id,displayName,userPrincipalName,mail,jobTitle,department,"
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
                "display_name": u.get("displayName"),
                "userPrincipalName": u.get("userPrincipalName"),
                "upn": u.get("userPrincipalName"),
                "mail": u.get("mail") or u.get("userPrincipalName"),
                "jobTitle": u.get("jobTitle"),
                "department": u.get("department"),
                "accountEnabled": u.get("accountEnabled"),
                "licensedCount": len(u.get("assignedLicenses", [])),
                "lastSignIn": (u.get("signInActivity") or {}).get("lastSignInDateTime"),
                "mfaRegistered": mfa_map.get(u.get("userPrincipalName")),
            }
            for u in raw
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
