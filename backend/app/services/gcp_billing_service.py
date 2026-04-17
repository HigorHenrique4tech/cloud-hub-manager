"""
GCP Billing Service — reads real billing data from BigQuery Standard Export.

Requires:
  - google-cloud-bigquery in requirements.txt
  - A billing export table set up in GCP Billing → Export → BigQuery
  - The service account must have roles/bigquery.dataViewer on the dataset
"""
import logging
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class GCPBillingService:
    def __init__(
        self,
        service_account_json: dict,
        project_id: str,
        dataset: str,
        table: str,
        billing_project: Optional[str] = None,
    ):
        self.project_id = project_id
        self.dataset = dataset
        self.table = table
        self.billing_project = billing_project or project_id
        self._client = None
        self._sa_json = service_account_json

    def _get_client(self):
        if self._client is None:
            from google.cloud import bigquery
            from google.oauth2 import service_account
            credentials = service_account.Credentials.from_service_account_info(
                self._sa_json,
                scopes=["https://www.googleapis.com/auth/bigquery.readonly"],
            )
            self._client = bigquery.Client(
                project=self.billing_project,
                credentials=credentials,
            )
        return self._client

    @property
    def _table_ref(self) -> str:
        return f"`{self.billing_project}.{self.dataset}.{self.table}`"

    def test_connection(self) -> dict:
        """Validate that the table exists and has the expected schema."""
        try:
            client = self._get_client()
            query = f"SELECT COUNT(*) AS cnt FROM {self._table_ref} LIMIT 1"
            result = client.query(query).result()
            for row in result:
                return {"success": True, "row_count_sample": row.cnt}
            return {"success": True, "row_count_sample": 0}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    def get_daily_costs(self, start_date: str, end_date: str) -> list:
        """
        Returns daily cost aggregates.
        Each item: {date, total, by_service: [{service, cost}]}
        """
        try:
            client = self._get_client()
            query = f"""
                SELECT
                    DATE(usage_start_time) AS day,
                    service.description AS service,
                    SUM(cost) AS cost
                FROM {self._table_ref}
                WHERE DATE(usage_start_time) BETWEEN @start AND @end
                  AND project.id = @project
                GROUP BY day, service
                ORDER BY day
            """
            job_config = _make_job_config(
                start=start_date, end=end_date, project=self.project_id
            )
            rows = list(client.query(query, job_config=job_config).result())

            # Aggregate into {date: {service: cost}}
            daily_map: dict = {}
            for row in rows:
                day_str = str(row.day)
                svc = row.service or "Other"
                cost = float(row.cost or 0)
                if day_str not in daily_map:
                    daily_map[day_str] = {}
                daily_map[day_str][svc] = daily_map[day_str].get(svc, 0.0) + cost

            result = []
            for day_str in sorted(daily_map.keys()):
                svc_map = daily_map[day_str]
                total = sum(svc_map.values())
                by_service = sorted(
                    [{"service": k, "cost": round(v, 4)} for k, v in svc_map.items()],
                    key=lambda x: -x["cost"],
                )
                result.append({
                    "date": day_str,
                    "total": round(total, 4),
                    "by_service": by_service,
                })
            return result
        except Exception as exc:
            logger.error(f"GCPBillingService.get_daily_costs failed: {exc}")
            return []

    def get_mtd_spend(self) -> float:
        return self._get_period_spend(date.today().replace(day=1).isoformat(), date.today().isoformat())

    def get_qtd_spend(self) -> float:
        today = date.today()
        quarter_month = ((today.month - 1) // 3) * 3 + 1
        start = today.replace(month=quarter_month, day=1)
        return self._get_period_spend(start.isoformat(), today.isoformat())

    def get_ytd_spend(self) -> float:
        today = date.today()
        return self._get_period_spend(today.replace(month=1, day=1).isoformat(), today.isoformat())

    def _get_period_spend(self, start_date: str, end_date: str) -> float:
        try:
            client = self._get_client()
            query = f"""
                SELECT SUM(cost) AS total
                FROM {self._table_ref}
                WHERE DATE(usage_start_time) BETWEEN @start AND @end
                  AND project.id = @project
            """
            job_config = _make_job_config(start=start_date, end=end_date, project=self.project_id)
            for row in client.query(query, job_config=job_config).result():
                return float(row.total or 0)
            return 0.0
        except Exception as exc:
            logger.error(f"GCPBillingService._get_period_spend failed: {exc}")
            return 0.0

    def get_costs_by_label(self, label_key: str, start_date: str, end_date: str) -> dict:
        """
        Returns {label_value: cost} for label-based allocation.
        Uses UNNEST(labels) to expand the labels array in the billing export.
        """
        try:
            client = self._get_client()
            query = f"""
                SELECT
                    label.value AS label_value,
                    SUM(cost) AS cost
                FROM {self._table_ref},
                UNNEST(labels) AS label
                WHERE label.key = @label_key
                  AND DATE(usage_start_time) BETWEEN @start AND @end
                  AND project.id = @project
                GROUP BY label_value
                ORDER BY cost DESC
            """
            from google.cloud import bigquery
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("label_key", "STRING", label_key),
                    bigquery.ScalarQueryParameter("start", "DATE", start_date),
                    bigquery.ScalarQueryParameter("end", "DATE", end_date),
                    bigquery.ScalarQueryParameter("project", "STRING", self.project_id),
                ]
            )
            result = {}
            for row in client.query(query, job_config=job_config).result():
                val = row.label_value or "__untagged__"
                result[val] = result.get(val, 0.0) + float(row.cost or 0)
            return result
        except Exception as exc:
            logger.error(f"GCPBillingService.get_costs_by_label failed: {exc}")
            return {}


def _make_job_config(start: str, end: str, project: str):
    from google.cloud import bigquery
    return bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("start", "DATE", start),
            bigquery.ScalarQueryParameter("end", "DATE", end),
            bigquery.ScalarQueryParameter("project", "STRING", project),
        ]
    )


def build_from_account(account, creds: dict) -> Optional["GCPBillingService"]:
    """
    Build a GCPBillingService from a CloudAccount ORM row + decrypted creds.
    Returns None if billing export is not configured.
    """
    if not getattr(account, "billing_export_enabled", False):
        return None
    dataset = getattr(account, "bigquery_dataset", None)
    table = getattr(account, "bigquery_table", None)
    if not dataset or not table:
        return None

    # Build service account JSON from stored credentials
    sa_json = {
        "type": "service_account",
        "project_id": creds.get("project_id", ""),
        "private_key_id": creds.get("private_key_id", ""),
        "private_key": creds.get("private_key", ""),
        "client_email": creds.get("client_email", ""),
        "client_id": creds.get("client_id", ""),
        "token_uri": "https://oauth2.googleapis.com/token",
    }

    bq_project = getattr(account, "bigquery_project", None) or creds.get("project_id", "")

    return GCPBillingService(
        service_account_json=sa_json,
        project_id=creds.get("project_id", ""),
        dataset=dataset,
        table=table,
        billing_project=bq_project,
    )
