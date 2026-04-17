"""Reserved Instances / Savings Plans / CUD analysis endpoints.

GET  /reservations/coverage      — % on-demand vs reserved per provider
GET  /reservations/utilization   — utilization of active reservations
POST /reservations/recommendations — generate RI/SP/CUD recommendations
GET  /reservations/recommendations — list existing recommendations of RI/SP/CUD type
"""
import logging
from datetime import date, timedelta
from typing import List, Optional

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import CloudAccount, FinOpsRecommendation
from app.services.auth_service import decrypt_for_account

from . import ws_router
from ._helpers import _get_org_plan, _require_plan, _persist_findings

logger = logging.getLogger(__name__)

_RI_TYPES = {"reserved_instance", "savings_plan", "committed_use_discount"}


# ── AWS helpers ───────────────────────────────────────────────────────────────

def _aws_ri_coverage(creds: dict, start_date: str, end_date: str) -> dict:
    try:
        import boto3
        ce = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        resp = ce.get_reservation_coverage(
            TimePeriod={"Start": start_date, "End": end_date},
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )
        total = resp.get("Total", {})
        coverage_hours = total.get("CoverageHours", {})
        coverage_pct = float(coverage_hours.get("CoverageHoursPercentage", 0))
        on_demand_pct = 100.0 - coverage_pct

        return {
            "provider": "aws",
            "coverage_type": "reservation",
            "coverage_pct": round(coverage_pct, 2),
            "on_demand_pct": round(on_demand_pct, 2),
            "details": {
                "on_demand_hours": float(coverage_hours.get("OnDemandHours", 0)),
                "reserved_hours": float(coverage_hours.get("ReservedHours", 0)),
                "total_hours": float(coverage_hours.get("TotalRunningHours", 0)),
            },
        }
    except Exception as exc:
        logger.warning(f"AWS RI coverage failed: {exc}")
        return {"provider": "aws", "coverage_type": "reservation", "coverage_pct": 0.0, "on_demand_pct": 0.0, "error": str(exc)}


def _aws_sp_coverage(creds: dict, start_date: str, end_date: str) -> dict:
    try:
        import boto3
        ce = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        resp = ce.get_savings_plans_coverage(
            TimePeriod={"Start": start_date, "End": end_date},
        )
        total = resp.get("Total", {})
        coverage_pct = float(total.get("CoveragePercentage", 0))
        return {
            "provider": "aws",
            "coverage_type": "savings_plan",
            "coverage_pct": round(coverage_pct, 2),
            "on_demand_pct": round(100.0 - coverage_pct, 2),
            "details": {
                "covered_spend": float(total.get("SpendCoveredBySavingsPlans", 0)),
                "on_demand_spend": float(total.get("OnDemandCost", 0)),
            },
        }
    except Exception as exc:
        logger.warning(f"AWS SP coverage failed: {exc}")
        return {"provider": "aws", "coverage_type": "savings_plan", "coverage_pct": 0.0, "on_demand_pct": 0.0}


def _aws_ri_utilization(creds: dict, start_date: str, end_date: str) -> dict:
    try:
        import boto3
        ce = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        resp = ce.get_reservation_utilization(
            TimePeriod={"Start": start_date, "End": end_date},
        )
        total = resp.get("Total", {})
        util_pct = float(total.get("UtilizationPercentage", 0))
        net_savings = float(total.get("NetRISavings", 0))
        return {
            "provider": "aws",
            "type": "reserved_instance",
            "utilization_pct": round(util_pct, 2),
            "net_savings": round(net_savings, 4),
            "status": "good" if util_pct >= 80 else ("warning" if util_pct >= 50 else "underutilized"),
        }
    except Exception as exc:
        logger.warning(f"AWS RI utilization failed: {exc}")
        return {"provider": "aws", "type": "reserved_instance", "utilization_pct": 0.0}


def _aws_sp_utilization(creds: dict, start_date: str, end_date: str) -> dict:
    try:
        import boto3
        ce = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        resp = ce.get_savings_plans_utilization(
            TimePeriod={"Start": start_date, "End": end_date},
        )
        total = resp.get("Total", {})
        util_pct = float(total.get("UsedCommitment", 0)) / max(float(total.get("TotalCommitment", 1)), 0.01) * 100
        net_savings = float(total.get("NetSavings", 0))
        return {
            "provider": "aws",
            "type": "savings_plan",
            "utilization_pct": round(util_pct, 2),
            "net_savings": round(net_savings, 4),
            "status": "good" if util_pct >= 80 else ("warning" if util_pct >= 50 else "underutilized"),
        }
    except Exception as exc:
        logger.warning(f"AWS SP utilization failed: {exc}")
        return {"provider": "aws", "type": "savings_plan", "utilization_pct": 0.0}


def _aws_ri_recommendations(creds: dict) -> List[dict]:
    try:
        import boto3
        ce = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        findings = []
        for service in [
            "Amazon Elastic Compute Cloud - Compute",
            "Amazon Relational Database Service",
            "Amazon ElastiCache",
        ]:
            try:
                resp = ce.get_reservation_purchase_recommendation(
                    Service=service,
                    LookbackPeriodInDays="THIRTY_DAYS",
                    TermInYears="ONE_YEAR",
                    PaymentOption="NO_UPFRONT",
                )
                for rec in resp.get("Recommendations", [])[:3]:
                    for detail in rec.get("RecommendationDetails", [])[:2]:
                        avg_util = float(detail.get("AverageUtilization", 0) or 0)
                        monthly_saving = float(detail.get("EstimatedMonthlySavingsAmount", 0) or 0)
                        if monthly_saving <= 0:
                            continue
                        spec = detail.get("InstanceDetails", {})
                        ec2_spec = spec.get("EC2InstanceDetails", spec.get("RDSInstanceDetails", {}))
                        findings.append({
                            "provider": "aws",
                            "resource_id": f"aws-ri-{service[:20]}-{ec2_spec.get('InstanceType', 'unknown')}",
                            "resource_name": f"RI {service[:30]}",
                            "resource_type": "reserved_instance",
                            "recommendation_type": "reserved_instance",
                            "severity": "high" if monthly_saving > 500 else "medium",
                            "estimated_saving_monthly": round(monthly_saving, 2),
                            "current_monthly_cost": round(float(detail.get("EstimatedBreakEvenInMonths", 12) or 12) * monthly_saving / 12, 2),
                            "reasoning": (
                                f"Compra de Reserved Instance para {service[:30]} "
                                f"pode economizar ${monthly_saving:,.2f}/mês com uso médio de {avg_util:.0f}%"
                            ),
                            "current_spec": f"On-Demand | InstanceType: {ec2_spec.get('InstanceType', 'N/A')}",
                            "recommended_spec": f"1-Year No-Upfront RI | InstanceType: {ec2_spec.get('InstanceType', 'N/A')}",
                        })
            except Exception as exc:
                logger.debug(f"AWS RI rec for {service}: {exc}")
        return findings
    except Exception as exc:
        logger.warning(f"AWS RI recommendations failed: {exc}")
        return []


def _aws_sp_recommendations(creds: dict) -> List[dict]:
    try:
        import boto3
        ce = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        resp = ce.get_savings_plans_purchase_recommendation(
            SavingsPlansType="COMPUTE_SP",
            TermInYears="ONE_YEAR",
            PaymentOption="NO_UPFRONT",
            LookbackPeriodInDays="THIRTY_DAYS",
        )
        findings = []
        for detail in resp.get("Recommendations", {}).get("SavingsPlansPurchaseRecommendationDetails", [])[:3]:
            saving = float(detail.get("EstimatedMonthlySavingsAmount", 0) or 0)
            if saving <= 0:
                continue
            hourly = float(detail.get("HourlyCommitmentToPurchase", 0) or 0)
            findings.append({
                "provider": "aws",
                "resource_id": f"aws-sp-compute-{hourly:.2f}",
                "resource_name": "Compute Savings Plan",
                "resource_type": "savings_plan",
                "recommendation_type": "savings_plan",
                "severity": "high" if saving > 500 else "medium",
                "estimated_saving_monthly": round(saving, 2),
                "current_monthly_cost": round(hourly * 24 * 30, 2),
                "reasoning": (
                    f"Compute Savings Plan de ${hourly:.3f}/h pode economizar "
                    f"${saving:,.2f}/mês comparado ao On-Demand"
                ),
                "current_spec": "On-Demand",
                "recommended_spec": f"Compute SP 1-Year No-Upfront @ ${hourly:.4f}/h",
            })
        return findings
    except Exception as exc:
        logger.warning(f"AWS SP recommendations failed: {exc}")
        return []


# ── Azure helpers ─────────────────────────────────────────────────────────────

def _azure_ri_coverage(creds: dict, start_date: str, end_date: str) -> dict:
    try:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.consumption import ConsumptionManagementClient
        credential = ClientSecretCredential(
            tenant_id=creds.get("tenant_id", ""),
            client_id=creds.get("client_id", ""),
            client_secret=creds.get("client_secret", ""),
        )
        sub_id = creds.get("subscription_id", "")
        client = ConsumptionManagementClient(credential, sub_id)
        scope = f"/subscriptions/{sub_id}"
        summaries = list(client.reservations_summaries.list(
            scope=scope,
            grain="monthly",
        ))
        if not summaries:
            return {"provider": "azure", "coverage_type": "reservation", "coverage_pct": 0.0, "on_demand_pct": 100.0}
        avg_util = sum(float(s.avg_utilization_percentage or 0) for s in summaries) / max(len(summaries), 1)
        return {
            "provider": "azure",
            "coverage_type": "reservation",
            "coverage_pct": round(avg_util, 2),
            "on_demand_pct": round(100.0 - avg_util, 2),
            "details": {"reservation_count": len(summaries)},
        }
    except Exception as exc:
        logger.warning(f"Azure RI coverage failed: {exc}")
        return {"provider": "azure", "coverage_type": "reservation", "coverage_pct": 0.0, "on_demand_pct": 100.0}


def _azure_ri_recommendations(creds: dict) -> List[dict]:
    try:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.consumption import ConsumptionManagementClient
        credential = ClientSecretCredential(
            tenant_id=creds.get("tenant_id", ""),
            client_id=creds.get("client_id", ""),
            client_secret=creds.get("client_secret", ""),
        )
        sub_id = creds.get("subscription_id", "")
        client = ConsumptionManagementClient(credential, sub_id)
        scope = f"/subscriptions/{sub_id}"
        recs = list(client.reservation_recommendations.list(scope=scope))
        findings = []
        for rec in recs[:5]:
            saving = float(getattr(rec, "net_savings", 0) or 0)
            if saving <= 0:
                continue
            findings.append({
                "provider": "azure",
                "resource_id": f"azure-ri-{getattr(rec, 'sku_name', 'unknown')}",
                "resource_name": f"RI Azure {getattr(rec, 'sku_name', 'Unknown')}",
                "resource_type": "reserved_instance",
                "recommendation_type": "reserved_instance",
                "severity": "high" if saving > 300 else "medium",
                "estimated_saving_monthly": round(saving, 2),
                "current_monthly_cost": round(float(getattr(rec, 'total_cost_without_benefit', 0) or 0), 2),
                "reasoning": (
                    f"Azure Reserved Instance para {getattr(rec, 'sku_name', 'N/A')} "
                    f"pode economizar ${saving:,.2f}/mês"
                ),
                "current_spec": "Pay-as-you-go",
                "recommended_spec": f"1-Year RI | {getattr(rec, 'sku_name', 'N/A')}",
            })
        return findings
    except Exception as exc:
        logger.warning(f"Azure RI recommendations failed: {exc}")
        return []


# ── Endpoints ─────────────────────────────────────────────────────────────────

@ws_router.get("/reservations/coverage")
async def get_reservation_coverage(
    start_date: str = Query(default=None),
    end_date: str = Query(default=None),
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Análise de Reservas")

    today = date.today()
    if not end_date:
        end_date = today.isoformat()
    if not start_date:
        start_date = today.replace(day=1).isoformat()

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.is_active == True,
    ).all()

    results = []
    for account in accounts:
        try:
            creds = decrypt_for_account(db, account)
            if account.provider == "aws":
                results.append(_aws_ri_coverage(creds, start_date, end_date))
                results.append(_aws_sp_coverage(creds, start_date, end_date))
            elif account.provider == "azure":
                results.append(_azure_ri_coverage(creds, start_date, end_date))
        except Exception as exc:
            logger.warning(f"Coverage fetch failed for account {account.id}: {exc}")

    return {"start_date": start_date, "end_date": end_date, "coverage": results}


@ws_router.get("/reservations/utilization")
async def get_reservation_utilization(
    start_date: str = Query(default=None),
    end_date: str = Query(default=None),
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Análise de Reservas")

    today = date.today()
    if not end_date:
        end_date = today.isoformat()
    if not start_date:
        start_date = (today - timedelta(days=30)).isoformat()

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.is_active == True,
    ).all()

    results = []
    for account in accounts:
        try:
            creds = decrypt_for_account(db, account)
            if account.provider == "aws":
                results.append(_aws_ri_utilization(creds, start_date, end_date))
                results.append(_aws_sp_utilization(creds, start_date, end_date))
        except Exception as exc:
            logger.warning(f"Utilization fetch failed for account {account.id}: {exc}")

    return {"start_date": start_date, "end_date": end_date, "utilization": results}


@ws_router.post("/reservations/recommendations", status_code=200)
async def generate_reservation_recommendations(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """Generate and persist RI/SP/CUD recommendations for all cloud accounts."""
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Recomendações de Reservas")

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.is_active == True,
    ).all()

    total_new = 0
    for account in accounts:
        try:
            creds = decrypt_for_account(db, account)
            findings = []
            if account.provider == "aws":
                findings.extend(_aws_ri_recommendations(creds))
                findings.extend(_aws_sp_recommendations(creds))
            elif account.provider == "azure":
                findings.extend(_azure_ri_recommendations(creds))
            if findings:
                new = _persist_findings(findings, member.workspace_id, account.id, db)
                total_new += new
        except Exception as exc:
            logger.warning(f"Reservation recommendations failed for account {account.id}: {exc}")

    return {"generated": total_new}


@ws_router.get("/reservations/recommendations")
async def list_reservation_recommendations(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """List existing RI/SP/CUD recommendations."""
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Recomendações de Reservas")

    recs = (
        db.query(FinOpsRecommendation)
        .filter(
            FinOpsRecommendation.workspace_id == member.workspace_id,
            FinOpsRecommendation.recommendation_type.in_(list(_RI_TYPES)),
            FinOpsRecommendation.status == "pending",
        )
        .order_by(FinOpsRecommendation.estimated_saving_monthly.desc())
        .all()
    )

    return [
        {
            "id": str(r.id),
            "provider": r.provider,
            "resource_name": r.resource_name,
            "recommendation_type": r.recommendation_type,
            "severity": r.severity,
            "estimated_saving_monthly": r.estimated_saving_monthly,
            "current_monthly_cost": r.current_monthly_cost,
            "reasoning": r.reasoning,
            "current_spec": r.current_spec,
            "recommended_spec": r.recommended_spec,
            "detected_at": r.detected_at.isoformat() if r.detected_at else None,
        }
        for r in recs
    ]
