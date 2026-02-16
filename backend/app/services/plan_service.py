from sqlalchemy.orm import Session

from app.models.db_models import (
    Organization, OrganizationMember, Workspace, CloudAccount,
)

# ── Plan limits ──────────────────────────────────────────────────────────────

PLAN_LIMITS = {
    "free":       {"workspaces": 2,    "cloud_accounts": 3,    "members": 3},
    "pro":        {"workspaces": 10,   "cloud_accounts": 20,   "members": 20},
    "enterprise": {"workspaces": None, "cloud_accounts": None, "members": None},
}

PLAN_PRICES = {
    "pro": 19900,       # R$ 199,00 em centavos
    "enterprise": 0,    # Sob consulta
}


def get_plan_limits(plan_tier: str) -> dict:
    """Return limits dict for a given plan tier."""
    return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])


def get_plan_price(plan_tier: str) -> int:
    """Return price in centavos for a given plan tier."""
    return PLAN_PRICES.get(plan_tier, 0)


# ── Limit checks ─────────────────────────────────────────────────────────────


def check_workspace_limit(db: Session, org_id, plan_tier: str) -> tuple:
    """Returns (allowed, current_count, max_count)."""
    limits = get_plan_limits(plan_tier)
    max_ws = limits["workspaces"]
    current = db.query(Workspace).filter(
        Workspace.organization_id == org_id,
        Workspace.is_active == True,
    ).count()
    if max_ws is None:
        return (True, current, None)
    return (current < max_ws, current, max_ws)


def check_account_limit(db: Session, org_id, plan_tier: str) -> tuple:
    """Returns (allowed, current_count, max_count). Counts across all workspaces."""
    limits = get_plan_limits(plan_tier)
    max_acc = limits["cloud_accounts"]
    current = (
        db.query(CloudAccount)
        .join(Workspace, CloudAccount.workspace_id == Workspace.id)
        .filter(
            Workspace.organization_id == org_id,
            CloudAccount.is_active == True,
        )
        .count()
    )
    if max_acc is None:
        return (True, current, None)
    return (current < max_acc, current, max_acc)


def check_member_limit(db: Session, org_id, plan_tier: str) -> tuple:
    """Returns (allowed, current_count, max_count)."""
    limits = get_plan_limits(plan_tier)
    max_mem = limits["members"]
    current = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.is_active == True,
    ).count()
    if max_mem is None:
        return (True, current, None)
    return (current < max_mem, current, max_mem)


def get_org_usage(db: Session, org_id, plan_tier: str) -> dict:
    """Return usage and limits for an organization."""
    limits = get_plan_limits(plan_tier)
    ws_count = db.query(Workspace).filter(
        Workspace.organization_id == org_id,
        Workspace.is_active == True,
    ).count()
    acc_count = (
        db.query(CloudAccount)
        .join(Workspace, CloudAccount.workspace_id == Workspace.id)
        .filter(
            Workspace.organization_id == org_id,
            CloudAccount.is_active == True,
        )
        .count()
    )
    mem_count = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.is_active == True,
    ).count()
    return {
        "plan_tier": plan_tier,
        "limits": limits,
        "usage": {
            "workspaces": ws_count,
            "cloud_accounts": acc_count,
            "members": mem_count,
        },
    }
