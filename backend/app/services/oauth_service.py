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
    async with httpx.AsyncClient() as client:
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
    }


async def github_get_user_info(code: str) -> dict:
    """Exchange GitHub auth code for user info.

    Returns: {"email", "name", "oauth_id", "avatar_url"}
    Raises: httpx.HTTPStatusError on failure.
    """
    async with httpx.AsyncClient() as client:
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

        # 3. If email is private, fetch from /user/emails
        if not email:
            emails_resp = await client.get(GITHUB_EMAILS_URL, headers=headers)
            emails_resp.raise_for_status()
            for e in emails_resp.json():
                if e.get("primary") and e.get("verified"):
                    email = e["email"]
                    break

    if not email:
        raise ValueError("Não foi possível obter o email do GitHub. Verifique as permissões.")

    return {
        "email": email,
        "name": data.get("name") or data.get("login", "GitHub User"),
        "oauth_id": str(data["id"]),
        "avatar_url": data.get("avatar_url"),
    }


async def microsoft_get_user_info(code: str, redirect_uri: str) -> dict:
    """Exchange Microsoft auth code for user info.

    Returns: {"email", "name", "oauth_id", "avatar_url"}
    Raises: httpx.HTTPStatusError on failure.
    """
    token_url = f"https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/oauth2/v2.0/token"

    async with httpx.AsyncClient() as client:
        # 1. Exchange code for access token
        token_resp = await client.post(token_url, data={
            "client_id": settings.MICROSOFT_CLIENT_ID,
            "client_secret": settings.MICROSOFT_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        if not token_resp.is_success:
            logger.error("Microsoft token error %s: %s", token_resp.status_code, token_resp.text)
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

    return {
        "email": email,
        "name": name,
        "oauth_id": data["id"],
        "avatar_url": None,  # Graph photo requires a separate call; skip for simplicity
    }
