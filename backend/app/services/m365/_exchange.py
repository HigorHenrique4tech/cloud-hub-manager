"""M365 Exchange mixin — mailboxes, domains, distribution lists, delegation."""

import logging
import requests

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class ExchangeMixin:
    """Exchange Online methods for M365Service."""

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

    def _build_user_name_map(self) -> dict:
        """Fetch all users and return a UPN->displayName lookup.
        Used to enrich report CSV data when M365 privacy settings obfuscate names."""
        try:
            items = self._get_all_pages(
                "/users",
                select="id,displayName,mail,userPrincipalName",
            )
            lookup = {}
            for u in items:
                uid  = (u.get("id") or "").lower()
                upn  = (u.get("userPrincipalName") or "").lower()
                mail = (u.get("mail") or "").lower()
                entry = {"name": u.get("displayName") or "", "upn": upn or mail}
                if uid:
                    lookup[uid] = entry
                if upn:
                    lookup[upn] = entry
                if mail and mail != upn:
                    lookup[mail] = entry
            return lookup
        except Exception as e:
            logger.warning(f"Could not build user name map: {e}")
            return {}

    def get_email_activity(self) -> dict:
        """Get email activity report for the last 30 days.
        Enriches display names from Graph API users to handle obfuscated privacy report data."""
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
            # Enrich display names — M365 privacy settings obfuscate UPN/name in CSV reports.
            # When obfuscated, "User Principal Name" contains the user's Azure AD Object ID (GUID).
            # The /users endpoint always returns real names+UPNs regardless of privacy settings.
            name_map = self._build_user_name_map()
            if name_map:
                for row in activity:
                    key = (row.get("upn") or "").lower()
                    entry = name_map.get(key)
                    if entry:
                        row["display_name"] = entry["name"]
                        row["upn"] = entry["upn"]
            return {"activity": activity, "total": len(activity)}
        except Exception as e:
            logger.error(f"Error getting email activity: {e}")
            return {"activity": [], "total": 0, "error": str(e)}

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

    def get_shared_mailboxes(self) -> dict:
        """List shared mailboxes.
        Primary: Exchange Admin API Get-Mailbox -RecipientTypeDetails SharedMailbox (accurate, real-time).
        Fallback: Graph API filter on accountEnabled=false + mailboxSettings/userPurpose check."""
        # ── Primary: Exchange Admin API ───────────────────────────────────────
        try:
            r = self._exo_invoke("Get-Mailbox", {
                "RecipientTypeDetails": "SharedMailbox",
                "ResultSize": "Unlimited",
            })
            raw = r.get("value") or []
            # Cross-reference with Graph to get Azure AD object IDs
            graph_token = self._get_token()
            mailboxes = []
            for mb in raw:
                upn = mb.get("UserPrincipalName") or mb.get("PrimarySmtpAddress", "")
                display = mb.get("DisplayName", upn)
                mail = mb.get("PrimarySmtpAddress", "")
                # Look up Azure AD ID by UPN for delegate/settings endpoints
                obj_id = None
                try:
                    u = requests.get(
                        f"{GRAPH_V1}/users/{upn}",
                        headers={"Authorization": f"Bearer {graph_token}"},
                        params={"$select": "id"},
                        timeout=10,
                    )
                    if u.ok:
                        obj_id = u.json().get("id")
                except Exception:
                    pass
                mailboxes.append({
                    "id": obj_id or upn,
                    "display_name": display,
                    "mail": mail,
                    "upn": upn,
                    "account_enabled": False,
                })
            return {"mailboxes": mailboxes, "total": len(mailboxes)}
        except Exception as exo_err:
            logger.warning(f"EXO Get-Mailbox failed, falling back to Graph filter: {exo_err}")

        # ── Fallback: Graph API filter ────────────────────────────────────────
        try:
            token = self._get_token()
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
