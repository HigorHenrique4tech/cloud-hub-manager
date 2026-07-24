"""
Azure Advisor Service — fetches recommendations from Azure Advisor API.

Categories:
  - Cost            → merged into FinOps recommendations
  - Security        → shown in Advisor page
  - Reliability     → shown in Advisor page
  - OperationalExcellence → shown in Advisor page
  - Performance     → shown in Advisor page
"""
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

# Map Azure Advisor category to our internal category names
CATEGORY_MAP = {
    "Cost": "cost",
    "Security": "security",
    "HighAvailability": "reliability",
    "OperationalExcellence": "operational_excellence",
    "Performance": "performance",
}

IMPACT_MAP = {
    "High": "high",
    "Medium": "medium",
    "Low": "low",
}


class AzureAdvisorService:
    """Fetches recommendations from Azure Advisor REST API."""

    def __init__(self, subscription_id: str, tenant_id: str, client_id: str, client_secret: str):
        self.subscription_id = subscription_id
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._credential = None
        self._client = None

    def _get_credential(self):
        if not self._credential:
            from azure.identity import ClientSecretCredential
            self._credential = ClientSecretCredential(
                tenant_id=self.tenant_id,
                client_id=self.client_id,
                client_secret=self.client_secret,
            )
        return self._credential

    def _get_client(self):
        if not self._client:
            from azure.mgmt.advisor import AdvisorManagementClient
            self._client = AdvisorManagementClient(
                self._get_credential(), self.subscription_id
            )
        return self._client

    def generate_recommendations(self) -> None:
        """Trigger Advisor to generate/refresh recommendations."""
        try:
            client = self._get_client()
            client.recommendations.generate()
            logger.info("Azure Advisor: generate triggered for subscription %s", self.subscription_id)
        except Exception as e:
            logger.warning("Azure Advisor generate error: %s", e)

    def list_recommendations(self, category: Optional[str] = None) -> List[dict]:
        """
        Fetch all Advisor recommendations, optionally filtered by category.

        Args:
            category: One of 'Cost', 'Security', 'HighAvailability',
                      'OperationalExcellence', 'Performance', or None for all.

        Returns:
            List of normalized recommendation dicts.
        """
        try:
            client = self._get_client()

            filter_str = f"Category eq '{category}'" if category else None
            recs = client.recommendations.list(filter=filter_str)

            results = []
            for rec in recs:
                try:
                    result = self._normalize(rec)
                    if result:
                        results.append(result)
                except Exception as e:
                    logger.debug("Skip advisor rec %s: %s", getattr(rec, 'id', '?'), e)

            return results
        except Exception as e:
            logger.error("Azure Advisor list error: %s", e)
            return []

    def _normalize(self, rec) -> Optional[dict]:
        """Convert an Azure Advisor recommendation object to our standard dict."""
        props = rec.additional_properties if hasattr(rec, 'additional_properties') else {}

        # Extract basic fields
        rec_id = rec.id or ""
        name = rec.name or ""
        category_raw = rec.category if hasattr(rec, 'category') else (
            props.get("category", "")
        )
        category = CATEGORY_MAP.get(str(category_raw), str(category_raw).lower())

        impact_raw = rec.impact if hasattr(rec, 'impact') else props.get("impact", "Low")
        impact = IMPACT_MAP.get(str(impact_raw), "low")

        # Short description
        short_desc = ""
        if hasattr(rec, 'short_description') and rec.short_description:
            short_desc = getattr(rec.short_description, 'problem', '') or ""
            solution = getattr(rec.short_description, 'solution', '') or ""
        else:
            short_desc = props.get("shortDescription", {}).get("problem", "")
            solution = props.get("shortDescription", {}).get("solution", "")

        # Resource metadata
        resource_id = rec.resource_metadata.resource_id if hasattr(rec, 'resource_metadata') and rec.resource_metadata else ""
        resource_source = rec.resource_metadata.source if hasattr(rec, 'resource_metadata') and rec.resource_metadata else ""

        # Parse resource name and type from ARM ID
        resource_name = resource_id.split("/")[-1] if resource_id else name
        resource_type = self._extract_resource_type(resource_id)
        region = self._extract_region(rec)

        # Extended properties (cost savings, etc.)
        extended = rec.extended_properties if hasattr(rec, 'extended_properties') and rec.extended_properties else {}

        # Estimated savings
        savings = 0.0
        if extended:
            savings = self._extract_savings(extended)

        return {
            "advisor_id": rec_id,
            "name": name,
            "category": category,
            "impact": impact,
            "resource_id": resource_id,
            "resource_name": resource_name,
            "resource_type": resource_type,
            "region": region,
            "problem": short_desc,
            "solution": solution,
            "estimated_saving_monthly": savings,
            "extended_properties": dict(extended) if extended else {},
            "recommendation_type_id": rec.recommendation_type_id if hasattr(rec, 'recommendation_type_id') else "",
        }

    def _extract_resource_type(self, resource_id: str) -> str:
        """Extract resource type from ARM ID."""
        if not resource_id:
            return "unknown"
        parts = resource_id.split("/")
        # ARM format: .../providers/Microsoft.Compute/virtualMachines/vm-name
        try:
            idx = next(i for i, p in enumerate(parts) if p.lower() == "providers")
            if idx + 2 < len(parts):
                return f"{parts[idx+1]}/{parts[idx+2]}"
        except StopIteration:
            pass
        return "unknown"

    def _extract_region(self, rec) -> str:
        """Try to extract region from recommendation metadata."""
        if hasattr(rec, 'resource_metadata') and rec.resource_metadata:
            action = rec.resource_metadata.action if hasattr(rec.resource_metadata, 'action') else None
            if action and isinstance(action, dict):
                return action.get("region", "")
        extended = rec.extended_properties if hasattr(rec, 'extended_properties') and rec.extended_properties else {}
        return extended.get("region", extended.get("location", ""))

    def _extract_savings(self, extended: dict) -> float:
        """Extract estimated monthly savings from extended properties."""
        # Azure Advisor uses various keys for savings
        for key in ["annualSavingsAmount", "savingsAmount", "annualSavings"]:
            if key in extended:
                try:
                    annual = float(extended[key])
                    return round(annual / 12, 2) if "annual" in key.lower() else round(annual, 2)
                except (ValueError, TypeError):
                    pass
        return 0.0

    def get_summary(self) -> dict:
        """Get a summary count of recommendations by category and impact."""
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
        }

    def list_cost_as_finops_findings(self) -> List[dict]:
        """
        Fetch Cost-category recommendations and return them in FinOps finding format,
        compatible with _persist_findings().
        """
        cost_recs = self.list_recommendations(category="Cost")
        findings = []

        for r in cost_recs:
            findings.append({
                "provider": "azure",
                "resource_id": r["resource_id"] or f"advisor:{r['name']}",
                "resource_name": r["resource_name"],
                "resource_type": r["resource_type"],
                "region": r["region"],
                "recommendation_type": "advisor_cost",
                "severity": r["impact"],
                "estimated_saving_monthly": r["estimated_saving_monthly"],
                "current_monthly_cost": 0.0,
                "reasoning": f"[Azure Advisor] {r['problem']}",
                "current_spec": r.get("extended_properties"),
                "recommended_spec": {"solution": r["solution"]} if r["solution"] else None,
            })

        return findings
