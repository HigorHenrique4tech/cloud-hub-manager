"""M365 Groups mixin — group management."""

import logging

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class GroupsMixin:
    """Group management methods for M365Service."""

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
        # Graph API v1.0 only supports:
        #   M365 Group: mailEnabled=true, securityEnabled=false, groupTypes=["Unified"]
        #   Security Group: mailEnabled=false, securityEnabled=true, groupTypes=[]
        # Pure distribution groups (no Unified, securityEnabled=false) are NOT supported by Graph API.
        # Distribution lists are created as M365 Groups (mail-enabled, functional equivalent for
        # email distribution). They appear under "Microsoft 365" in Exchange Admin Center.
        body: dict = {
            "displayName": display_name,
            "mailNickname": nickname,
            "mailEnabled": is_m365 or is_dist,
            "securityEnabled": not (is_m365 or is_dist),
            "groupTypes": ["Unified"] if (is_m365 or is_dist) else [],
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
