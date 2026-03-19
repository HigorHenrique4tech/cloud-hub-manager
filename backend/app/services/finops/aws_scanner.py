"""
AWS FinOps Scanner — waste detection for AWS resources.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from statistics import mean

import boto3
from botocore.exceptions import ClientError

from .constants import (
    CPU_IDLE_PCT, CPU_UNDERUTIL_PCT, CPU_WINDOW_DAYS,
    DB_CONNECTIONS_MIN, DISK_ORPHAN_DAYS, SNAPSHOT_AGE_DAYS,
    SAVING_RIGHT_SIZE, SAVING_STOP, EC2_FAMILY_RATIO,
)
from .utils import _severity, _right_size_saving

logger = logging.getLogger(__name__)


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

    # ── Always-on dev/test resources ─────────────────────────────────────────

    _DEV_KEYWORDS = {"dev", "test", "staging", "hml", "sandbox", "homolog", "qa"}

    def _is_dev_resource(self, name: str, tags: list) -> bool:
        """Return True if the resource name or tags suggest a dev/test environment."""
        name_lower = (name or "").lower()
        if any(kw in name_lower for kw in self._DEV_KEYWORDS):
            return True
        env_tag = next(
            (t["Value"] for t in (tags or []) if t["Key"].lower() in ("environment", "env")),
            None,
        )
        return (env_tag or "").lower() in self._DEV_KEYWORDS

    def scan_always_on(self) -> List[dict]:
        """
        Detect running EC2 instances that appear to be dev/test but run 24/7.
        Recommends a weekday schedule (08:00-19:00) to save ~54% monthly.
        """
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
                    tags = i.get("Tags") or []
                    name = next((t["Value"] for t in tags if t["Key"] == "Name"), instance_id)
                    az = i.get("Placement", {}).get("AvailabilityZone", self.region)

                    if not self._is_dev_resource(name, tags):
                        continue

                    current_cost = self._estimate_ec2_monthly_cost(instance_type)
                    # Schedule off 13h/day on weekdays + full weekends ≈ 54% saving
                    saving = round(current_cost * 0.54, 2)

                    findings.append({
                        "provider": "aws",
                        "resource_id": instance_id,
                        "resource_name": name,
                        "resource_type": "ec2",
                        "region": az,
                        "recommendation_type": "schedule",
                        "severity": "medium",
                        "estimated_saving_monthly": saving,
                        "current_monthly_cost": current_cost,
                        "reasoning": (
                            f"Instância EC2 de desenvolvimento '{name}' rodando 24/7. "
                            f"Agendar desligamento fora do horário comercial (Seg–Sex 08:00–19:00) "
                            f"pode economizar ~54% do custo mensal (${saving:.2f}/mês)."
                        ),
                        "current_spec": {"instance_type": instance_type},
                        "recommended_spec": {
                            "suggested_start": "08:00",
                            "suggested_stop": "19:00",
                            "timezone": "America/Sao_Paulo",
                            "schedule_type": "weekdays",
                        },
                    })
        except ClientError as e:
            logger.warning(f"Always-on EC2 scan error: {e}")
        return findings

    # ── Cost Explorer: top spending / MoM spike detection ────────────────────

    def scan_cost_explorer(self) -> List[dict]:
        """
        Queries AWS Cost Explorer to find services with abnormally high or
        rapidly growing spend.  Produces 'review_spend' recommendations so
        the user is aware without requiring an automated action.
        Requires the 'ce:GetCostAndUsage' IAM permission.
        """
        findings = []
        try:
            import calendar
            from datetime import date

            ce = self._client("ce", region="us-east-1")
            today = date.today()

            # Month-to-date window
            mtd_start = today.replace(day=1).isoformat()
            mtd_end   = today.isoformat()
            if mtd_start == mtd_end:
                return findings  # 1st of month — no data yet

            # Previous full month
            if today.month == 1:
                prev_start = date(today.year - 1, 12, 1).isoformat()
                prev_end   = date(today.year, 1, 1).isoformat()
            else:
                prev_start = today.replace(month=today.month - 1, day=1).isoformat()
                prev_end   = today.replace(day=1).isoformat()

            def _by_service(start: str, end: str) -> dict:
                resp = ce.get_cost_and_usage(
                    TimePeriod={"Start": start, "End": end},
                    Granularity="MONTHLY",
                    Metrics=["UnblendedCost"],
                    GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
                )
                result: dict = {}
                for r in resp.get("ResultsByTime", []):
                    for g in r.get("Groups", []):
                        svc  = g["Keys"][0]
                        cost = float(g["Metrics"]["UnblendedCost"]["Amount"])
                        result[svc] = result.get(svc, 0.0) + cost
                return result

            mtd_by_svc  = _by_service(mtd_start, mtd_end)
            prev_by_svc = _by_service(prev_start, prev_end)

            # Project MTD spend to full-month rate
            days_elapsed  = today.day
            days_in_month = calendar.monthrange(today.year, today.month)[1]
            projected = {
                svc: cost * days_in_month / days_elapsed
                for svc, cost in mtd_by_svc.items()
            }

            flagged = 0
            for svc, proj_mo in sorted(projected.items(), key=lambda x: -x[1]):
                if proj_mo < 10.0:
                    continue  # ignore negligible services
                prev_cost = prev_by_svc.get(svc, 0.0)
                mtd_cost  = mtd_by_svc.get(svc, 0.0)

                if prev_cost > 0:
                    increase_pct = (proj_mo - prev_cost) / prev_cost
                    # Only flag if >30 % MoM spike OR very high projected spend
                    if increase_pct < 0.30 and proj_mo < 200:
                        continue
                    if increase_pct >= 0.30:
                        reasoning = (
                            f"Serviço AWS '{svc}' com custo projetado de ${proj_mo:.2f}/mês — "
                            f"aumento de {increase_pct * 100:.0f}% em relação ao mês anterior (${prev_cost:.2f})."
                        )
                    else:
                        reasoning = (
                            f"Serviço AWS '{svc}' com alto custo projetado de ${proj_mo:.2f}/mês "
                            f"(mês anterior: ${prev_cost:.2f})."
                        )
                elif proj_mo >= 200:
                    reasoning = (
                        f"Serviço AWS '{svc}' com alto custo projetado de ${proj_mo:.2f}/mês (sem histórico anterior)."
                    )
                else:
                    continue

                # Estimate 20% potential saving as an actionable signal
                estimated_saving = round(proj_mo * 0.20, 2)
                findings.append({
                    "provider": "aws",
                    "resource_id": svc.replace(" ", "-").lower(),
                    "resource_name": svc,
                    "resource_type": "aws_service",
                    "region": self.region,
                    "recommendation_type": "review_spend",
                    "severity": _severity(estimated_saving),
                    "estimated_saving_monthly": estimated_saving,
                    "current_monthly_cost": round(proj_mo, 2),
                    "reasoning": reasoning,
                    "current_spec": {
                        "service": svc,
                        "mtd_cost": round(mtd_cost, 2),
                        "projected_monthly": round(proj_mo, 2),
                        "prev_month_cost": round(prev_cost, 2),
                    },
                    "recommended_spec": None,
                })
                flagged += 1
                if flagged >= 10:
                    break

        except Exception as e:
            logger.warning(f"Cost Explorer scan error: {e}")
        return findings

    def scan_ec2_rightsizing(self) -> List[dict]:
        """Detects EC2 instances with 5-20% CPU (subutilized, not idle) and suggests a smaller type."""
        findings = []
        try:
            ec2 = self._client("ec2")
            resp = ec2.describe_instances(
                Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
            )
            for r in resp.get("Reservations", []):
                for i in r.get("Instances", []):
                    instance_id   = i["InstanceId"]
                    instance_type = i.get("InstanceType", "unknown")
                    name = next((t["Value"] for t in (i.get("Tags") or []) if t["Key"] == "Name"), instance_id)
                    az   = i.get("Placement", {}).get("AvailabilityZone", self.region)

                    avg_cpu = self._cloudwatch_avg(
                        "AWS/EC2", "CPUUtilization",
                        [{"Name": "InstanceId", "Value": instance_id}],
                    )
                    if avg_cpu is None or avg_cpu < CPU_IDLE_PCT or avg_cpu >= CPU_UNDERUTIL_PCT:
                        continue  # skip idle (<5%) and adequately utilized (>=20%)

                    current_cost = self._estimate_ec2_monthly_cost(instance_type)
                    saving, rec_type = _right_size_saving(instance_type, current_cost)

                    findings.append({
                        "provider": "aws",
                        "resource_id": instance_id,
                        "resource_name": name,
                        "resource_type": "ec2",
                        "region": az,
                        "recommendation_type": "rightsizing",
                        "severity": _severity(saving),
                        "estimated_saving_monthly": round(saving, 2),
                        "current_monthly_cost": current_cost,
                        "reasoning": (
                            f"CPU médio de {avg_cpu:.1f}% nos últimos {CPU_WINDOW_DAYS} dias. "
                            f"Instância subutilizada — considere reduzir para '{rec_type}'."
                        ),
                        "current_spec": {"instance_type": instance_type, "az": az},
                        "recommended_spec": {"instance_type": rec_type},
                    })
        except Exception as e:
            logger.warning(f"AWS EC2 rightsizing scan error: {e}")
        return findings

    def scan_all(self) -> List[dict]:
        findings = []
        findings.extend(self.scan_ec2_idle())
        findings.extend(self.scan_ec2_rightsizing())
        findings.extend(self.scan_ebs_orphan())
        findings.extend(self.scan_elastic_ips())
        findings.extend(self.scan_rds_idle())
        findings.extend(self.scan_old_snapshots())
        findings.extend(self.scan_always_on())
        findings.extend(self.scan_cost_explorer())
        return findings
