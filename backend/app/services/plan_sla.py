"""SLA rules per plan + business-hours deadline calculation."""
from __future__ import annotations
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from ..models.db_models import SupportConfig


# None = no support access for the plan
SLA_FIRST_RESPONSE_HOURS: dict[str, int | None] = {
    "free": None,
    "basic": 48,
    "standard": 24,
    "enterprise": 4,            # legacy alias
    "enterprise_e1": 4,
    "enterprise_e2": 4,
    "enterprise_e3": 4,
    "enterprise_migration": 4,
}

PRIORITY_MULTIPLIER = {
    "urgent": 0.5,
    "high":   0.75,
    "normal": 1.0,
    "low":    1.5,
}


def sla_hours_for(plan: str, priority: str = "normal") -> int | None:
    base = SLA_FIRST_RESPONSE_HOURS.get(plan)
    if base is None:
        return None
    mult = PRIORITY_MULTIPLIER.get(priority, 1.0)
    return max(1, int(round(base * mult)))


def has_support_access(plan: str) -> bool:
    return SLA_FIRST_RESPONSE_HOURS.get(plan) is not None


def get_config(db: Session) -> SupportConfig:
    cfg = db.query(SupportConfig).filter(SupportConfig.id == 1).first()
    if not cfg:
        cfg = SupportConfig(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _business_days(cfg: SupportConfig) -> set[int]:
    # Python: Monday=0..Sunday=6. DB stores 1..7 (ISO).
    try:
        return {int(x.strip()) - 1 for x in (cfg.business_days or "1,2,3,4,5").split(",") if x.strip()}
    except Exception:
        return {0, 1, 2, 3, 4}


def compute_sla_deadline(db: Session, start: datetime, hours: int) -> datetime:
    """Add `hours` of business time to `start`, respecting config business hours/days."""
    cfg = get_config(db)
    bh_start = cfg.business_hours_start
    bh_end   = cfg.business_hours_end
    days     = _business_days(cfg)
    hours_per_day = max(1, bh_end - bh_start)

    current = start
    remaining = timedelta(hours=hours)

    while remaining > timedelta(0):
        # roll forward to next business moment
        if current.weekday() not in days:
            current = (current + timedelta(days=1)).replace(hour=bh_start, minute=0, second=0, microsecond=0)
            continue
        if current.hour < bh_start:
            current = current.replace(hour=bh_start, minute=0, second=0, microsecond=0)
        if current.hour >= bh_end:
            current = (current + timedelta(days=1)).replace(hour=bh_start, minute=0, second=0, microsecond=0)
            continue

        end_of_day = current.replace(hour=bh_end, minute=0, second=0, microsecond=0)
        available = end_of_day - current
        if remaining <= available:
            return current + remaining
        remaining -= available
        current = (current + timedelta(days=1)).replace(hour=bh_start, minute=0, second=0, microsecond=0)

    return current
