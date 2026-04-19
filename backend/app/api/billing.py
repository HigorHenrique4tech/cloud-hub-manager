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
from app.core.limiter import limiter
from app.services.payment_service import create_billing, check_billing_status
from app.services.plan_service import get_plan_price
from app.services.log_service import log_activity
from app.services.notification_channel_service import fire_event
from app.services.notification_service import push_notification

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


class DowngradeRequest(BaseModel):
    plan_tier: str


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/checkout")
@limiter.limit("5/minute")
async def checkout(
    request: Request,
    payload: CheckoutRequest,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Create a billing on AbacatePay for plan upgrade."""
    valid_paid_tiers = {"basic", "standard", "enterprise_e1", "enterprise_e2", "enterprise_e3"}
    if payload.plan_tier not in valid_paid_tiers:
        raise HTTPException(status_code=400, detail=f"Plano inválido para checkout. Opções: {', '.join(sorted(valid_paid_tiers))}")

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

    # If billing_data has no URL (dev/mock mode), we'll set it after creating the payment record
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

    # In dev/mock mode (no AbacatePay URL), redirect straight to success page with real payment UUID
    payment_url = billing_data.get("url") or f"{settings.FRONTEND_URL}/billing/success?payment_id={str(payment.id)}"

    log_activity(
        db, member.user, "billing.checkout", "Payment",
        resource_id=str(payment.id),
        detail=f"plan={payload.plan_tier}, amount={amount}",
        provider="system",
    )

    return {
        "payment_id": str(payment.id),
        "payment_url": payment_url,
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
        # Activate plan and mark payment as paid in a single atomic transaction
        org = db.query(Organization).filter(Organization.id == member.organization_id).first()
        payment.status = "PAID"
        payment.paid_at = datetime.utcnow()
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
    # Validate webhook secret (constant-time comparison to prevent timing attacks)
    import hmac as _hmac
    expected = settings.ABACATEPAY_WEBHOOK_SECRET
    if not expected or not _hmac.compare_digest(x_abacatepay_token, expected):
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

        # Fire billing.paid event to notification channels (Teams/Telegram)
        if org:
            from app.models.db_models import Workspace
            ws_list = db.query(Workspace).filter(
                Workspace.organization_id == org.id,
                Workspace.is_active == True,
            ).all()
            for ws in ws_list:
                fire_event(db, ws.id, "billing.paid", {
                    "organization": org.name,
                    "plan": payment.plan_tier,
                    "amount": str(payment.amount) if hasattr(payment, 'amount') else "N/A",
                })
                push_notification(
                    db, ws.id, "billing",
                    f"Pagamento confirmado — plano {payment.plan_tier.capitalize()} ativado.",
                    "/billing",
                )

    elif status_value in ("EXPIRED", "CANCELLED", "REFUNDED"):
        payment.status = status_value
        db.commit()
        logger.info("AbacatePay webhook: payment %s set to %s", payment.id, status_value)


# ── Downgrade Logic ──────────────────────────────────────────────────────────

@router.post("/downgrade")
@limiter.limit("5/minute")
async def downgrade_plan(
    request: Request,
    payload: DowngradeRequest,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Downgrade organization plan with overage charge calculation.

    If current usage exceeds new plan limits, charges overage for the difference.
    """
    from app.models.db_models import Workspace, OrganizationMember, CloudAccount, OrganizationAddOn
    from app.services.plan_service import get_plan_limits
    from datetime import datetime, timedelta

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    old_plan = org.plan_tier
    new_plan = payload.plan_tier.lower()

    # Validate plan
    valid_plans = {"free", "basic", "standard", "enterprise_e1", "enterprise_e2", "enterprise_e3"}
    if new_plan not in valid_plans:
        raise HTTPException(status_code=400, detail=f"Plano inválido: {new_plan}")

    # Can't downgrade to same plan
    if old_plan == new_plan:
        raise HTTPException(status_code=400, detail="Você já está neste plano")

    # Get limits for both plans
    old_limits = get_plan_limits(old_plan)
    new_limits = get_plan_limits(new_plan)

    # Count current usage
    ws_count = db.query(Workspace).filter(
        Workspace.organization_id == org.id,
        Workspace.is_active == True,
    ).count()
    mem_count = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org.id,
        OrganizationMember.is_active == True,
    ).count()

    # Count add-ons
    ws_addons = db.query(OrganizationAddOn).filter(
        OrganizationAddOn.organization_id == org.id,
        OrganizationAddOn.addon_type == "workspace",
        OrganizationAddOn.is_active == True,
    ).first()
    user_addons = db.query(OrganizationAddOn).filter(
        OrganizationAddOn.organization_id == org.id,
        OrganizationAddOn.addon_type == "user",
        OrganizationAddOn.is_active == True,
    ).first()

    ws_addon_qty = ws_addons.quantity if ws_addons else 0
    user_addon_qty = user_addons.quantity if user_addons else 0

    # Calculate overage (usage exceeding new plan base limits)
    old_ws_base = old_limits.get("workspaces") or 0
    old_mem_base = old_limits.get("members") or 0
    new_ws_base = new_limits.get("workspaces") or 0
    new_mem_base = new_limits.get("members") or 0

    ws_overage = max(0, ws_count - new_ws_base)
    mem_overage = max(0, mem_count - new_mem_base)

    # If downgrading would violate limits, charge for overage
    overage_charge_cents = 0
    if ws_overage > 0:
        # Charge for workspaces that exceed new plan limit
        # Use add-on price (R$ 60 = 6000 centavos)
        overage_charge_cents += ws_overage * 6000

    if mem_overage > 0:
        # Charge for users that exceed new plan limit
        # Use add-on price (R$ 159 = 15900 centavos)
        overage_charge_cents += mem_overage * 15900

    # If there's an overage charge, create a payment for it
    payment_id = None
    if overage_charge_cents > 0:
        # Create overage charge payment
        overage_payment = Payment(
            organization_id=org.id,
            user_id=member.user.id,
            plan_tier=new_plan,
            amount=overage_charge_cents,
            status="PENDING",
            payment_url=None,  # Overage is just recorded, not a checkout
        )
        db.add(overage_payment)
        db.commit()
        db.refresh(overage_payment)
        payment_id = str(overage_payment.id)

        logger.info(
            "Downgrade overage: org=%s, old=%s → new=%s, ws_overage=%d, mem_overage=%d, charge_cents=%d",
            org.id, old_plan, new_plan, ws_overage, mem_overage, overage_charge_cents,
        )

    # Apply downgrade
    org.plan_tier = new_plan
    db.commit()

    log_activity(
        db, member.user, "billing.downgrade", "Organization",
        resource_id=str(org.id),
        detail=f"{old_plan} → {new_plan}, overage_charge_cents={overage_charge_cents}",
        provider="system",
    )

    return {
        "detail": "Downgrade realizado com sucesso",
        "old_plan": old_plan,
        "new_plan": new_plan,
        "overage_charge": {
            "ws_overage": ws_overage,
            "mem_overage": mem_overage,
            "charge_cents": overage_charge_cents,
            "charge_brl": f"R$ {overage_charge_cents / 100:.2f}",
            "payment_id": payment_id,
        },
        "message": f"Downgrade para {new_plan}" + (
            f" — Cobrança de overage: R$ {overage_charge_cents / 100:.2f}" if overage_charge_cents > 0 else ""
        ),
    }
