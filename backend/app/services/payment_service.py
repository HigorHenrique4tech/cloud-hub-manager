import httpx
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def _headers():
    return {
        "Authorization": f"Bearer {settings.ABACATEPAY_API_KEY}",
        "Content-Type": "application/json",
    }


async def create_billing(
    customer_email: str,
    customer_name: str,
    plan_tier: str,
    amount_cents: int,
    return_url: str,
    completion_url: str,
) -> dict:
    """Create a billing on AbacatePay. Returns the billing data dict."""
    if not settings.ABACATEPAY_API_KEY:
        logger.warning("ABACATEPAY_API_KEY not configured — returning mock billing")
        return {
            "id": "bill_mock_dev",
            "url": None,  # checkout endpoint will build the URL with the real payment UUID
            "amount": amount_cents,
            "status": "PENDING",
        }

    async with httpx.AsyncClient(timeout=30) as client:
        body = {
            "frequency": "ONE_TIME",
            "methods": ["PIX"],
            "products": [
                {
                    "externalId": f"plan-{plan_tier}",
                    "name": f"Plano {plan_tier.capitalize()} - CloudAtlas",
                    "description": f"Assinatura mensal plano {plan_tier}",
                    "quantity": 1,
                    "price": amount_cents,
                }
            ],
            "returnUrl": return_url,
            "completionUrl": completion_url,
            "customer": {
                "name": customer_name or "Cliente",
                "email": customer_email,
                "cellphone": "(11) 99999-9999",
                "taxId": "529.982.247-25",
            },
        }

        logger.info("AbacatePay billing request body: %s", body)

        resp = await client.post(
            f"{settings.ABACATEPAY_API_URL}/billing/create",
            json=body,
            headers=_headers(),
        )

        logger.info("AbacatePay billing HTTP %s — body: %s", resp.status_code, resp.text)

        if resp.status_code >= 400:
            raise ValueError(f"AbacatePay HTTP {resp.status_code}: {resp.text}")

        result = resp.json()

        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            raise ValueError(f"AbacatePay error: {error_msg}")

        data = result.get("data")
        if not data or not isinstance(data, dict):
            raise ValueError(f"AbacatePay returned unexpected data: {result}")

        return data


async def create_pix_payment(
    amount_cents: int,
    description: str,
    customer_name: str | None = None,
    customer_email: str | None = None,
    expires_in: int = 86400,  # 24h default
) -> dict:
    """Create a PIX QR Code payment on AbacatePay (no product created).

    Returns dict with keys: id, brCode, brCodeBase64, status, expiresAt.
    """
    if not settings.ABACATEPAY_API_KEY:
        logger.warning("ABACATEPAY_API_KEY not configured — returning mock PIX")
        return {
            "id": "pix_mock_dev",
            "brCode": None,
            "brCodeBase64": None,
            "status": "PENDING",
        }

    body: dict = {
        "amount": amount_cents,
        "expiresIn": expires_in,
        "description": description,
    }

    # Customer info is optional for pixQrCode
    if customer_name or customer_email:
        body["customer"] = {}
        if customer_name:
            body["customer"]["name"] = customer_name
        if customer_email:
            body["customer"]["email"] = customer_email

    async with httpx.AsyncClient(timeout=30) as client:
        logger.info("AbacatePay pixQrCode request: %s", body)

        resp = await client.post(
            f"{settings.ABACATEPAY_API_URL}/pixQrCode/create",
            json=body,
            headers=_headers(),
        )

        logger.info("AbacatePay pixQrCode HTTP %s — body: %s", resp.status_code, resp.text)

        if resp.status_code >= 400:
            raise ValueError(f"AbacatePay HTTP {resp.status_code}: {resp.text}")

        result = resp.json()

        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            raise ValueError(f"AbacatePay error: {error_msg}")

        data = result.get("data")
        if not data or not isinstance(data, dict):
            raise ValueError(f"AbacatePay returned unexpected data: {result}")

        return data


async def check_pix_status(pix_id: str) -> str:
    """Check PIX QR Code payment status. Returns status string."""
    if not settings.ABACATEPAY_API_KEY or pix_id == "pix_mock_dev":
        return "PAID"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.ABACATEPAY_API_URL}/pixQrCode/check",
            params={"id": pix_id},
            headers=_headers(),
        )
        resp.raise_for_status()
        result = resp.json()
        data = result.get("data")
        if data and isinstance(data, dict):
            return data.get("status", "PENDING")
    return "NOT_FOUND"


async def check_billing_status(billing_id: str) -> str:
    """Check payment status for a billing. Returns status string."""
    if not settings.ABACATEPAY_API_KEY or billing_id == "bill_mock_dev":
        return "PAID"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.ABACATEPAY_API_URL}/billing/list",
            headers=_headers(),
        )
        resp.raise_for_status()
        result = resp.json()
        billings = result.get("data") or []

    for b in billings:
        if b.get("id") == billing_id:
            return b.get("status", "PENDING")

    return "NOT_FOUND"
