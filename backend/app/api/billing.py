import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Any

from app.database import get_db
from app.models.db_models import Organization, Payment
from app.core.dependencies import get_current_member, require_org_permission
from app.core.auth_context import MemberContext
from app.core.config import settings
from app.services.payment_service import create_billing, check_billing_status
from app.services.plan_service import get_plan_price
from app.services.log_service import log_activity

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/orgs/{org_slug}/billing",
    tags=["Billing"],
)

# Rota de webhook sem prefixo de org (recebe notificações do AbacatePay)
webhook_router = APIRouter(tags=["Billing"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    plan_tier: str


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/checkout")
async def checkout(
    payload: CheckoutRequest,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Create a billing on AbacatePay for plan upgrade."""
    valid_paid_tiers = {"pro"}
    if payload.plan_tier not in valid_paid_tiers:
        raise HTTPException(status_code=400, detail=f"Plano inválido para checkout. Opções: {', '.join(valid_paid_tiers)}")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if org.plan_tier == payload.plan_tier:
        raise HTTPException(status_code=400, detail="Você já está neste plano")

    amount = get_plan_price(payload.plan_tier)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Plano não possui preço configurado")

    return_url = f"{settings.FRONTEND_URL}/billing/success"
    completion_url = f"{settings.FRONTEND_URL}/billing/success"

    billing_data = await create_billing(
        customer_email=member.user.email,
        customer_name=member.user.name,
        plan_tier=payload.plan_tier,
        amount_cents=amount,
        return_url=return_url,
        completion_url=completion_url,
    )

    payment = Payment(
        organization_id=org.id,
        user_id=member.user.id,
        abacate_billing_id=billing_data.get("id"),
        plan_tier=payload.plan_tier,
        amount=amount,
        status="PENDING",
        payment_url=billing_data.get("url"),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    log_activity(
        db, member.user, "billing.checkout", "Payment",
        resource_id=str(payment.id),
        detail=f"plan={payload.plan_tier}, amount={amount}",
        provider="system",
    )

    return {
        "payment_id": str(payment.id),
        "payment_url": billing_data.get("url"),
        "amount": amount,
        "plan_tier": payload.plan_tier,
    }


@router.get("/verify/{payment_id}")
async def verify_payment(
    payment_id: str,
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Check payment status and activate plan if paid."""
    payment = db.query(Payment).filter(
        Payment.id == payment_id,
        Payment.organization_id == member.organization_id,
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")

    if payment.status == "PAID":
        return {"status": "PAID", "plan_tier": payment.plan_tier}

    # Check status with AbacatePay
    status = await check_billing_status(payment.abacate_billing_id)

    if status == "PAID" and payment.status != "PAID":
        payment.status = "PAID"
        payment.paid_at = datetime.utcnow()
        db.commit()

        # Activate the plan
        org = db.query(Organization).filter(Organization.id == member.organization_id).first()
        org.plan_tier = payment.plan_tier
        db.commit()

        log_activity(
            db, member.user, "billing.paid", "Payment",
            resource_id=str(payment.id),
            detail=f"plan={payment.plan_tier}",
            provider="system",
        )

    elif status in ("EXPIRED", "CANCELLED", "REFUNDED"):
        payment.status = status
        db.commit()

    return {"status": payment.status, "plan_tier": payment.plan_tier}


@router.get("/history")
async def payment_history(
    member: MemberContext = Depends(require_org_permission("costs.view")),
    db: Session = Depends(get_db),
):
    """List all payments for the organization."""
    payments = (
        db.query(Payment)
        .filter(Payment.organization_id == member.organization_id)
        .order_by(Payment.created_at.desc())
        .all()
    )
    return {
        "payments": [
            {
                "id": str(p.id),
                "plan_tier": p.plan_tier,
                "amount": p.amount,
                "status": p.status,
                "payment_method": p.payment_method,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            }
            for p in payments
        ]
    }


# ── Webhook ─────────────────────────────────────────────────────────────────


@webhook_router.post("/billing/webhook", include_in_schema=False)
async def abacatepay_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_abacatepay_token: str = Header(default=""),
):
    """
    Receive payment status notifications from AbacatePay.
    Secured by a shared secret sent in the X-AbacatePay-Token header.
    Idempotent: already-PAID payments are acknowledged without reprocessing.
    """
    # Validate webhook secret
    expected = settings.ABACATEPAY_WEBHOOK_SECRET
    if not expected or x_abacatepay_token != expected:
        logger.warning("AbacatePay webhook: invalid or missing token")
        raise HTTPException(status_code=403, detail="Forbidden")

    body: Any = await request.json()
    billing_id = body.get("id") or body.get("billing", {}).get("id")
    status_value = body.get("status") or body.get("billing", {}).get("status")

    if not billing_id or not status_value:
        logger.warning("AbacatePay webhook: missing id or status in payload")
        return {"received": True}

    payment = db.query(Payment).filter(Payment.abacate_billing_id == billing_id).first()
    if not payment:
        logger.warning("AbacatePay webhook: payment not found for billing_id=%s", billing_id)
        return {"received": True}

    # Already processed — idempotent
    if payment.status == "PAID":
        return {"received": True, "already_paid": True}

    if status_value == "PAID":
        payment.status = "PAID"
        payment.paid_at = datetime.utcnow()

        org = db.query(Organization).filter(Organization.id == payment.organization_id).first()
        if org:
            org.plan_tier = payment.plan_tier

        db.commit()

        # Log without a user context (webhook is server-to-server)
        logger.info(
            "AbacatePay webhook: payment %s confirmed — org %s upgraded to %s",
            payment.id, payment.organization_id, payment.plan_tier,
        )

    elif status_value in ("EXPIRED", "CANCELLED", "REFUNDED"):
        payment.status = status_value
        db.commit()
        logger.info("AbacatePay webhook: payment %s set to %s", payment.id, status_value)

    return {"received": True}
