from sqlalchemy.orm import Session

from app.models.db_models import (
    Organization, OrganizationMember, Workspace, CloudAccount,
)

# ── Plan limits ──────────────────────────────────────────────────────────────

PLAN_LIMITS = {
    "free":       {"workspaces": 2,    "cloud_accounts": 3,    "members": 3,    "managed_orgs": 0},
    "pro":        {"workspaces": 10,   "cloud_accounts": 20,   "members": 20,   "managed_orgs": 0},
    "enterprise": {"workspaces": None, "cloud_accounts": None, "members": None, "managed_orgs": None},
}

PLAN_PRICES = {
    "pro":                  49700,   # R$ 497,00 em centavos
    "enterprise":           249700,  # R$ 2.497,00 (base, sob consulta — apenas exibição)
    "enterprise_extra_org": 39700,   # R$ 397,00 por org parceira adicional
    "enterprise_base_orgs": 5,       # orgs parceiras incluídas no base Enterprise
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


def check_managed_org_limit(db: Session, org_id, plan_tier: str) -> tuple:
    """Returns (allowed, current_count, max_count). Only meaningful for enterprise."""
    limits = get_plan_limits(plan_tier)
    max_orgs = limits["managed_orgs"]
    current = db.query(Organization).filter(
        Organization.parent_org_id == org_id,
    ).count()
    if max_orgs is None:
        return (True, current, None)
    return (current < max_orgs, current, max_orgs)


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
    managed_orgs_count = db.query(Organization).filter(
        Organization.parent_org_id == org_id,
    ).count()
    return {
        "plan_tier": plan_tier,
        "limits": limits,
        "usage": {
            "workspaces": ws_count,
            "cloud_accounts": acc_count,
            "members": mem_count,
            "managed_orgs": managed_orgs_count,
        },
    }
