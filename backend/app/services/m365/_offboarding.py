"""M365 Offboarding mixin — user offboarding orchestration."""

import logging
import secrets
import string

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


def _generate_password(length: int = 16) -> str:
    """Generate a strong random password."""
    chars = string.ascii_letters + string.digits + "!@#$%&*"
    password = (
        secrets.choice(string.ascii_uppercase)
        + secrets.choice(string.ascii_lowercase)
        + secrets.choice(string.digits)
        + secrets.choice("!@#$%&*")
        + "".join(secrets.choice(chars) for _ in range(length - 4))
    )
    # Shuffle to avoid predictable prefix
    lst = list(password)
    secrets.SystemRandom().shuffle(lst)
    return "".join(lst)


class OffboardingMixin:
    """Offboarding methods for M365Service."""

    def get_offboard_context(self, user_id: str) -> dict:
        """Fetch user's current state for pre-offboarding review."""
        # Basic user info — try with signInActivity first, fall back without it
        try:
            user = self._get(
                f"{GRAPH_V1}/users/{user_id}"
                "?$select=id,displayName,userPrincipalName,mail,accountEnabled,"
                "assignedLicenses,jobTitle,department,signInActivity"
            )
        except Exception:
            user = self._get(
                f"{GRAPH_V1}/users/{user_id}"
                "?$select=id,displayName,userPrincipalName,mail,accountEnabled,"
                "assignedLicenses,jobTitle,department"
            )

        licenses = user.get("assignedLicenses") or []

        # Groups membership
        groups = []
        try:
            groups = self.get_user_groups(user_id)
        except Exception as exc:
            logger.warning("get_offboard_context: could not fetch groups: %s", exc)

        # Auth methods (MFA)
        auth_methods = []
        try:
            raw = self.get_user_auth_methods(user_id)
            auth_methods = [m for m in raw if m.get("methodType") != "password"]
        except Exception as exc:
            logger.warning("get_offboard_context: could not fetch auth methods: %s", exc)

        return {
            "displayName": user.get("displayName"),
            "userPrincipalName": user.get("userPrincipalName"),
            "mail": user.get("mail"),
            "jobTitle": user.get("jobTitle"),
            "department": user.get("department"),
            "accountEnabled": user.get("accountEnabled"),
            "licenseCount": len(licenses),
            "groupCount": len(groups),
            "groups": [{"id": g["id"], "displayName": g.get("displayName", "")} for g in groups],
            "authMethodCount": len(auth_methods),
            "authMethods": auth_methods,
            "lastSignIn": (user.get("signInActivity") or {}).get("lastSignInDateTime"),
        }

    def offboard_user(self, user_id: str, options: dict) -> dict:
        """Orchestrate user offboarding. Each step is non-fatal — errors are captured per step."""
        results = {}

        # 1. Disable account
        if options.get("disable_account", True):
            try:
                self.toggle_user_account(user_id, False)
                results["disable_account"] = True
            except Exception as e:
                results["disable_account"] = str(e)

        # 2. Revoke all sessions
        if options.get("revoke_sessions", True):
            try:
                self.revoke_user_sessions(user_id)
                results["revoke_sessions"] = True
            except Exception as e:
                results["revoke_sessions"] = str(e)

        # 3. Reset password to random value (locks out attacker even if session revoke fails)
        if options.get("reset_password", False):
            try:
                new_password = _generate_password()
                self.reset_user_password(user_id, new_password, force_change=False)
                results["reset_password"] = new_password  # returned so admin can note it
            except Exception as e:
                results["reset_password"] = str(e)

        # 4. Remove from all groups and teams
        if options.get("remove_from_groups", False):
            try:
                groups = self.get_user_groups(user_id)
                removed, errors = 0, 0
                for group in groups:
                    try:
                        self._delete(f"/groups/{group['id']}/members/{user_id}/$ref")
                        removed += 1
                    except Exception:
                        errors += 1
                if errors == 0:
                    results["remove_from_groups"] = f"{removed} grupo(s) removido(s)"
                else:
                    results["remove_from_groups"] = f"{removed} removido(s), {errors} com erro"
            except Exception as e:
                results["remove_from_groups"] = str(e)

        # 5. Remove all MFA / authentication methods
        if options.get("remove_auth_methods", False):
            try:
                methods = self.get_user_auth_methods(user_id)
                deletable = [m for m in methods if m.get("deletable")]
                removed = 0
                for m in deletable:
                    try:
                        self.delete_user_auth_method(user_id, m["methodType"], m["id"])
                        removed += 1
                    except Exception:
                        pass
                results["remove_auth_methods"] = f"{removed} método(s) removido(s)"
            except Exception as e:
                results["remove_auth_methods"] = str(e)

        # 6. Remove all licenses
        if options.get("remove_licenses", False):
            try:
                user = self._get(f"{GRAPH_V1}/users/{user_id}?$select=assignedLicenses")
                assigned = user.get("assignedLicenses") or []
                if assigned:
                    sku_ids = [lic["skuId"] for lic in assigned]
                    self._post(f"/users/{user_id}/assignLicense", {
                        "addLicenses": [],
                        "removeLicenses": sku_ids,
                    })
                results["remove_licenses"] = f"{len(assigned)} licença(s) removida(s)"
            except Exception as e:
                results["remove_licenses"] = str(e)

        # 7. Set out-of-office auto-reply
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
