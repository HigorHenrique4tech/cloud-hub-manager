from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.db_models import Organization, Payment
from app.core.dependencies import get_current_member, require_org_permission
from app.core.auth_context import MemberContext
from app.core.config import settings
from app.services.payment_service import create_billing, check_billing_status
from app.services.plan_service import get_plan_price
from app.services.log_service import log_activity

router = APIRouter(
    prefix="/orgs/{org_slug}/billing",
    tags=["Billing"],
)


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
