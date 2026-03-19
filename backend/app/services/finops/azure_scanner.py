"""
Azure FinOps Scanner — waste detection for Azure resources.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from statistics import mean

from .constants import (
    CPU_IDLE_PCT, CPU_UNDERUTIL_PCT, CPU_WINDOW_DAYS,
    DISK_ORPHAN_DAYS, SAVING_RIGHT_SIZE, SAVING_STOP,
    AZURE_VM_FAMILY_RATIO,
)
from .utils import _severity

logger = logging.getLogger(__name__)


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
        self._cost_mgmt_client = None

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

    def _cost_mgmt(self):
        if not self._cost_mgmt_client:
            from azure.mgmt.costmanagement import CostManagementClient
            self._cost_mgmt_client = CostManagementClient(self._get_credential())
        return self._cost_mgmt_client

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

    # ── Always-on dev/test resources ─────────────────────────────────────────

    _DEV_KEYWORDS = {"dev", "test", "staging", "hml", "sandbox", "homolog", "qa"}

    def _is_dev_resource_azure(self, name: str, tags: dict) -> bool:
        name_lower = (name or "").lower()
        if any(kw in name_lower for kw in self._DEV_KEYWORDS):
            return True
        env_tag = (tags or {}).get("Environment") or (tags or {}).get("environment", "")
        return (env_tag or "").lower() in self._DEV_KEYWORDS

    def scan_always_on(self) -> List[dict]:
        """
        Detect running Azure VMs that appear to be dev/test but run 24/7.
        Recommends a weekday schedule (08:00-19:00) to save ~54% monthly.
        """
        findings = []
        try:
            compute = self._compute()
            for vm in compute.virtual_machines.list_all():
                # Check power state
                rg = vm.id.split("/")[4]
                try:
                    iv = compute.virtual_machines.instance_view(rg, vm.name)
                    statuses = [s.code for s in (iv.statuses or [])]
                    if "PowerState/running" not in statuses:
                        continue
                except Exception:
                    continue

                if not self._is_dev_resource_azure(vm.name, vm.tags):
                    continue

                vm_size = (vm.hardware_profile.vm_size if vm.hardware_profile else "unknown") or "unknown"
                ratio = AZURE_VM_FAMILY_RATIO.get(vm_size, 4.0)
                current_cost = round(8.5 * ratio, 2)
                saving = round(current_cost * 0.54, 2)

                # resource_id stored as "resource_group/vm_name" for scheduler
                resource_id = f"{rg}/{vm.name}"

                findings.append({
                    "provider": "azure",
                    "resource_id": resource_id,
                    "resource_name": vm.name,
                    "resource_type": "vm",
                    "region": vm.location,
                    "recommendation_type": "schedule",
                    "severity": "medium",
                    "estimated_saving_monthly": saving,
                    "current_monthly_cost": current_cost,
                    "reasoning": (
                        f"VM Azure de desenvolvimento '{vm.name}' rodando 24/7. "
                        f"Agendar desligamento fora do horário comercial (Seg–Sex 08:00–19:00) "
                        f"pode economizar ~54% do custo mensal (${saving:.2f}/mês)."
                    ),
                    "current_spec": {"vm_size": vm_size, "resource_group": rg},
                    "recommended_spec": {
                        "suggested_start": "08:00",
                        "suggested_stop": "19:00",
                        "timezone": "America/Sao_Paulo",
                        "schedule_type": "weekdays",
                    },
                })
        except Exception as e:
            logger.warning(f"Azure always-on VM scan error: {e}")
        return findings

    def scan_cost_management(self) -> List[dict]:
        """
        Queries Azure Cost Management API for service-level spend trends.
        Flags services with >30% MoM increase or projected spend >$200/mo.
        Requires 'Microsoft.CostManagement/query/action' RBAC (Cost Management Reader role).
        """
        import calendar
        from datetime import date as _date, datetime as _datetime

        findings = []
        try:
            from azure.mgmt.costmanagement.models import (
                QueryDefinition, QueryDataset, QueryTimePeriod,
                QueryAggregation, QueryGrouping,
            )

            today = _date.today()
            mtd_start = today.replace(day=1)
            mtd_end   = today

            if today.month == 1:
                prev_start = _date(today.year - 1, 12, 1)
                prev_end   = _date(today.year, 1, 1)
            else:
                prev_start = today.replace(month=today.month - 1, day=1)
                prev_end   = today.replace(day=1)

            scope  = f"/subscriptions/{self.subscription_id}"
            client = self._cost_mgmt()

            def _query_by_service(start: _date, end: _date) -> dict:
                result = client.query.usage(
                    scope=scope,
                    parameters=QueryDefinition(
                        type="ActualCost",
                        timeframe="Custom",
                        time_period=QueryTimePeriod(
                            from_property=_datetime(start.year, start.month, start.day),
                            to=_datetime(end.year, end.month, end.day),
                        ),
                        dataset=QueryDataset(
                            granularity="None",
                            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
                            grouping=[QueryGrouping(type="Dimension", name="ServiceName")],
                        ),
                    ),
                )
                col_names = [c.name for c in result.columns]
                svc_idx   = col_names.index("ServiceName")
                cost_idx  = next(i for i, c in enumerate(col_names) if "cost" in c.name.lower())
                by_svc: dict = {}
                for row in result.rows:
                    svc  = row[svc_idx]
                    cost = float(row[cost_idx])
                    by_svc[svc] = by_svc.get(svc, 0.0) + cost
                return by_svc

            mtd_by_svc  = _query_by_service(mtd_start, mtd_end)
            prev_by_svc = _query_by_service(prev_start, prev_end)

            days_elapsed  = today.day
            days_in_month = calendar.monthrange(today.year, today.month)[1]
            projected = {
                svc: cost * days_in_month / days_elapsed
                for svc, cost in mtd_by_svc.items()
            }

            for svc, proj_mo in sorted(projected.items(), key=lambda x: -x[1]):
                if proj_mo < 10.0:
                    continue
                prev_cost = prev_by_svc.get(svc, 0.0)
                if prev_cost > 0:
                    increase_pct = (proj_mo - prev_cost) / prev_cost
                    if increase_pct < 0.30 and proj_mo < 200:
                        continue
                else:
                    if proj_mo < 200:
                        continue

                severity    = "high" if proj_mo > 500 else "medium" if proj_mo > 100 else "low"
                description = f"Serviço Azure '{svc}' com gasto projetado de ${proj_mo:.2f}/mês"
                if prev_cost > 0:
                    increase_pct = (proj_mo - prev_cost) / prev_cost
                    description += f" (variação de {increase_pct:+.0%} vs mês anterior)"

                findings.append({
                    "provider":                 "azure",
                    "resource_id":              svc.lower().replace(" ", "-"),
                    "resource_name":            svc,
                    "resource_type":            "azure_service",
                    "recommendation_type":      "review_spend",
                    "severity":                 severity,
                    "estimated_saving_monthly": round(proj_mo * 0.20, 2),
                    "description":              description,
                    "spec_before": {
                        "projected_monthly_usd": round(proj_mo, 2),
                        "mtd_usd":               round(mtd_by_svc.get(svc, 0.0), 2),
                        "prev_month_usd":        round(prev_cost, 2),
                    },
                    "spec_after": {"target_monthly_usd": round(proj_mo * 0.80, 2)},
                    "rollback_data": {},
                })
                if len(findings) >= 10:
                    break
        except Exception as e:
            logger.warning(f"Azure Cost Management scan error: {e}")

        return findings

    def scan_vm_rightsizing(self) -> List[dict]:
        """Detects Azure VMs with 5-20% CPU (subutilized, not idle) and suggests a smaller SKU."""
        findings = []
        try:
            compute = self._compute()
            vm_sizes_sorted = sorted(AZURE_VM_FAMILY_RATIO.keys(), key=lambda k: AZURE_VM_FAMILY_RATIO[k])
            for vm in compute.virtual_machines.list_all():
                try:
                    instance_view = compute.virtual_machines.instance_view(
                        vm.id.split("/")[4], vm.name,
                    )
                    statuses = [s.code for s in (instance_view.statuses or [])]
                    if "PowerState/running" not in statuses:
                        continue
                except Exception:
                    continue

                vm_size      = vm.hardware_profile.vm_size if vm.hardware_profile else "unknown"
                resource_id  = vm.id
                resource_group = vm.id.split("/")[4]

                avg_cpu = self._azure_monitor_avg(resource_id, "Percentage CPU")
                if avg_cpu is None or avg_cpu < CPU_IDLE_PCT or avg_cpu >= CPU_UNDERUTIL_PCT:
                    continue

                current_cost = self._estimate_vm_monthly_cost(vm_size)
                current_idx  = next((i for i, s in enumerate(vm_sizes_sorted) if s == vm_size), None)
                if current_idx and current_idx > 0:
                    rec_size = vm_sizes_sorted[current_idx - 1]
                    saving   = max(0.0, current_cost - self._estimate_vm_monthly_cost(rec_size))
                else:
                    rec_size = "menor SKU da mesma família"
                    saving   = current_cost * SAVING_RIGHT_SIZE

                findings.append({
                    "provider": "azure",
                    "resource_id": resource_id,
                    "resource_name": vm.name,
                    "resource_type": "vm",
                    "region": vm.location,
                    "recommendation_type": "rightsizing",
                    "severity": _severity(saving),
                    "estimated_saving_monthly": round(saving, 2),
                    "current_monthly_cost": current_cost,
                    "reasoning": (
                        f"CPU médio de {avg_cpu:.1f}% nos últimos {CPU_WINDOW_DAYS} dias. "
                        f"VM subutilizada — considere reduzir para '{rec_size}'."
                    ),
                    "current_spec": {"vm_size": vm_size, "resource_group": resource_group},
                    "recommended_spec": {"vm_size": rec_size},
                })
        except Exception as e:
            logger.warning(f"Azure VM rightsizing scan error: {e}")
        return findings

    def scan_all(self) -> List[dict]:
        findings = []
        findings.extend(self.scan_vm_idle())
        findings.extend(self.scan_vm_rightsizing())
        findings.extend(self.scan_managed_disks())
        findings.extend(self.scan_public_ips())
        findings.extend(self.scan_always_on())
        findings.extend(self.scan_cost_management())
        return findings
