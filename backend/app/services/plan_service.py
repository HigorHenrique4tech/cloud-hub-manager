from datetime import datetime

from sqlalchemy.orm import Session

from app.models.db_models import (
    Organization, OrganizationMember, Workspace, CloudAccount,
    MigrationLicense,
)

# ── Plan hierarchy (higher = more features) ─────────────────────────────────

PLAN_HIERARCHY = {
    "free": 0,
    "basic": 1,
    "standard": 2,
    "enterprise_e1": 3,
    "enterprise_e2": 4,
    "enterprise_e3": 5,
    "enterprise_migration": 6,  # legacy, for backwards compat
}

# ── Plan limits ──────────────────────────────────────────────────────────────

PLAN_LIMITS = {
    "free":                 {"workspaces": 2,    "cloud_accounts": 3,    "members": 3,    "managed_orgs": 0},
    "basic":                {"workspaces": 5,    "cloud_accounts": 10,   "members": 3,    "managed_orgs": 0},
    "standard":             {"workspaces": 25,   "cloud_accounts": None, "members": 10,   "managed_orgs": 0},
    "enterprise_e1":        {"workspaces": 50,   "cloud_accounts": None, "members": 20,   "managed_orgs": None},
    "enterprise_e2":        {"workspaces": 100,  "cloud_accounts": None, "members": 40,   "managed_orgs": None},
    "enterprise_e3":        {"workspaces": 200,  "cloud_accounts": None, "members": 80,   "managed_orgs": None},
    "enterprise_migration": {"workspaces": 20,   "cloud_accounts": None, "members": None, "managed_orgs": None},  # legacy
}

PLAN_PRICES = {
    # Base plans (monthly in centavos)
    "basic":                      39700,   # R$ 397,00
    "standard":                   79700,   # R$ 797,00
    "enterprise_e1":              299700,  # R$ 2.997,00
    "enterprise_e2":              499700,  # R$ 4.997,00
    "enterprise_e3":              799700,  # R$ 7.997,00

    # Add-ons (per unit, monthly)
    "addon_workspace":            6000,    # R$ 60,00 per workspace
    "addon_user":                 15900,   # R$ 159,00 per user

    # Legacy migration (backward compat)
    "enterprise_migration":       474700,  # R$ 4.747,00 (Enterprise R$2.497 + Migration R$2.250)
    "migration_license_unit":     7000,    # R$ 70,00 por licença avulsa
    "enterprise_extra_org":       39700,   # R$ 397,00 por org parceira adicional
    "enterprise_base_orgs":       5,       # orgs parceiras incluídas no base Enterprise
    "enterprise_base_workspaces": 20,      # workspaces incluídos na org master Enterprise
    "enterprise_extra_workspace": 29000,   # R$ 290,00 por workspace extra/mês (master)
    "partner_base_workspaces":    10,      # workspaces incluídos em cada org parceira
    "partner_extra_workspace":    29000,   # R$ 290,00 por workspace extra/mês
}


def get_effective_plan(org: Organization) -> str:
    """Return the effective plan considering trial status.
    Trial active + free tier → 'standard'.  Paid plans → as-is.
    """
    plan = (org.plan_tier or "free").lower()
    if plan != "free":
        return plan
    if org.trial_ends_at and org.trial_ends_at > datetime.utcnow():
        return "standard"
    return "free"


def get_trial_info(org: Organization) -> dict:
    """Return trial metadata for serialization."""
    if not org.trial_ends_at:
        return {"has_trial": False, "trial_active": False, "days_remaining": 0}
    now = datetime.utcnow()
    remaining = (org.trial_ends_at - now).days
    return {
        "has_trial": True,
        "trial_ends_at": org.trial_ends_at.isoformat(),
        "trial_active": org.trial_ends_at > now,
        "days_remaining": max(remaining, 0),
    }


def get_plan_limits(plan_tier: str) -> dict:
    """Return limits dict for a given plan tier."""
    return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])


def get_plan_price(plan_tier: str) -> int:
    """Return price in centavos for a given plan tier."""
    return PLAN_PRICES.get(plan_tier, 0)


# ── Limit checks ─────────────────────────────────────────────────────────────


_ENTERPRISE_TIERS = {"enterprise_e1", "enterprise_e2", "enterprise_e3", "enterprise_migration", "enterprise"}


def _count_consolidated_workspaces(db: Session, master_org_id) -> int:
    """Count workspaces in the master org plus all its partner orgs."""
    partner_ids = [
        row[0] for row in db.query(Organization.id).filter(Organization.parent_org_id == master_org_id).all()
    ]
    all_ids = [master_org_id] + partner_ids
    return db.query(Workspace).filter(
        Workspace.organization_id.in_(all_ids),
        Workspace.is_active == True,
    ).count()


def check_workspace_limit(db: Session, org_id, plan_tier: str, org_type: str = "standalone") -> tuple:
    """Returns (allowed, current_count, max_count).
    For master orgs: counts workspaces across master + all partners against the master plan limit.
    For partner orgs: resolves to the master org limit and checks consolidated usage.
    """
    if org_type == "partner":
        # Look up the master org and check against its consolidated limit
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if org and org.parent_org_id:
            master = db.query(Organization).filter(Organization.id == org.parent_org_id).first()
            if master and master.plan_tier in _ENTERPRISE_TIERS:
                max_ws = get_plan_limits(master.plan_tier)["workspaces"]
                total = _count_consolidated_workspaces(db, master.id)
                if max_ws is None:
                    return (True, total, None)
                return (total < max_ws, total, max_ws)
        # Fallback: no master found, use partner base
        current = db.query(Workspace).filter(Workspace.organization_id == org_id, Workspace.is_active == True).count()
        return (True, current, PLAN_PRICES.get("partner_base_workspaces", 10))

    if org_type == "master" and plan_tier in _ENTERPRISE_TIERS:
        max_ws = get_plan_limits(plan_tier)["workspaces"]
        total = _count_consolidated_workspaces(db, org_id)
        if max_ws is None:
            return (True, total, None)
        return (total < max_ws, total, max_ws)

    current = db.query(Workspace).filter(
        Workspace.organization_id == org_id,
        Workspace.is_active == True,
    ).count()
    limits = get_plan_limits(plan_tier)
    max_ws = limits["workspaces"]
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


def get_org_usage(db: Session, org_id, plan_tier: str, org_type: str = "standalone") -> dict:
    """Return usage and limits for an organization."""
    limits = dict(get_plan_limits(plan_tier))
    if org_type == "master" and plan_tier in _ENTERPRISE_TIERS:
        # Workspace limit = plan limit; usage = master + all partners consolidated
        limits["workspaces"] = get_plan_limits(plan_tier)["workspaces"]
        ws_count = _count_consolidated_workspaces(db, org_id)
    elif org_type == "partner":
        # Partner shows its own workspaces; limit comes from master's plan
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if org and org.parent_org_id:
            master = db.query(Organization).filter(Organization.id == org.parent_org_id).first()
            if master:
                limits["workspaces"] = get_plan_limits(master.plan_tier)["workspaces"]
                ws_count = _count_consolidated_workspaces(db, master.id)
            else:
                ws_count = db.query(Workspace).filter(Workspace.organization_id == org_id, Workspace.is_active == True).count()
        else:
            ws_count = db.query(Workspace).filter(Workspace.organization_id == org_id, Workspace.is_active == True).count()
    else:
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


# ── Migration365 access ────────────────────────────────────────────────────


def check_migration_access(db: Session, org_id) -> tuple:
    """Check if an org can use Migration365.

    Returns (allowed, remaining_licenses_or_none, message).
    - enterprise_migration: unlimited (remaining=None)
    - enterprise with active licenses: remaining count
    - anything else: denied
    """
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        return False, 0, "Organização não encontrada"

    effective = get_effective_plan(org)
    level = PLAN_HIERARCHY.get(effective, 0)

    # Bundle: unlimited
    if effective == "enterprise_migration":
        return True, None, "Migration365 ilimitado (bundle)"

    # Enterprise: check for approved licenses
    if level >= PLAN_HIERARCHY["enterprise"]:
        licenses = (
            db.query(MigrationLicense)
            .filter(
                MigrationLicense.organization_id == org_id,
                MigrationLicense.is_active == True,
                MigrationLicense.status == "approved",
            )
            .all()
        )
        total_purchased = sum(l.licenses_purchased for l in licenses)
        total_used = sum(l.licenses_used for l in licenses)
        remaining = total_purchased - total_used

        if total_purchased == 0:
            return False, 0, "Nenhuma licença Migration365 aprovada. Solicite licenças avulsas (R$ 70/usuário) ou faça upgrade para Enterprise + Migration."

        if remaining <= 0:
            return False, 0, f"Todas as {total_purchased} licenças foram utilizadas. Solicite mais licenças para continuar."

        return True, remaining, f"{remaining} licença(s) restante(s)"

    # Pro or below
    return False, 0, "Migration365 requer plano Enterprise ou superior."


def get_migration_license_summary(db: Session, org_id) -> dict:
    """Return license summary for an organization."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        return {"has_access": False}

    effective = get_effective_plan(org)

    if effective == "enterprise_migration":
        return {
            "has_access": True,
            "mode": "bundle",
            "licenses_purchased": None,
            "licenses_used": None,
            "licenses_remaining": None,
            "unit_price_cents": PLAN_PRICES.get("migration_license_unit", 7000),
        }

    level = PLAN_HIERARCHY.get(effective, 0)
    if level >= PLAN_HIERARCHY["enterprise"]:
        approved = (
            db.query(MigrationLicense)
            .filter(
                MigrationLicense.organization_id == org_id,
                MigrationLicense.is_active == True,
                MigrationLicense.status == "approved",
            )
            .all()
        )
        pending = (
            db.query(MigrationLicense)
            .filter(
                MigrationLicense.organization_id == org_id,
                MigrationLicense.status == "pending",
            )
            .count()
        )
        total_purchased = sum(l.licenses_purchased for l in approved)
        total_used = sum(l.licenses_used for l in approved)
        return {
            "has_access": total_purchased > total_used,
            "mode": "per_license",
            "licenses_purchased": total_purchased,
            "licenses_used": total_used,
            "licenses_remaining": total_purchased - total_used,
            "pending_requests": pending,
            "unit_price_cents": PLAN_PRICES.get("migration_license_unit", 7000),
        }

    return {
        "has_access": False,
        "mode": None,
        "required_plan": "enterprise",
        "unit_price_cents": PLAN_PRICES.get("migration_license_unit", 7000),
    }


def consume_migration_license(db: Session, org_id, count: int = 1) -> bool:
    """Consume N licenses from the oldest active license batch.

    For enterprise_migration (bundle), always returns True without consuming.
    Returns True if licenses were consumed, False if insufficient.
    """
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        return False

    effective = get_effective_plan(org)

    # Bundle: unlimited, no consumption needed
    if effective == "enterprise_migration":
        return True

    # Enterprise: consume from approved license batches (FIFO)
    # with_for_update() locks rows to prevent race conditions
    licenses = (
        db.query(MigrationLicense)
        .filter(
            MigrationLicense.organization_id == org_id,
            MigrationLicense.is_active == True,
            MigrationLicense.status == "approved",
        )
        .order_by(MigrationLicense.created_at.asc())
        .with_for_update()
        .all()
    )

    remaining_to_consume = count
    for lic in licenses:
        available = lic.licenses_purchased - lic.licenses_used
        if available <= 0:
            continue
        take = min(available, remaining_to_consume)
        lic.licenses_used += take
        remaining_to_consume -= take
        if remaining_to_consume <= 0:
            break

    if remaining_to_consume > 0:
        return False

    db.flush()
    return True
