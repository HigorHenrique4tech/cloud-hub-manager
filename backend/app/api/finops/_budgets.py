"""FinOps Budget endpoints (list, create, patch, delete, evaluate)."""
import json as _json
import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import CloudAccount, FinOpsBudget
from app.services.log_service import log_activity

from . import ws_router
from ._schemas import BudgetCreate, BudgetUpdate
from ._helpers import (
    _budget_to_dict,
    _fetch_provider_spend,
    _get_org_plan,
    _require_plan,
)

logger = logging.getLogger(__name__)


@ws_router.get("/budgets")
async def list_budgets(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    budgets = (
        db.query(FinOpsBudget)
        .filter(
            FinOpsBudget.workspace_id == member.workspace_id,
            FinOpsBudget.is_active == True,
        )
        .order_by(FinOpsBudget.created_at.desc())
        .all()
    )
    return [_budget_to_dict(b) for b in budgets]


@ws_router.post("/budgets", status_code=201)
async def create_budget(
    payload: BudgetCreate,
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    # Pro plan: max 5 budgets
    if plan == "pro":
        count = db.query(FinOpsBudget).filter(
            FinOpsBudget.workspace_id == member.workspace_id,
            FinOpsBudget.is_active == True,
        ).count()
        if count >= 5:
            raise HTTPException(
                status_code=403,
                detail="Limite de 5 orçamentos atingido no plano Pro. Faça upgrade para Enterprise."
            )

    budget = FinOpsBudget(
        workspace_id=member.workspace_id,
        created_by=member.user.id,
        name=payload.name,
        provider=payload.provider,
        amount=payload.amount,
        period=payload.period,
        alert_threshold=payload.alert_threshold,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return _budget_to_dict(budget)


@ws_router.patch("/budgets/{budget_id}", status_code=200)
async def update_budget(
    budget_id: UUID,
    payload: BudgetUpdate,
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    budget = db.query(FinOpsBudget).filter(
        FinOpsBudget.id == budget_id,
        FinOpsBudget.workspace_id == member.workspace_id,
    ).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")

    if payload.name is not None:
        budget.name = payload.name
    if payload.amount is not None:
        budget.amount = payload.amount
    if payload.alert_threshold is not None:
        budget.alert_threshold = payload.alert_threshold
    if payload.is_active is not None:
        budget.is_active = payload.is_active

    db.commit()
    db.refresh(budget)
    return _budget_to_dict(budget)


@ws_router.delete("/budgets/{budget_id}", status_code=204)
async def delete_budget(
    budget_id: UUID,
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    budget = db.query(FinOpsBudget).filter(
        FinOpsBudget.id == budget_id,
        FinOpsBudget.workspace_id == member.workspace_id,
    ).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")

    budget.is_active = False
    db.commit()


# ── Budget Evaluation ─────────────────────────────────────────────────────────


@ws_router.post("/budgets/evaluate", status_code=200)
async def evaluate_budgets(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """
    Fetch current MTD spend for each active budget and update last_spend / pct.
    Fires email + webhook alert when the configured threshold is crossed.
    Returns the updated list of budgets.  Pro-only.
    """
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    from datetime import date
    from app.services.email_service import send_budget_alert_email
    from app.services.notification_channel_service import fire_event as _fire

    budgets = (
        db.query(FinOpsBudget)
        .filter(
            FinOpsBudget.workspace_id == member.workspace_id,
            FinOpsBudget.is_active == True,
        )
        .all()
    )

    if not budgets:
        return []

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.is_active == True,
    ).all()

    # Pre-fetch spend per provider for this workspace
    provider_spend: dict = {}
    for account in accounts:
        try:
            from app.services.auth_service import decrypt_credential
            creds = decrypt_credential(account.encrypted_data)
            spend = _fetch_provider_spend(account.provider, creds)
            if spend is not None:
                provider_spend[account.provider] = (
                    provider_spend.get(account.provider, 0.0) + spend
                )
        except Exception as exc:
            logger.warning(f"Spend fetch failed for account {account.id}: {exc}")

    now = datetime.utcnow()
    cooldown = timedelta(hours=24)

    breakdown_json = _json.dumps({k: round(v, 2) for k, v in provider_spend.items()}) if provider_spend else None

    for budget in budgets:
        if budget.provider == "all":
            spend = sum(provider_spend.values())
            budget.spend_breakdown = breakdown_json
        else:
            spend = provider_spend.get(budget.provider, 0.0)

        budget.last_spend = spend
        budget.last_evaluated_at = now

        pct = spend / budget.amount if budget.amount else 0.0
        already_alerted = (
            budget.alert_sent_at is not None and
            (now - budget.alert_sent_at) < cooldown
        )

        if pct >= budget.alert_threshold and not already_alerted:
            from app.models.db_models import User
            creator = db.query(User).filter(User.id == budget.created_by).first()
            if creator:
                send_budget_alert_email(
                    to_email=creator.email,
                    user_name=creator.name,
                    budget_name=budget.name,
                    provider=budget.provider,
                    current_spend=spend,
                    budget_amount=budget.amount,
                    pct=pct,
                )
            _fire(db, member.workspace_id, "budget.threshold_crossed", {
                "budget_id":     str(budget.id),
                "budget_name":   budget.name,
                "provider":      budget.provider,
                "current_spend": spend,
                "budget_amount": budget.amount,
                "pct":           round(pct, 4),
            })
            from app.services.notification_service import push_notification as _push
            _push(db, member.workspace_id, "budget",
                  f"Orçamento '{budget.name}' atingiu {round(pct * 100, 1)}% do limite "
                  f"(${spend:,.2f} / ${budget.amount:,.2f})",
                  "/finops")
            budget.alert_sent_at = now

    db.commit()
    for b in budgets:
        db.refresh(b)

    return [_budget_to_dict(b) for b in budgets]
