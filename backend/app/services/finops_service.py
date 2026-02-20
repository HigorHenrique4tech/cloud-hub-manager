"""
FinOps Service — Waste detection, recommendations, and actionable savings.

Detection rules are purely code-based (no ML yet). Each rule produces a
FinOpsRecommendation row with enough context to:
  1. Explain the waste to the user (reasoning)
  2. Execute the corrective action (apply_recommendation)
  3. Reverse it (rollback_data)
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from statistics import mean, stdev

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────

CPU_IDLE_PCT       = 5.0    # % — below this = idle
CPU_WINDOW_DAYS    = 7      # days of CloudWatch data
DB_CONNECTIONS_MIN = 5      # avg connections/day below this = idle
DISK_ORPHAN_DAYS   = 7      # days unattached before flagging
IP_UNUSED_DAYS     = 3      # days without association
SNAPSHOT_AGE_DAYS  = 90     # snapshots older than this
LAMBDA_WINDOW_DAYS = 30     # no invocations in this window

# Savings multipliers (fraction of monthly cost saved)
SAVING_RIGHT_SIZE  = 0.50   # right-sizing saves ~50%
SAVING_DELETE      = 1.00   # delete saves 100%
SAVING_STOP        = 0.90   # stop saves ~90% (storage still runs)

# ── Instance family pricing ratios (relative — real pricing varies) ───────────

EC2_FAMILY_RATIO = {
    "nano": 0.25, "micro": 0.5, "small": 1.0, "medium": 2.0,
    "large": 4.0, "xlarge": 8.0, "2xlarge": 16.0, "4xlarge": 32.0,
    "8xlarge": 64.0, "12xlarge": 96.0, "16xlarge": 128.0, "24xlarge": 192.0,
}

AZURE_VM_FAMILY_RATIO = {
    "Standard_B1s": 1.0, "Standard_B1ms": 2.0, "Standard_B2s": 4.0,
    "Standard_B2ms": 8.0, "Standard_D2s_v3": 12.0, "Standard_D4s_v3": 24.0,
    "Standard_D2_v3": 10.0, "Standard_D4_v3": 20.0,
}


def _severity(saving: float) -> str:
    if saving >= 50:
        return "high"
    if saving >= 10:
        return "medium"
    return "low"


def _right_size_saving(current_type: str, current_cost: float) -> tuple[float, str]:
    """
    Returns (estimated_monthly_saving, recommended_type).
    Tries to downgrade one size within the same family.
    """
    parts = current_type.split(".")
    if len(parts) == 2:
        family, size = parts
        sizes = list(EC2_FAMILY_RATIO.keys())
        current_idx = next((i for i, s in enumerate(sizes) if s == size), None)
        if current_idx and current_idx > 0:
            rec_size = sizes[current_idx - 1]
            ratio = EC2_FAMILY_RATIO[rec_size] / EC2_FAMILY_RATIO[size]
            saving = current_cost * (1 - ratio)
            return saving, f"{family}.{rec_size}"
    # fallback: estimate 50% saving with no specific recommendation
    return current_cost * SAVING_RIGHT_SIZE, "menor instância da mesma família"


# ═══════════════════════════════════════════════════════════════════════════════
# AWS Waste Detection
# ═══════════════════════════════════════════════════════════════════════════════

class AWSFinOpsScanner:
    """
    Scans an AWS account for waste. Requires the same credentials as AWSService.
    Returns a list of finding dicts (pre-processed into FinOpsRecommendation fields).
    """

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

    def _cloudwatch_avg(self, namespace: str, metric: str, dimensions: list,
                        days: int = CPU_WINDOW_DAYS) -> Optional[float]:
        """Returns average metric value over the last `days` days, or None on error."""
        try:
            cw = self._client("cloudwatch")
            end = datetime.utcnow()
            start = end - timedelta(days=days)
            resp = cw.get_metric_statistics(
                Namespace=namespace,
                MetricName=metric,
                Dimensions=dimensions,
                StartTime=start,
                EndTime=end,
                Period=86400,
                Statistics=["Average"],
            )
            datapoints = resp.get("Datapoints", [])
            if not datapoints:
                return None
            return mean(dp["Average"] for dp in datapoints)
        except Exception as e:
            logger.debug(f"CloudWatch error ({metric}): {e}")
            return None

    def _estimate_ec2_monthly_cost(self, instance_type: str) -> float:
        """Very rough on-demand price estimate in USD/month."""
        # Base cost for t3.micro ≈ $8.5/month. Scale by family ratio.
        parts = instance_type.split(".")
        if len(parts) == 2:
            size = parts[1]
            ratio = EC2_FAMILY_RATIO.get(size, 4.0)
            return round(8.5 * (ratio / 1.0), 2)
        return 20.0

    # ── EC2 idle ────────────────────────────────────────────────────────────

    def scan_ec2_idle(self) -> List[dict]:
        findings = []
        try:
            ec2 = self._client("ec2")
            resp = ec2.describe_instances(
                Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
            )
            for r in resp.get("Reservations", []):
                for i in r.get("Instances", []):
                    instance_id = i["InstanceId"]
                    instance_type = i.get("InstanceType", "unknown")
                    name = next((t["Value"] for t in (i.get("Tags") or []) if t["Key"] == "Name"), instance_id)
                    az = i.get("Placement", {}).get("AvailabilityZone", self.region)

                    avg_cpu = self._cloudwatch_avg(
                        "AWS/EC2", "CPUUtilization",
                        [{"Name": "InstanceId", "Value": instance_id}],
                    )
                    if avg_cpu is None or avg_cpu >= CPU_IDLE_PCT:
                        continue

                    current_cost = self._estimate_ec2_monthly_cost(instance_type)
                    saving, rec_type = _right_size_saving(instance_type, current_cost)

                    findings.append({
                        "provider": "aws",
                        "resource_id": instance_id,
                        "resource_name": name,
                        "resource_type": "ec2",
                        "region": az,
                        "recommendation_type": "right_size",
                        "severity": _severity(saving),
                        "estimated_saving_monthly": round(saving, 2),
                        "current_monthly_cost": current_cost,
                        "reasoning": f"CPU médio de {avg_cpu:.1f}% nos últimos {CPU_WINDOW_DAYS} dias (limite: {CPU_IDLE_PCT}%)",
                        "current_spec": {"instance_type": instance_type},
                        "recommended_spec": {"instance_type": rec_type},
                    })
        except ClientError as e:
            logger.warning(f"EC2 idle scan error: {e}")
        return findings

    # ── EBS orphan ───────────────────────────────────────────────────────────

    def scan_ebs_orphan(self) -> List[dict]:
        findings = []
        try:
            ec2 = self._client("ec2")
            resp = ec2.describe_volumes(
                Filters=[{"Name": "status", "Values": ["available"]}]
            )
            cutoff = datetime.utcnow() - timedelta(days=DISK_ORPHAN_DAYS)
            for vol in resp.get("Volumes", []):
                create_time = vol.get("CreateTime")
                if create_time and create_time.replace(tzinfo=None) > cutoff:
                    continue
                vol_id = vol["VolumeId"]
                name = next((t["Value"] for t in (vol.get("Tags") or []) if t["Key"] == "Name"), vol_id)
                size_gb = vol.get("Size", 0)
                vol_type = vol.get("VolumeType", "gp2")
                # gp3/gp2 ≈ $0.08/GB/mo, io1 ≈ $0.125/GB/mo
                price_per_gb = 0.125 if vol_type == "io1" else 0.08
                cost = round(size_gb * price_per_gb, 2)

                findings.append({
                    "provider": "aws",
                    "resource_id": vol_id,
                    "resource_name": name,
                    "resource_type": "ebs",
                    "region": vol.get("AvailabilityZone", self.region),
                    "recommendation_type": "delete",
                    "severity": _severity(cost),
                    "estimated_saving_monthly": cost,
                    "current_monthly_cost": cost,
                    "reasoning": f"Volume EBS de {size_gb} GB ({vol_type}) desanexado há mais de {DISK_ORPHAN_DAYS} dias",
                    "current_spec": {"size_gb": size_gb, "volume_type": vol_type, "volume_id": vol_id},
                    "recommended_spec": None,
                })
        except ClientError as e:
            logger.warning(f"EBS orphan scan error: {e}")
        return findings

    # ── Elastic IP unused ────────────────────────────────────────────────────

    def scan_elastic_ips(self) -> List[dict]:
        findings = []
        try:
            ec2 = self._client("ec2")
            resp = ec2.describe_addresses()
            for addr in resp.get("Addresses", []):
                # Only flag if not associated with any instance or network interface
                if addr.get("InstanceId") or addr.get("NetworkInterfaceId"):
                    continue
                alloc_id = addr.get("AllocationId", "unknown")
                public_ip = addr.get("PublicIp", "unknown")
                # AWS charges ~$0.005/hr for unused EIPs = ~$3.60/month
                cost = 3.60

                findings.append({
                    "provider": "aws",
                    "resource_id": alloc_id,
                    "resource_name": public_ip,
                    "resource_type": "elastic_ip",
                    "region": self.region,
                    "recommendation_type": "delete",
                    "severity": _severity(cost),
                    "estimated_saving_monthly": cost,
                    "current_monthly_cost": cost,
                    "reasoning": f"IP elástico {public_ip} sem associação (nenhuma instância ou interface de rede)",
                    "current_spec": {"allocation_id": alloc_id, "public_ip": public_ip},
                    "recommended_spec": None,
                })
        except ClientError as e:
            logger.warning(f"Elastic IP scan error: {e}")
        return findings

    # ── RDS idle ─────────────────────────────────────────────────────────────

    def scan_rds_idle(self) -> List[dict]:
        findings = []
        try:
            rds = self._client("rds")
            resp = rds.describe_db_instances()
            for db in resp.get("DBInstances", []):
                if db.get("DBInstanceStatus") != "available":
                    continue
                db_id = db["DBInstanceIdentifier"]
                db_class = db.get("DBInstanceClass", "db.t3.micro")

                avg_conn = self._cloudwatch_avg(
                    "AWS/RDS", "DatabaseConnections",
                    [{"Name": "DBInstanceIdentifier", "Value": db_id}],
                )
                if avg_conn is None or avg_conn >= DB_CONNECTIONS_MIN:
                    continue

                # Rough RDS cost: db.t3.micro ≈ $15/mo, scale proportionally
                size_map = {
                    "micro": 15, "small": 30, "medium": 60, "large": 120,
                    "xlarge": 240, "2xlarge": 480, "4xlarge": 960,
                }
                size_part = db_class.split(".")[-1] if "." in db_class else "small"
                cost = size_map.get(size_part, 60)
                saving = cost * SAVING_STOP

                findings.append({
                    "provider": "aws",
                    "resource_id": db_id,
                    "resource_name": db_id,
                    "resource_type": "rds",
                    "region": db.get("AvailabilityZone", self.region),
                    "recommendation_type": "stop",
                    "severity": _severity(saving),
                    "estimated_saving_monthly": round(saving, 2),
                    "current_monthly_cost": cost,
                    "reasoning": f"Banco RDS '{db_id}' com média de {avg_conn:.1f} conexões/dia nos últimos {CPU_WINDOW_DAYS} dias (limite: {DB_CONNECTIONS_MIN})",
                    "current_spec": {"db_instance_class": db_class},
                    "recommended_spec": {"action": "stop"},
                })
        except ClientError as e:
            logger.warning(f"RDS idle scan error: {e}")
        return findings

    # ── Snapshots antigos ────────────────────────────────────────────────────

    def scan_old_snapshots(self) -> List[dict]:
        findings = []
        try:
            ec2 = self._client("ec2")
            resp = ec2.describe_snapshots(OwnerIds=["self"])
            cutoff = datetime.utcnow() - timedelta(days=SNAPSHOT_AGE_DAYS)
            for snap in resp.get("Snapshots", []):
                start_time = snap.get("StartTime")
                if start_time and start_time.replace(tzinfo=None) > cutoff:
                    continue
                snap_id = snap["SnapshotId"]
                name = next((t["Value"] for t in (snap.get("Tags") or []) if t["Key"] == "Name"), snap_id)
                vol_size = snap.get("VolumeSize", 0)
                # EBS snapshot ≈ $0.05/GB/mo
                cost = round(vol_size * 0.05, 2)
                if cost < 1.0:
                    continue  # skip tiny snapshots

                age_days = (datetime.utcnow() - start_time.replace(tzinfo=None)).days

                findings.append({
                    "provider": "aws",
                    "resource_id": snap_id,
                    "resource_name": name,
                    "resource_type": "snapshot",
                    "region": self.region,
                    "recommendation_type": "delete",
                    "severity": _severity(cost),
                    "estimated_saving_monthly": cost,
                    "current_monthly_cost": cost,
                    "reasoning": f"Snapshot de {vol_size} GB criado há {age_days} dias (limite: {SNAPSHOT_AGE_DAYS} dias)",
                    "current_spec": {"snapshot_id": snap_id, "size_gb": vol_size, "age_days": age_days},
                    "recommended_spec": None,
                })
        except ClientError as e:
            logger.warning(f"Snapshot scan error: {e}")
        return findings

    def scan_all(self) -> List[dict]:
        findings = []
        findings.extend(self.scan_ec2_idle())
        findings.extend(self.scan_ebs_orphan())
        findings.extend(self.scan_elastic_ips())
        findings.extend(self.scan_rds_idle())
        findings.extend(self.scan_old_snapshots())
        return findings


# ═══════════════════════════════════════════════════════════════════════════════
# Azure Waste Detection
# ═══════════════════════════════════════════════════════════════════════════════

class AzureFinOpsScanner:
    """
    Scans an Azure subscription for waste.
    Uses the same credentials as AzureService.
    """

    def __init__(self, subscription_id: str, tenant_id: str, client_id: str, client_secret: str):
        self.subscription_id = subscription_id
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._credential = None
        self._compute_client = None
        self._network_client = None
        self._monitor_client = None

    def _get_credential(self):
        if not self._credential:
            from azure.identity import ClientSecretCredential
            self._credential = ClientSecretCredential(
                tenant_id=self.tenant_id,
                client_id=self.client_id,
                client_secret=self.client_secret,
            )
        return self._credential

    def _compute(self):
        if not self._compute_client:
            from azure.mgmt.compute import ComputeManagementClient
            self._compute_client = ComputeManagementClient(self._get_credential(), self.subscription_id)
        return self._compute_client

    def _network(self):
        if not self._network_client:
            from azure.mgmt.network import NetworkManagementClient
            self._network_client = NetworkManagementClient(self._get_credential(), self.subscription_id)
        return self._network_client

    def _monitor(self):
        if not self._monitor_client:
            from azure.mgmt.monitor import MonitorManagementClient
            self._monitor_client = MonitorManagementClient(self._get_credential(), self.subscription_id)
        return self._monitor_client

    def _azure_monitor_avg(self, resource_id: str, metric: str, days: int = CPU_WINDOW_DAYS) -> Optional[float]:
        """Average metric value over last `days` days via Azure Monitor."""
        try:
            monitor = self._monitor()
            end = datetime.utcnow()
            start = end - timedelta(days=days)
            metrics = monitor.metrics.list(
                resource_id,
                timespan=f"{start.isoformat()}/{end.isoformat()}",
                interval="P1D",
                metricnames=metric,
                aggregation="Average",
            )
            values = []
            for m in metrics.value:
                for ts in m.timeseries:
                    for dp in ts.data:
                        if dp.average is not None:
                            values.append(dp.average)
            return mean(values) if values else None
        except Exception as e:
            logger.debug(f"Azure Monitor error ({metric}): {e}")
            return None

    def _estimate_vm_monthly_cost(self, vm_size: str) -> float:
        """Rough estimate in USD/month based on VM size."""
        return AZURE_VM_FAMILY_RATIO.get(vm_size, 20.0) * 8.5

    # ── VM idle ──────────────────────────────────────────────────────────────

    def scan_vm_idle(self) -> List[dict]:
        findings = []
        try:
            compute = self._compute()
            for vm in compute.virtual_machines.list_all():
                try:
                    instance_view = compute.virtual_machines.instance_view(
                        vm.id.split("/")[4],  # resource_group
                        vm.name,
                    )
                    statuses = [s.code for s in (instance_view.statuses or [])]
                    if "PowerState/running" not in statuses:
                        continue  # skip stopped VMs
                except Exception:
                    continue

                vm_size = vm.hardware_profile.vm_size if vm.hardware_profile else "unknown"
                resource_id = vm.id
                resource_group = vm.id.split("/")[4]

                avg_cpu = self._azure_monitor_avg(resource_id, "Percentage CPU")
                if avg_cpu is None or avg_cpu >= CPU_IDLE_PCT:
                    continue

                current_cost = self._estimate_vm_monthly_cost(vm_size)
                saving = current_cost * SAVING_RIGHT_SIZE

                findings.append({
                    "provider": "azure",
                    "resource_id": resource_id,
                    "resource_name": vm.name,
                    "resource_type": "vm",
                    "region": vm.location,
                    "recommendation_type": "right_size",
                    "severity": _severity(saving),
                    "estimated_saving_monthly": round(saving, 2),
                    "current_monthly_cost": current_cost,
                    "reasoning": f"CPU médio de {avg_cpu:.1f}% nos últimos {CPU_WINDOW_DAYS} dias (limite: {CPU_IDLE_PCT}%)",
                    "current_spec": {"vm_size": vm_size, "resource_group": resource_group},
                    "recommended_spec": {"action": "resize_down"},
                })
        except Exception as e:
            logger.warning(f"Azure VM idle scan error: {e}")
        return findings

    # ── Managed Disk unattached ──────────────────────────────────────────────

    def scan_managed_disks(self) -> List[dict]:
        findings = []
        try:
            compute = self._compute()
            cutoff = datetime.utcnow() - timedelta(days=DISK_ORPHAN_DAYS)
            for disk in compute.disks.list():
                if disk.disk_state != "Unattached":
                    continue
                if disk.time_created and disk.time_created.replace(tzinfo=None) > cutoff:
                    continue
                resource_group = disk.id.split("/")[4]
                size_gb = disk.disk_size_gb or 0
                # Standard LRS ≈ $0.04/GB/mo, Premium ≈ $0.12/GB/mo
                sku = disk.sku.name if disk.sku else "Standard_LRS"
                price = 0.12 if "Premium" in sku else 0.04
                cost = round(size_gb * price, 2)
                if cost < 0.5:
                    continue

                findings.append({
                    "provider": "azure",
                    "resource_id": disk.id,
                    "resource_name": disk.name,
                    "resource_type": "managed_disk",
                    "region": disk.location,
                    "recommendation_type": "delete",
                    "severity": _severity(cost),
                    "estimated_saving_monthly": cost,
                    "current_monthly_cost": cost,
                    "reasoning": f"Disco gerenciado de {size_gb} GB ({sku}) não associado a nenhuma VM há mais de {DISK_ORPHAN_DAYS} dias",
                    "current_spec": {"size_gb": size_gb, "sku": sku, "resource_group": resource_group},
                    "recommended_spec": None,
                })
        except Exception as e:
            logger.warning(f"Azure disk scan error: {e}")
        return findings

    # ── Public IP unused ─────────────────────────────────────────────────────

    def scan_public_ips(self) -> List[dict]:
        findings = []
        try:
            network = self._network()
            for ip in network.public_ip_addresses.list_all():
                if ip.ip_configuration is not None:
                    continue  # associated with something
                resource_group = ip.id.split("/")[4]
                # Basic static IP ≈ $3.65/mo
                cost = 3.65

                findings.append({
                    "provider": "azure",
                    "resource_id": ip.id,
                    "resource_name": ip.name,
                    "resource_type": "public_ip",
                    "region": ip.location,
                    "recommendation_type": "delete",
                    "severity": _severity(cost),
                    "estimated_saving_monthly": cost,
                    "current_monthly_cost": cost,
                    "reasoning": f"IP público '{ip.name}' sem associação (nenhum load balancer, VM ou gateway)",
                    "current_spec": {"resource_group": resource_group, "ip_address": ip.ip_address},
                    "recommended_spec": None,
                })
        except Exception as e:
            logger.warning(f"Azure public IP scan error: {e}")
        return findings

    def scan_all(self) -> List[dict]:
        findings = []
        findings.extend(self.scan_vm_idle())
        findings.extend(self.scan_managed_disks())
        findings.extend(self.scan_public_ips())
        return findings


# ═══════════════════════════════════════════════════════════════════════════════
# Anomaly Detection (cost spikes)
# ═══════════════════════════════════════════════════════════════════════════════

def detect_cost_anomalies(daily_costs: List[float], service_name: str, provider: str) -> Optional[dict]:
    """
    Given a time-ordered list of daily costs for a service, detect if the last
    2 days show a statistically significant spike (> baseline + 3σ).

    Returns anomaly dict or None.
    """
    if len(daily_costs) < 5:
        return None

    baseline_data = daily_costs[:-2]
    if len(baseline_data) < 3:
        return None

    baseline = mean(baseline_data)
    try:
        sigma = stdev(baseline_data)
    except Exception:
        sigma = 0

    threshold = baseline + 3 * sigma
    last_two = daily_costs[-2:]

    if all(v > threshold for v in last_two) and daily_costs[-1] > 0:
        deviation_pct = ((daily_costs[-1] - baseline) / baseline * 100) if baseline > 0 else 0
        return {
            "provider": provider,
            "service_name": service_name,
            "baseline_cost": round(baseline, 4),
            "actual_cost": round(daily_costs[-1], 4),
            "deviation_pct": round(deviation_pct, 1),
        }
    return None
