"""
GCP Recommender Service — fetches recommendations from Google Cloud Recommender API.

Categories: Cost, Security, Performance, Manageability, Sustainability.
Free — included with any GCP project.
"""
import logging
from typing import List, Optional

from google.oauth2 import service_account

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

# Recommender IDs to scan (subset of most useful ones)
_RECOMMENDERS = [
    # Cost
    ("google.compute.instance.MachineTypeRecommender", "cost", "Rightsizing VM"),
    ("google.compute.instance.IdleResourceRecommender", "cost", "VM Ociosa"),
    ("google.compute.disk.IdleResourceRecommender", "cost", "Disco Ocioso"),
    ("google.compute.address.IdleResourceRecommender", "cost", "IP Ocioso"),
    ("google.compute.commitment.UsageCommitmentRecommender", "cost", "Committed Use Discount"),
    # Security
    ("google.iam.policy.Recommender", "security", "IAM Policy"),
    ("google.iam.serviceAccount.IdleRecommender", "security", "Service Account Ociosa"),
    # Performance
    ("google.compute.instance.PerformanceRecommender", "performance", "Performance VM"),
    ("google.compute.disk.PerformanceRecommender", "performance", "Performance Disco"),
    # Manageability / Operational
    ("google.logging.productSuggestion.ContainerRecommender", "operational_excellence", "Logging"),
]

# Zone-based recommenders (need to iterate zones)
_ZONE_RECOMMENDERS = [
    "google.compute.instance.MachineTypeRecommender",
    "google.compute.instance.IdleResourceRecommender",
    "google.compute.disk.IdleResourceRecommender",
    "google.compute.instance.PerformanceRecommender",
    "google.compute.disk.PerformanceRecommender",
]

# Region-based recommenders
_REGION_RECOMMENDERS = [
    "google.compute.address.IdleResourceRecommender",
    "google.compute.commitment.UsageCommitmentRecommender",
]

# Project-level recommenders
_PROJECT_RECOMMENDERS = [
    "google.iam.policy.Recommender",
    "google.iam.serviceAccount.IdleRecommender",
    "google.logging.productSuggestion.ContainerRecommender",
]

PRIORITY_MAP = {
    "P1": "high",
    "P2": "high",
    "P3": "medium",
    "P4": "low",
    "PRIORITY_UNSPECIFIED": "low",
}


class GCPRecommenderService:
    """Fetches recommendations from Google Cloud Recommender API."""

    def __init__(self, project_id: str, client_email: str, private_key: str, private_key_id: str):
        self.project_id = project_id
        info = {
            "type": "service_account",
            "project_id": project_id,
            "client_email": client_email,
            "private_key": private_key.replace("\\n", "\n"),
            "private_key_id": private_key_id,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        self.credentials = service_account.Credentials.from_service_account_info(
            info, scopes=_SCOPES
        )

    def _get_client(self):
        from google.cloud import recommender_v1
        return recommender_v1.RecommenderClient(credentials=self.credentials)

    def _get_zones(self) -> List[str]:
        """Get a subset of common zones to scan."""
        from google.cloud import compute_v1
        try:
            zones_client = compute_v1.ZonesClient(credentials=self.credentials)
            return [z.name for z in zones_client.list(project=self.project_id)]
        except Exception as e:
            logger.warning(f"GCP zones list error: {e}, using defaults")
            return [
                "us-central1-a", "us-central1-b", "us-east1-b",
                "europe-west1-b", "southamerica-east1-a", "southamerica-east1-b",
            ]

    def _get_regions(self) -> List[str]:
        """Get a subset of common regions."""
        from google.cloud import compute_v1
        try:
            regions_client = compute_v1.RegionsClient(credentials=self.credentials)
            return [r.name for r in regions_client.list(project=self.project_id)]
        except Exception as e:
            logger.warning(f"GCP regions list error: {e}, using defaults")
            return ["us-central1", "us-east1", "europe-west1", "southamerica-east1"]

    def list_recommendations(self, category: str = None) -> List[dict]:
        """Fetch recommendations from GCP Recommender API."""
        client = self._get_client()
        results = []

        # Build lookup for recommender metadata
        rec_meta = {r[0]: (r[1], r[2]) for r in _RECOMMENDERS}

        # Zone-based recommenders
        zones = self._get_zones()
        for zone in zones:
            for rec_id in _ZONE_RECOMMENDERS:
                if rec_id not in rec_meta:
                    continue
                cat, label = rec_meta[rec_id]
                if category and cat != category:
                    continue
                parent = f"projects/{self.project_id}/locations/{zone}/recommenders/{rec_id}"
                self._fetch_recs(client, parent, cat, label, zone, results)

        # Region-based recommenders
        regions = self._get_regions()
        for region in regions:
            for rec_id in _REGION_RECOMMENDERS:
                if rec_id not in rec_meta:
                    continue
                cat, label = rec_meta[rec_id]
                if category and cat != category:
                    continue
                parent = f"projects/{self.project_id}/locations/{region}/recommenders/{rec_id}"
                self._fetch_recs(client, parent, cat, label, region, results)

        # Project-level recommenders
        for rec_id in _PROJECT_RECOMMENDERS:
            if rec_id not in rec_meta:
                continue
            cat, label = rec_meta[rec_id]
            if category and cat != category:
                continue
            parent = f"projects/{self.project_id}/locations/global/recommenders/{rec_id}"
            self._fetch_recs(client, parent, cat, label, "global", results)

        return results

    def _fetch_recs(self, client, parent: str, category: str, label: str,
                    location: str, results: List[dict]) -> None:
        """Fetch recommendations from a single parent path."""
        try:
            response = client.list_recommendations(parent=parent)
            for rec in response:
                normalized = self._normalize(rec, category, label, location)
                if normalized:
                    results.append(normalized)
        except Exception as e:
            err_str = str(e)
            if "NOT_FOUND" in err_str or "PERMISSION_DENIED" in err_str:
                pass  # Normal — recommender not available in this location
            else:
                logger.debug(f"GCP Recommender {parent}: {e}")

    def _normalize(self, rec, category: str, label: str, location: str) -> Optional[dict]:
        """Convert a GCP Recommendation object to our standard dict."""
        try:
            # Priority / Impact
            priority = str(rec.priority) if hasattr(rec, 'priority') else "PRIORITY_UNSPECIFIED"
            # Handle enum
            if hasattr(priority, 'name'):
                priority = priority.name
            impact = PRIORITY_MAP.get(priority, "low")

            # Description
            description = rec.description if hasattr(rec, 'description') else ""

            # Content / operations
            content = rec.content if hasattr(rec, 'content') else None
            operations = []
            if content and hasattr(content, 'operation_groups'):
                for grp in content.operation_groups:
                    for op in grp.operations:
                        operations.append({
                            "action": op.action,
                            "resource_type": op.resource_type,
                            "resource": op.resource,
                        })

            # Extract resource from first operation
            resource_id = ""
            resource_type = ""
            if operations:
                resource_id = operations[0].get("resource", "")
                resource_type = operations[0].get("resource_type", "")

            resource_name = resource_id.split("/")[-1] if resource_id else rec.name.split("/")[-1]

            # Primary impact: cost savings
            savings = 0.0
            if hasattr(rec, 'primary_impact') and rec.primary_impact:
                pi = rec.primary_impact
                if hasattr(pi, 'cost_projection') and pi.cost_projection:
                    cp = pi.cost_projection
                    if hasattr(cp, 'cost') and cp.cost:
                        # cost is negative = savings
                        units = int(cp.cost.units) if cp.cost.units else 0
                        nanos = cp.cost.nanos if cp.cost.nanos else 0
                        monthly = abs(units + nanos / 1e9)
                        savings = round(monthly, 2)

            # State
            state = str(rec.state_info.state) if hasattr(rec, 'state_info') and rec.state_info else "ACTIVE"
            if hasattr(state, 'name'):
                state = state.name
            if state not in ("ACTIVE", "CLAIMED"):
                return None  # Skip dismissed/failed

            return {
                "advisor_id": rec.name,
                "name": f"{label}: {resource_name}",
                "category": category,
                "impact": impact,
                "resource_id": resource_id,
                "resource_name": resource_name,
                "resource_type": resource_type,
                "region": location,
                "problem": description or f"{label} detectado para {resource_name}",
                "solution": f"Ação recomendada: {operations[0].get('action', 'revisar')}" if operations else "",
                "estimated_saving_monthly": savings,
                "extended_properties": {
                    "recommender": rec.recommender_subtype if hasattr(rec, 'recommender_subtype') else "",
                    "priority": priority,
                    "operations_count": len(operations),
                    "state": state,
                },
            }
        except Exception as e:
            logger.debug(f"GCP normalize rec error: {e}")
            return None

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
        }

    def list_cost_as_finops_findings(self) -> List[dict]:
        """Cost-category recommendations in FinOps finding format."""
        cost_recs = self.list_recommendations(category="cost")
        findings = []
        for r in cost_recs:
            findings.append({
                "provider": "gcp",
                "resource_id": r["resource_id"] or f"advisor:{r['name']}",
                "resource_name": r["resource_name"],
                "resource_type": r["resource_type"],
                "region": r["region"],
                "recommendation_type": "advisor_cost",
                "severity": r["impact"],
                "estimated_saving_monthly": r["estimated_saving_monthly"],
                "current_monthly_cost": 0.0,
                "reasoning": f"[GCP Recommender] {r['problem']}",
                "current_spec": r.get("extended_properties"),
                "recommended_spec": {"solution": r["solution"]} if r["solution"] else None,
            })
        return findings
