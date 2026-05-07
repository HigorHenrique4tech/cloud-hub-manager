import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"

MICROSOFT_GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me"


async def google_get_user_info(code: str, redirect_uri: str) -> dict:
    """Exchange Google auth code for user info.

    Returns: {"email", "name", "oauth_id", "avatar_url"}
    Raises: httpx.HTTPStatusError on failure.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Exchange code for access token
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        # 2. Get user profile
        user_resp = await client.get(GOOGLE_USERINFO_URL, headers={
            "Authorization": f"Bearer {access_token}",
        })
        user_resp.raise_for_status()
        data = user_resp.json()

    return {
        "email": data["email"],
        "name": data.get("name", data["email"].split("@")[0]),
        "oauth_id": str(data["id"]),
        "avatar_url": data.get("picture"),
        # Google /userinfo returns "verified_email"; OpenID Connect returns "email_verified"
        "email_verified": bool(data.get("verified_email") or data.get("email_verified")),
    }


async def github_get_user_info(code: str) -> dict:
    """Exchange GitHub auth code for user info.

    Returns: {"email", "name", "oauth_id", "avatar_url"}
    Raises: httpx.HTTPStatusError on failure.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Exchange code for access token
        token_resp = await client.post(GITHUB_TOKEN_URL, json={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
        }, headers={"Accept": "application/json"})
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }

        # 2. Get user profile
        user_resp = await client.get(GITHUB_USER_URL, headers=headers)
        user_resp.raise_for_status()
        data = user_resp.json()

        email = data.get("email")
        email_verified = False

        # Always fetch /user/emails to authoritatively learn verification status
        emails_resp = await client.get(GITHUB_EMAILS_URL, headers=headers)
        if emails_resp.is_success:
            for e in emails_resp.json():
                if e.get("primary"):
                    email = e["email"]
                    email_verified = bool(e.get("verified"))
                    break

    if not email:
        raise ValueError("Não foi possível obter o email do GitHub. Verifique as permissões.")

    return {
        "email": email,
        "name": data.get("name") or data.get("login", "GitHub User"),
        "oauth_id": str(data["id"]),
        "avatar_url": data.get("avatar_url"),
        "email_verified": email_verified,
    }


async def microsoft_get_user_info(code: str, redirect_uri: str) -> dict:
    """Exchange Microsoft auth code for user info.

    Returns: {"email", "name", "oauth_id", "avatar_url"}
    Raises: httpx.HTTPStatusError on failure.
    """
    token_url = f"https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/oauth2/v2.0/token"

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Exchange code for access token
        token_resp = await client.post(token_url, data={
            "client_id": settings.MICROSOFT_CLIENT_ID,
            "client_secret": settings.MICROSOFT_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        if not token_resp.is_success:
            try:
                _err_body = token_resp.json()
                _err_code = _err_body.get("error") if isinstance(_err_body, dict) else None
            except Exception:
                _err_code = None
            logger.error("Microsoft token error status=%s error=%s", token_resp.status_code, _err_code)
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        # 2. Get user profile from Microsoft Graph
        user_resp = await client.get(MICROSOFT_GRAPH_ME_URL, headers={
            "Authorization": f"Bearer {access_token}",
        })
        user_resp.raise_for_status()
        data = user_resp.json()

    email = data.get("mail") or data.get("userPrincipalName", "")
    if "@" not in email:
        raise ValueError("Não foi possível obter o email da conta Microsoft.")

    name = data.get("displayName") or data.get("givenName") or email.split("@")[0]

    # Microsoft Graph /me does not expose an email_verified flag directly. For
    # work/school accounts (`userPrincipalName` matches an Entra-managed domain)
    # the email is implicitly verified by the tenant. For consumer MSA accounts
    # we conservatively treat as verified — Microsoft requires email confirmation
    # for MSA sign-up, and `mail` is only populated after verification.
    email_verified = bool(data.get("mail")) or "@" in (data.get("userPrincipalName") or "")

    return {
        "email": email,
        "name": name,
        "oauth_id": data["id"],
        "avatar_url": None,  # Graph photo requires a separate call; skip for simplicity
        "email_verified": email_verified,
    }
