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
            "url": f"{settings.FRONTEND_URL}/billing/success?payment_id=mock",
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
