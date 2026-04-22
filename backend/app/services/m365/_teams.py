"""M365 Teams Admin mixin — Teams management."""

import logging
import requests

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class TeamsMixin:
    """Teams admin methods for M365Service."""

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

    def create_team(self, display_name: str, description: str = "", visibility: str = "Private", owner_id: str = "") -> dict:
        """Create a new Microsoft Team.

        Graph API with app-only permissions requires at least one owner in the
        members array, otherwise it returns 400 "A team owner must be provided".
        """
        payload = {
            "template@odata.bind": "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
            "displayName": display_name,
            "description": description,
            "visibility": visibility,
        }
        if owner_id:
            payload["members"] = [
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "roles": ["owner"],
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{owner_id}')",
                }
            ]
        return self._post("/teams", payload)

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
            if not resp.ok:
                logger.error(
                    "get_teams_activity HTTP %s — body: %s",
                    resp.status_code, resp.text[:500],
                )
                if resp.status_code == 403:
                    return {"activity": [], "total": 0, "error": "permission_denied"}
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
