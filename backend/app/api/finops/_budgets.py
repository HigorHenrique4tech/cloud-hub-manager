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
    _require_plan(plan, "standard", "Orçamentos")

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
    _require_plan(plan, "basic", "Orçamentos")

    # Budget limits per plan: basic=5, standard=15, enterprise=unlimited
    budget_limits = {"basic": 5, "standard": 15}
    max_budgets = budget_limits.get(plan, float('inf'))
    if max_budgets != float('inf'):
        count = db.query(FinOpsBudget).filter(
            FinOpsBudget.workspace_id == member.workspace_id,
            FinOpsBudget.is_active == True,
        ).count()
        if count >= max_budgets:
            raise HTTPException(
                status_code=403,
                detail=f"Limite de {max_budgets} orçamentos atingido no plano {plan.capitalize()}. Faça upgrade para um plano superior."
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
    _require_plan(plan, "standard", "Orçamentos")

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
    _require_plan(plan, "standard", "Orçamentos")

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
    _require_plan(plan, "standard", "Orçamentos")

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

    # Pre-fetch spend per provider per period for this workspace.
    # Different budgets may have different periods (monthly/quarterly/annual),
    # so we cache spend keyed by (provider, period).
    from app.services.auth_service import decrypt_for_account

    _spend_cache: dict = {}  # (provider, period) -> float

    def _get_spend_for(provider: str, period: str) -> float:
        key = (provider, period)
        if key in _spend_cache:
            return _spend_cache[key]
        total = 0.0
        for account in accounts:
            if account.provider != provider:
                continue
            try:
                creds = decrypt_for_account(db, account)
                spend = _fetch_provider_spend(account.provider, creds, period=period)
                if spend is not None:
                    total += spend
            except Exception as exc:
                logger.warning(f"Spend fetch failed for account {account.id}: {exc}")
        _spend_cache[key] = total
        return total

    now = datetime.utcnow()
    cooldown = timedelta(hours=24)

    for budget in budgets:
        period = budget.period or "monthly"
        if budget.provider == "all":
            # Fetch spend for each active provider with the budget's period
            providers_in_ws = {a.provider for a in accounts}
            spend_by_prov = {p: _get_spend_for(p, period) for p in providers_in_ws}
            spend = sum(spend_by_prov.values())
            budget.spend_breakdown = _json.dumps(
                {k: round(v, 2) for k, v in spend_by_prov.items()}
            ) if spend_by_prov else None
        else:
            spend = _get_spend_for(budget.provider, period)

        budget.last_spend = spend
        budget.last_evaluated_at = now

        pct = spend / budget.amount if budget.amount else 0.0
        already_alerted = (
            budget.alert_sent_at is not None and
            (now - budget.alert_sent_at) < cooldown
        )

        if pct >= budget.alert_threshold and not already_alerted:
            from app.models.db_models import User
            from app.services.branding_service import get_branding_for_workspace as _gbw
            _brand = _gbw(db, member.workspace_id)
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
                    branding=_brand,
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
