"""
Cost history service — per-month spend snapshots stored in
`finops_cost_history`. Source of truth for executive reports and
trend charts that need historical (not just current MTD) data.

Public API:
- consolidate_period(db, workspace_id, year_month, force=False) -> dict
- get_period_spend(db, workspace_id, year_month) -> float | None
- get_history(db, workspace_id, periods: list[str]) -> dict[str, float]
- ensure_period(db, workspace_id, year_month) -> float | None
    Reads from cost_history; if missing AND not the current month,
    consolidates synchronously then returns the value.
"""
import calendar
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional, Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.db_models import CloudAccount, FinOpsCostHistory

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _period_bounds(year_month: str) -> tuple[date, date]:
    """Return (start_of_month, first_of_next_month) for 'YYYY-MM'."""
    year, month = map(int, year_month.split("-"))
    start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end_inclusive = date(year, month, last_day)
    next_first = end_inclusive + timedelta(days=1)
    return start, next_first


def _current_year_month() -> str:
    today = date.today()
    return f"{today.year:04d}-{today.month:02d}"


def _is_current_month(year_month: str) -> bool:
    return year_month == _current_year_month()


def _is_future_month(year_month: str) -> bool:
    return year_month > _current_year_month()


# ── Provider fetchers (per arbitrary period) ─────────────────────────────────

def _fetch_aws_for_period(creds: dict, start_iso: str, end_exclusive_iso: str) -> Optional[float]:
    """AWS Cost Explorer accepts arbitrary TimePeriod with End exclusive.
    Returns USD amount or None on failure."""
    try:
        import boto3
        client = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        result = client.get_cost_and_usage(
            TimePeriod={"Start": start_iso, "End": end_exclusive_iso},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
        )
        total = sum(
            float(r["Total"]["UnblendedCost"]["Amount"])
            for r in result.get("ResultsByTime", [])
        )
        return total
    except Exception as exc:
        logger.warning("AWS cost fetch [%s..%s) failed: %s", start_iso, end_exclusive_iso, exc)
        return None


def _fetch_azure_for_period(creds: dict, start_iso: str, end_inclusive_iso: str) -> Optional[float]:
    """Azure Cost Management `query.usage` with custom timeframe.
    `end_inclusive_iso` is the last day of the period (date string)."""
    try:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.costmanagement import CostManagementClient
        from azure.mgmt.costmanagement.models import (
            QueryDefinition, QueryTimePeriod, QueryDataset, QueryAggregation,
            TimeframeType, ExportType,
        )
        credential = ClientSecretCredential(
            tenant_id=creds.get("tenant_id", ""),
            client_id=creds.get("client_id", ""),
            client_secret=creds.get("client_secret", ""),
        )
        sub_id = creds.get("subscription_id", "")
        client = CostManagementClient(credential)
        scope = f"/subscriptions/{sub_id}"
        query = QueryDefinition(
            type=ExportType.ACTUAL_COST,
            timeframe=TimeframeType.CUSTOM,
            time_period=QueryTimePeriod(
                from_property=f"{start_iso}T00:00:00Z",
                to=f"{end_inclusive_iso}T23:59:59Z",
            ),
            dataset=QueryDataset(
                granularity="None",
                aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
            ),
        )
        result = client.query.usage(scope=scope, parameters=query)
        rows = result.rows or []
        return float(rows[0][0]) if rows else 0.0
    except Exception as exc:
        logger.warning("Azure cost fetch [%s..%s] failed: %s", start_iso, end_inclusive_iso, exc)
        return None


def _fetch_provider_for_period(provider: str, creds: dict,
                               start: date, end_exclusive: date) -> Optional[float]:
    if provider == "aws":
        return _fetch_aws_for_period(
            creds, start.isoformat(), end_exclusive.isoformat()
        )
    if provider == "azure":
        last_inclusive = end_exclusive - timedelta(days=1)
        return _fetch_azure_for_period(
            creds, start.isoformat(), last_inclusive.isoformat()
        )
    # GCP not implemented yet — explicit None
    return None


# ── Public API ───────────────────────────────────────────────────────────────

def consolidate_period(db: Session, workspace_id: UUID, year_month: str,
                       force: bool = False) -> dict:
    """Fetch each provider's spend for the given month and upsert it into
    finops_cost_history. Skips entries that already exist unless `force=True`.

    Returns: {"aws": <float|None>, "azure": <float|None>, ...}
    Future months are rejected.
    """
    from app.services.auth_service import decrypt_for_account

    if _is_future_month(year_month):
        raise ValueError(f"Período futuro não pode ser consolidado: {year_month}")

    start, end_excl = _period_bounds(year_month)
    is_current = _is_current_month(year_month)

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == workspace_id,
        CloudAccount.is_active == True,
    ).all()

    # Aggregate spend per provider across all accounts of that provider
    by_provider: dict[str, float] = {}
    for acc in accounts:
        if acc.provider not in ("aws", "azure"):
            continue
        try:
            creds = decrypt_for_account(db, acc)
        except Exception as exc:
            logger.warning("Skipping account %s — credential decrypt failed: %s", acc.id, exc)
            continue
        spend = _fetch_provider_for_period(acc.provider, creds, start, end_excl)
        if spend is None:
            continue
        by_provider[acc.provider] = by_provider.get(acc.provider, 0.0) + spend

    # Upsert each provider entry
    for provider, total in by_provider.items():
        existing = db.query(FinOpsCostHistory).filter(
            FinOpsCostHistory.workspace_id == workspace_id,
            FinOpsCostHistory.provider == provider,
            FinOpsCostHistory.year_month == year_month,
        ).first()
        if existing and not force and not existing.is_partial and not is_current:
            # Closed-month entry already saved — don't overwrite
            continue
        if existing:
            existing.spend = Decimal(str(round(total, 2)))
            existing.is_partial = is_current
            existing.collected_at = datetime.utcnow()
            existing.source = "api"
        else:
            db.add(FinOpsCostHistory(
                workspace_id=workspace_id,
                provider=provider,
                year_month=year_month,
                spend=Decimal(str(round(total, 2))),
                currency="USD",
                source="api",
                is_partial=is_current,
            ))
    db.commit()
    return by_provider


def get_period_spend(db: Session, workspace_id: UUID, year_month: str,
                     provider: Optional[str] = None) -> Optional[float]:
    """Read consolidated spend for a period from cost_history. None if missing."""
    q = db.query(FinOpsCostHistory).filter(
        FinOpsCostHistory.workspace_id == workspace_id,
        FinOpsCostHistory.year_month == year_month,
    )
    if provider and provider != "all":
        q = q.filter(FinOpsCostHistory.provider == provider)
    rows = q.all()
    if not rows:
        return None
    return float(sum(r.spend for r in rows))


def get_history(db: Session, workspace_id: UUID,
                periods: Iterable[str]) -> dict[str, float]:
    """Bulk-read cost_history for several periods. Missing periods omitted."""
    periods = list(periods)
    if not periods:
        return {}
    rows = db.query(FinOpsCostHistory).filter(
        FinOpsCostHistory.workspace_id == workspace_id,
        FinOpsCostHistory.year_month.in_(periods),
    ).all()
    result: dict[str, float] = {}
    for r in rows:
        result[r.year_month] = result.get(r.year_month, 0.0) + float(r.spend)
    return result


def ensure_period(db: Session, workspace_id: UUID, year_month: str) -> Optional[float]:
    """Read the period from cost_history; if missing and the period is in the
    past (closed), consolidate on demand from the provider APIs and return it.
    For the current month, returns whatever is stored (may be None)."""
    cached = get_period_spend(db, workspace_id, year_month)
    if cached is not None:
        return cached
    if _is_future_month(year_month) or _is_current_month(year_month):
        return cached
    try:
        consolidate_period(db, workspace_id, year_month)
    except Exception as exc:
        logger.warning("On-demand consolidate failed for %s/%s: %s", workspace_id, year_month, exc)
        return None
    return get_period_spend(db, workspace_id, year_month)
