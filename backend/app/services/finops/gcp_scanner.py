"""
GCP FinOps Scanner — waste detection for GCP resources.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from statistics import mean

from .constants import (
    CPU_IDLE_PCT, CPU_UNDERUTIL_PCT, CPU_WINDOW_DAYS,
    DISK_ORPHAN_DAYS, SAVING_RIGHT_SIZE, SAVING_STOP,
    GCE_COST_MAP,
)
from .utils import _severity

logger = logging.getLogger(__name__)


class GCPFinOpsScanner:
    """
    Scans a GCP project for waste.
    Uses the same credentials as GCPService (service account JSON fields).
    """

    def __init__(self, project_id: str, client_email: str, private_key: str, private_key_id: str):
        self.project_id = project_id
        self._info = {
            "type": "service_account",
            "project_id": project_id,
            "client_email": client_email,
            "private_key": private_key.replace("\\n", "\n"),
            "private_key_id": private_key_id,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        from google.oauth2 import service_account
        self.credentials = service_account.Credentials.from_service_account_info(
            self._info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )

    def _instances_client(self):
        from google.cloud import compute_v1
        return compute_v1.InstancesClient(credentials=self.credentials)

    def _disks_client(self):
        from google.cloud import compute_v1
        return compute_v1.DisksClient(credentials=self.credentials)

    def _addresses_client(self):
        from google.cloud import compute_v1
        return compute_v1.AddressesClient(credentials=self.credentials)

    def _get_instance_avg_cpu(self, instance_id: str, days: int = CPU_WINDOW_DAYS) -> Optional[float]:
        """Returns average CPU utilization (0-100%) over last `days` days via Cloud Monitoring."""
        try:
            import time
            from google.cloud import monitoring_v3
            client = monitoring_v3.MetricServiceClient(credentials=self.credentials)
            now = time.time()
            interval = monitoring_v3.TimeInterval(
                {
                    "end_time": {"seconds": int(now)},
                    "start_time": {"seconds": int(now) - days * 86400},
                }
            )
            results = client.list_time_series(
                request={
                    "name": f"projects/{self.project_id}",
                    "filter": (
                        'metric.type="compute.googleapis.com/instance/cpu/utilization" '
                        f'AND resource.labels.instance_id="{instance_id}"'
                    ),
                    "interval": interval,
                    "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL,
                }
            )
            values = []
            for series in results:
                for point in series.points:
                    values.append(point.value.double_value * 100)  # 0-1 -> 0-100
            return mean(values) if values else None
        except Exception as e:
            logger.debug(f"GCP Monitoring CPU error (instance {instance_id}): {e}")
            return None

    def _estimate_gce_monthly_cost(self, machine_type: str) -> float:
        """Rough on-demand cost estimate in USD/month."""
        mt = machine_type.split("/")[-1] if "/" in machine_type else machine_type
        if mt in GCE_COST_MAP:
            return GCE_COST_MAP[mt]
        # Fallback: extract vCPU count from type name (e.g. n1-standard-4 -> 4)
        try:
            cpus = int(mt.split("-")[-1])
            return round(cpus * 24.27, 2)
        except Exception:
            return 24.27

    # ── Compute Engine idle ──────────────────────────────────────────────────

    def scan_compute_idle(self) -> List[dict]:
        findings = []
        try:
            client = self._instances_client()
            for zone_name, zone_data in client.aggregated_list(project=self.project_id):
                if not zone_data.instances:
                    continue
                zone = zone_name.replace("zones/", "")
                for inst in zone_data.instances:
                    if inst.status != "RUNNING":
                        continue
                    machine_type = inst.machine_type.split("/")[-1] if inst.machine_type else "unknown"
                    avg_cpu = self._get_instance_avg_cpu(str(inst.id))
                    if avg_cpu is None or avg_cpu >= CPU_IDLE_PCT:
                        continue

                    current_cost = self._estimate_gce_monthly_cost(machine_type)
                    saving = round(current_cost * SAVING_STOP, 2)

                    findings.append({
                        "provider": "gcp",
                        "resource_id": inst.name,
                        "resource_name": inst.name,
                        "resource_type": "compute_instance",
                        "region": zone,
                        "recommendation_type": "stop",
                        "severity": _severity(saving),
                        "estimated_saving_monthly": saving,
                        "current_monthly_cost": current_cost,
                        "reasoning": f"CPU médio de {avg_cpu:.1f}% nos últimos {CPU_WINDOW_DAYS} dias (limite: {CPU_IDLE_PCT}%)",
                        "current_spec": {"machine_type": machine_type, "zone": zone},
                        "recommended_spec": {"action": "stop"},
                    })
        except Exception as e:
            logger.warning(f"GCP compute idle scan error: {e}")
        return findings

    # ── Persistent Disk orphan ───────────────────────────────────────────────

    def scan_persistent_disks(self) -> List[dict]:
        findings = []
        try:
            client = self._disks_client()
            cutoff = datetime.utcnow() - timedelta(days=DISK_ORPHAN_DAYS)
            for zone_name, zone_data in client.aggregated_list(project=self.project_id):
                if not zone_data.disks:
                    continue
                for disk in zone_data.disks:
                    if disk.users:
                        continue  # disk is in use
                    try:
                        created = datetime.fromisoformat(
                            disk.creation_timestamp.replace("Z", "+00:00")
                        ).replace(tzinfo=None)
                        if created > cutoff:
                            continue
                    except Exception:
                        pass

                    zone = zone_name.replace("zones/", "")
                    size_gb = disk.size_gb or 0
                    disk_type = disk.type_.split("/")[-1] if disk.type_ else "pd-standard"
                    # pd-ssd ≈ $0.17/GB/mo, pd-standard ≈ $0.04/GB/mo, pd-balanced ≈ $0.10/GB/mo
                    if "ssd" in disk_type.lower():
                        price = 0.17
                    elif "balanced" in disk_type.lower():
                        price = 0.10
                    else:
                        price = 0.04
                    cost = round(size_gb * price, 2)
                    if cost < 0.5:
                        continue

                    findings.append({
                        "provider": "gcp",
                        "resource_id": disk.name,
                        "resource_name": disk.name,
                        "resource_type": "persistent_disk",
                        "region": zone,
                        "recommendation_type": "delete",
                        "severity": _severity(cost),
                        "estimated_saving_monthly": cost,
                        "current_monthly_cost": cost,
                        "reasoning": f"Disco persistente de {size_gb} GB ({disk_type}) sem instância associada há mais de {DISK_ORPHAN_DAYS} dias",
                        "current_spec": {"size_gb": size_gb, "disk_type": disk_type, "zone": zone},
                        "recommended_spec": None,
                    })
        except Exception as e:
            logger.warning(f"GCP persistent disk scan error: {e}")
        return findings

    # ── Static IPs unused ────────────────────────────────────────────────────

    def scan_static_ips(self) -> List[dict]:
        findings = []
        try:
            client = self._addresses_client()
            for region_name, region_data in client.aggregated_list(project=self.project_id):
                if not region_data.addresses:
                    continue
                for addr in region_data.addresses:
                    # RESERVED = allocated but not attached to any resource
                    if addr.status != "RESERVED":
                        continue
                    if addr.users:
                        continue
                    region = region_name.replace("regions/", "")
                    # GCP static external IP ≈ $0.01/hr unused = ~$7.30/month
                    cost = 7.30

                    findings.append({
                        "provider": "gcp",
                        "resource_id": addr.name,
                        "resource_name": addr.address or addr.name,
                        "resource_type": "static_ip",
                        "region": region,
                        "recommendation_type": "delete",
                        "severity": _severity(cost),
                        "estimated_saving_monthly": cost,
                        "current_monthly_cost": cost,
                        "reasoning": f"IP estático {addr.address or addr.name} reservado mas não associado a nenhum recurso GCP",
                        "current_spec": {"ip_address": addr.address, "region": region},
                        "recommended_spec": None,
                    })
        except Exception as e:
            logger.warning(f"GCP static IP scan error: {e}")
        return findings

    # ── Always-on dev/test resources ─────────────────────────────────────────

    _DEV_KEYWORDS = {"dev", "test", "staging", "hml", "sandbox", "homolog", "qa"}

    def _is_dev_resource(self, name: str, labels: dict) -> bool:
        name_lower = (name or "").lower()
        if any(kw in name_lower for kw in self._DEV_KEYWORDS):
            return True
        env_label = (labels or {}).get("environment") or (labels or {}).get("env", "")
        return (env_label or "").lower() in self._DEV_KEYWORDS

    def scan_always_on(self) -> List[dict]:
        """Detect running GCE instances that appear to be dev/test but run 24/7."""
        findings = []
        try:
            client = self._instances_client()
            for zone_name, zone_data in client.aggregated_list(project=self.project_id):
                if not zone_data.instances:
                    continue
                zone = zone_name.replace("zones/", "")
                for inst in zone_data.instances:
                    if inst.status != "RUNNING":
                        continue
                    labels = dict(inst.labels) if inst.labels else {}
                    if not self._is_dev_resource(inst.name, labels):
                        continue

                    machine_type = inst.machine_type.split("/")[-1] if inst.machine_type else "unknown"
                    current_cost = self._estimate_gce_monthly_cost(machine_type)
                    saving = round(current_cost * 0.54, 2)

                    findings.append({
                        "provider": "gcp",
                        "resource_id": inst.name,
                        "resource_name": inst.name,
                        "resource_type": "compute_instance",
                        "region": zone,
                        "recommendation_type": "schedule",
                        "severity": "medium",
                        "estimated_saving_monthly": saving,
                        "current_monthly_cost": current_cost,
                        "reasoning": (
                            f"Instância GCE de desenvolvimento '{inst.name}' rodando 24/7. "
                            f"Agendar desligamento fora do horário comercial (Seg–Sex 08:00–19:00) "
                            f"pode economizar ~54% do custo mensal (${saving:.2f}/mês)."
                        ),
                        "current_spec": {"machine_type": machine_type, "zone": zone},
                        "recommended_spec": {
                            "suggested_start": "08:00",
                            "suggested_stop": "19:00",
                            "timezone": "America/Sao_Paulo",
                            "schedule_type": "weekdays",
                        },
                    })
        except Exception as e:
            logger.warning(f"GCP always-on scan error: {e}")
        return findings

    def scan_billing_recommender(self) -> List[dict]:
        """
        Queries GCP Recommender API for native cost optimization insights
        (google.billing.ProjectCostInsights). Requires 'recommender.googleapis.com'
        to be enabled and 'roles/recommender.viewer' on the service account.
        Fails silently if the API is not enabled or permissions are insufficient.
        """
        findings = []
        try:
            from googleapiclient.discovery import build

            service = build("recommender", "v1", credentials=self.credentials)
            parent  = (
                f"projects/{self.project_id}/locations/global/"
                "recommenders/google.billing.ProjectCostInsights"
            )
            resp = (
                service.projects()
                .locations()
                .recommenders()
                .recommendations()
                .list(parent=parent)
                .execute()
            )

            TYPE_MAP = {
                "STOP_VM":                  "stop_vm",
                "CHANGE_MACHINE_TYPE":      "right_size",
                "SNAPSHOT_AND_DELETE_DISK": "delete_disk",
                "CHANGE_STORAGE_CLASS":     "storage_class",
                "OPTIMIZE_VM":              "right_size",
            }

            for rec in resp.get("recommendations", []):
                if rec.get("stateInfo", {}).get("state") != "ACTIVE":
                    continue

                # Extract estimated monthly saving (negative units = savings)
                impact   = rec.get("primaryImpact", {}).get("costProjection", {})
                cost_obj = impact.get("cost", {})
                units    = float(cost_obj.get("units", 0) or 0)
                nanos    = float(cost_obj.get("nanos", 0) or 0)
                saving_monthly = abs(units + nanos / 1e9)

                subtype  = rec.get("recommenderSubtype", "")
                rec_type = TYPE_MAP.get(subtype, "review_spend")
                severity = "high" if saving_monthly > 100 else "medium" if saving_monthly > 20 else "low"

                name_parts  = rec.get("name", "").split("/")
                resource_id = name_parts[-1] if name_parts else "unknown"
                description = rec.get("description", resource_id)

                findings.append({
                    "provider":                 "gcp",
                    "resource_id":              resource_id,
                    "resource_name":            description[:120],
                    "resource_type":            "gcp_resource",
                    "recommendation_type":      rec_type,
                    "severity":                 severity,
                    "estimated_saving_monthly": round(saving_monthly, 2),
                    "description":              description,
                    "spec_before": {"recommender_subtype": subtype},
                    "spec_after":  {},
                    "rollback_data": {},
                })
        except Exception as e:
            logger.warning(f"GCP billing recommender scan error: {e}")

        return findings

    def scan_gce_rightsizing(self) -> List[dict]:
        """Detects GCE instances with 5-20% CPU (subutilized, not idle) and suggests a smaller type."""
        findings = []
        try:
            client = self._instances_client()
            for zone_name, zone_data in client.aggregated_list(project=self.project_id):
                if not zone_data.instances:
                    continue
                zone = zone_name.replace("zones/", "")
                for inst in zone_data.instances:
                    if inst.status != "RUNNING":
                        continue
                    machine_type = inst.machine_type.split("/")[-1] if inst.machine_type else "unknown"
                    avg_cpu = self._get_instance_avg_cpu(str(inst.id))
                    if avg_cpu is None or avg_cpu < CPU_IDLE_PCT or avg_cpu >= CPU_UNDERUTIL_PCT:
                        continue

                    current_cost = self._estimate_gce_monthly_cost(machine_type)
                    # Suggest half the vCPUs in the same family
                    try:
                        parts = machine_type.split("-")
                        current_vcpu = int(parts[-1])
                        half_vcpu = current_vcpu // 2
                        if half_vcpu >= 1:
                            rec_type = "-".join(parts[:-1] + [str(half_vcpu)])
                            rec_cost = self._estimate_gce_monthly_cost(rec_type)
                            saving   = max(0.0, current_cost - rec_cost)
                        else:
                            rec_type = "menor tipo da mesma família"
                            saving   = current_cost * SAVING_RIGHT_SIZE
                    except Exception:
                        rec_type = "menor tipo da mesma família"
                        saving   = current_cost * SAVING_RIGHT_SIZE

                    findings.append({
                        "provider": "gcp",
                        "resource_id": inst.name,
                        "resource_name": inst.name,
                        "resource_type": "compute_instance",
                        "region": zone,
                        "recommendation_type": "rightsizing",
                        "severity": _severity(saving),
                        "estimated_saving_monthly": round(saving, 2),
                        "current_monthly_cost": current_cost,
                        "reasoning": (
                            f"CPU médio de {avg_cpu:.1f}% nos últimos {CPU_WINDOW_DAYS} dias. "
                            f"Instância subutilizada — considere reduzir para '{rec_type}'."
                        ),
                        "current_spec": {"machine_type": machine_type, "zone": zone},
                        "recommended_spec": {"machine_type": rec_type},
                    })
        except Exception as e:
            logger.warning(f"GCP GCE rightsizing scan error: {e}")
        return findings

    def scan_recommender_cost(self) -> List[dict]:
        """Fetch Cost recommendations from GCP Recommender API."""
        try:
            from app.services.gcp_recommender_service import GCPRecommenderService
            recommender = GCPRecommenderService(
                project_id=self.project_id,
                client_email=self._info.get("client_email", ""),
                private_key=self._info.get("private_key", ""),
                private_key_id=self._info.get("private_key_id", ""),
            )
            return recommender.list_cost_as_finops_findings()
        except Exception as e:
            logger.warning(f"GCP Recommender cost scan error: {e}")
            return []

    def scan_all(self) -> List[dict]:
        findings = []
        findings.extend(self.scan_compute_idle())
        findings.extend(self.scan_gce_rightsizing())
        findings.extend(self.scan_persistent_disks())
        findings.extend(self.scan_static_ips())
        findings.extend(self.scan_always_on())
        findings.extend(self.scan_billing_recommender())
        findings.extend(self.scan_recommender_cost())
        return findings
