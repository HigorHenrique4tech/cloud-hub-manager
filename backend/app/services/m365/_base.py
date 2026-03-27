"""
Microsoft 365 service — base class with auth and HTTP helpers.

Uses Client Credentials Flow (app-to-app), so no user sign-in is required.
The caller must have an Azure AD App Registration with the following
Application permissions (admin consent required):
  - User.Read.All
  - User.ReadWrite.All          (delete guest users)
  - User.Invite.All             (send guest invitations)
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


class M365Base:
    """Constructor, token acquisition, and HTTP helpers for Microsoft Graph API."""

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
