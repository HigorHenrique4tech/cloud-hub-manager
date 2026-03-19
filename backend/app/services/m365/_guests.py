"""M365 Guests mixin — guest user management."""

import logging
import requests

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class GuestsMixin:
    """Guest user methods for M365Service."""

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
