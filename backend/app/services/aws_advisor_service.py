"""
AWS Advisor Service — fetches recommendations from AWS Trusted Advisor,
Compute Optimizer, and Cost Explorer.

Trusted Advisor full access requires Business/Enterprise support plan.
Compute Optimizer and Cost Explorer recommendations are free.
"""
import logging
from typing import List, Optional

import boto3

logger = logging.getLogger(__name__)

CATEGORY_MAP = {
    "cost_optimizing": "cost",
    "security": "security",
    "fault_tolerance": "reliability",
    "performance": "performance",
    "service_limits": "service_limits",
}

PILLAR_MAP = {
    "CostOptimizing": "cost",
    "Security": "security",
    "Reliability": "reliability",
    "Performance": "performance",
    "OperationalExcellence": "operational_excellence",
    "ServiceLimits": "service_limits",
}

STATUS_SEVERITY = {
    "error": "high",
    "warning": "medium",
    "ok": "low",
    "not_available": "low",
}


class AWSAdvisorService:
    """Wraps AWS Trusted Advisor, Compute Optimizer, and Cost Explorer recommendations."""

    def __init__(self, access_key: str, secret_key: str, region: str = "us-east-1"):
        self.access_key = access_key
        self.secret_key = secret_key
        self.region = region

    def _client(self, service: str, region: str = None):
        return boto3.client(
            service,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=region or self.region,
        )

    # ── Trusted Advisor ──────────────────────────────────────────────────────

    def _list_trusted_advisor(self) -> List[dict]:
        """Fetch Trusted Advisor check results. Requires Business/Enterprise plan."""
        results = []
        try:
            support = self._client("support", region="us-east-1")
            checks_resp = support.describe_trusted_advisor_checks(language="en")
            checks = checks_resp.get("checks", [])

            for check in checks:
                check_id = check["id"]
                category = CATEGORY_MAP.get(check.get("category", ""), check.get("category", ""))
                try:
                    result = support.describe_trusted_advisor_check_result(checkId=check_id, language="en")
                    status = result.get("result", {}).get("status", "not_available")
                    if status == "ok":
                        continue  # Skip healthy checks

                    flagged = result.get("result", {}).get("flaggedResources", [])
                    savings = self._extract_ta_savings(result.get("result", {}))

                    results.append({
                        "advisor_id": check_id,
                        "name": check.get("name", ""),
                        "category": category,
                        "impact": STATUS_SEVERITY.get(status, "low"),
                        "resource_id": "",
                        "resource_name": check.get("name", ""),
                        "resource_type": check.get("category", ""),
                        "region": "",
                        "problem": check.get("description", "").strip()[:500],
                        "solution": "",
                        "estimated_saving_monthly": savings,
                        "extended_properties": {
                            "status": status,
                            "flagged_resources_count": len(flagged),
                        },
                        "flagged_resources": flagged[:20],
                    })
                except Exception as e:
                    logger.debug(f"TA check {check_id} error: {e}")

        except Exception as e:
            err_str = str(e)
            if "SubscriptionRequiredException" in err_str or "AWSSupportAPI" in err_str:
                logger.info("AWS Trusted Advisor requires Business/Enterprise support plan. Skipping.")
            else:
                logger.warning(f"AWS Trusted Advisor error: {e}")
        return results

    def _extract_ta_savings(self, result: dict) -> float:
        """Extract savings from Trusted Advisor result."""
        try:
            cost_opt = result.get("categorySpecificSummary", {}).get("costOptimizing", {})
            monthly = cost_opt.get("estimatedMonthlySavings", 0)
            return round(float(monthly), 2)
        except (ValueError, TypeError):
            return 0.0

    # ── Compute Optimizer ────────────────────────────────────────────────────

    def _list_compute_optimizer(self) -> List[dict]:
        """Fetch EC2 right-sizing recommendations from Compute Optimizer (free)."""
        results = []
        try:
            co = self._client("compute-optimizer")
            resp = co.get_ec2_instance_recommendations(maxResults=200)
            for rec in resp.get("instanceRecommendations", []):
                current_type = rec.get("currentInstanceType", "")
                instance_arn = rec.get("instanceArn", "")
                instance_name = rec.get("instanceName", "") or instance_arn.split("/")[-1]
                finding = rec.get("finding", "")

                if finding in ("Optimized", "OPTIMIZED"):
                    continue

                options = rec.get("recommendationOptions", [])
                best_option = options[0] if options else {}
                rec_type = best_option.get("instanceType", "")
                perf_risk = best_option.get("performanceRisk", 0)

                savings = 0.0
                if best_option.get("projectedUtilizationMetrics"):
                    # Estimate savings from instance type difference
                    savings = self._estimate_ec2_savings(current_type, rec_type)

                impact = "medium"
                if finding in ("OVER_PROVISIONED", "Over-provisioned"):
                    impact = "medium"
                elif finding in ("UNDER_PROVISIONED", "Under-provisioned"):
                    impact = "high"

                results.append({
                    "advisor_id": f"co-{instance_arn}",
                    "name": f"EC2 {finding}: {instance_name}",
                    "category": "performance" if "UNDER" in finding.upper() else "cost",
                    "impact": impact,
                    "resource_id": instance_arn,
                    "resource_name": instance_name,
                    "resource_type": "AWS::EC2::Instance",
                    "region": instance_arn.split(":")[3] if ":" in instance_arn else self.region,
                    "problem": f"Instância {current_type} está {finding.lower().replace('_', ' ')}",
                    "solution": f"Considere alterar para {rec_type}" if rec_type else "Revise a utilização",
                    "estimated_saving_monthly": savings,
                    "extended_properties": {
                        "current_instance_type": current_type,
                        "recommended_instance_type": rec_type,
                        "finding": finding,
                        "performance_risk": perf_risk,
                    },
                })
        except Exception as e:
            if "OptInRequired" in str(e):
                logger.info("AWS Compute Optimizer not opted in. Skipping.")
            else:
                logger.warning(f"AWS Compute Optimizer error: {e}")
        return results

    def _estimate_ec2_savings(self, current: str, recommended: str) -> float:
        """Rough savings estimate based on instance type families."""
        cost_map = {
            "t2.nano": 4.18, "t2.micro": 8.35, "t2.small": 16.70, "t2.medium": 33.41,
            "t3.nano": 3.80, "t3.micro": 7.59, "t3.small": 15.18, "t3.medium": 30.37,
            "t3.large": 60.74, "t3.xlarge": 121.47, "t3.2xlarge": 242.94,
            "m5.large": 70.08, "m5.xlarge": 140.16, "m5.2xlarge": 280.32,
            "c5.large": 62.05, "c5.xlarge": 124.10, "c5.2xlarge": 248.20,
            "r5.large": 91.98, "r5.xlarge": 183.96,
        }
        cur_cost = cost_map.get(current, 0)
        rec_cost = cost_map.get(recommended, 0)
        if cur_cost > rec_cost > 0:
            return round(cur_cost - rec_cost, 2)
        return 0.0

    # ── Cost Explorer Recommendations (Reserved Instances / Savings Plans) ──

    def _list_ce_recommendations(self) -> List[dict]:
        """Fetch Cost Explorer RI/SP recommendations (free)."""
        results = []
        try:
            ce = self._client("ce", region="us-east-1")
            for service in ["Amazon Elastic Compute Cloud - Compute", "Amazon Relational Database Service"]:
                try:
                    resp = ce.get_reservation_purchase_recommendation(
                        Service=service,
                        LookbackPeriodInDays="THIRTY_DAYS",
                        TermInYears="ONE_YEAR",
                        PaymentOption="NO_UPFRONT",
                    )
                    for rec in resp.get("Recommendations", []):
                        details = rec.get("RecommendationDetails", [])
                        for d in details[:5]:
                            savings = float(d.get("EstimatedMonthlySavingsAmount", 0))
                            if savings < 1:
                                continue
                            instance_type = d.get("InstanceDetails", {}).get(
                                "EC2InstanceDetails", {}
                            ).get("InstanceType", "")
                            results.append({
                                "advisor_id": f"ce-ri-{service}-{instance_type}",
                                "name": f"Reserved Instance: {instance_type or service}",
                                "category": "cost",
                                "impact": "high" if savings > 50 else "medium",
                                "resource_id": "",
                                "resource_name": instance_type or service.split(" - ")[0],
                                "resource_type": "ReservedInstance",
                                "region": d.get("InstanceDetails", {}).get(
                                    "EC2InstanceDetails", {}
                                ).get("Region", self.region),
                                "problem": f"Uso consistente de {instance_type or service} detectado nos últimos 30 dias",
                                "solution": f"Comprar Reserved Instance pode economizar ${savings:.2f}/mês",
                                "estimated_saving_monthly": round(savings, 2),
                                "extended_properties": {
                                    "service": service,
                                    "instance_type": instance_type,
                                    "upfront_cost": d.get("UpfrontCost", "0"),
                                    "estimated_monthly_on_demand": d.get("EstimatedMonthlyOnDemandCost", "0"),
                                },
                            })
                except Exception as e:
                    logger.debug(f"CE recommendation for {service}: {e}")
        except Exception as e:
            logger.warning(f"AWS Cost Explorer recommendations error: {e}")
        return results

    # ── Public API ───────────────────────────────────────────────────────────

    def list_recommendations(self, category: str = None) -> List[dict]:
        """Fetch all recommendations from all sources, optionally filtered."""
        all_recs = []
        all_recs.extend(self._list_trusted_advisor())
        all_recs.extend(self._list_compute_optimizer())
        all_recs.extend(self._list_ce_recommendations())

        if category:
            cat_lower = category.lower()
            all_recs = [r for r in all_recs if r["category"] == cat_lower]

        return all_recs

    def get_summary(self) -> dict:
        """Summary counts by category and impact."""
        all_recs = self.list_recommendations()
        by_category = {}
        by_impact = {"high": 0, "medium": 0, "low": 0}
        total_savings = 0.0

        for r in all_recs:
            cat = r["category"]
            by_category[cat] = by_category.get(cat, 0) + 1
            by_impact[r["impact"]] = by_impact.get(r["impact"], 0) + 1
            total_savings += r.get("estimated_saving_monthly", 0)

        return {
            "total": len(all_recs),
            "by_category": by_category,
            "by_impact": by_impact,
            "estimated_total_savings_monthly": round(total_savings, 2),
            "sources": ["trusted_advisor", "compute_optimizer", "cost_explorer"],
        }

    def list_cost_as_finops_findings(self) -> List[dict]:
        """Cost-category recommendations in FinOps finding format."""
        cost_recs = self.list_recommendations(category="cost")
        findings = []
        for r in cost_recs:
            findings.append({
                "provider": "aws",
                "resource_id": r["resource_id"] or f"advisor:{r['name']}",
                "resource_name": r["resource_name"],
                "resource_type": r["resource_type"],
                "region": r["region"],
                "recommendation_type": "advisor_cost",
                "severity": r["impact"],
                "estimated_saving_monthly": r["estimated_saving_monthly"],
                "current_monthly_cost": 0.0,
                "reasoning": f"[AWS Advisor] {r['problem']}",
                "current_spec": r.get("extended_properties"),
                "recommended_spec": {"solution": r["solution"]} if r["solution"] else None,
            })
        return findings
