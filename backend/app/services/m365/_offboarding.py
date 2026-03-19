"""M365 Offboarding mixin — user offboarding orchestration."""

import logging

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class OffboardingMixin:
    """Offboarding methods for M365Service."""

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
