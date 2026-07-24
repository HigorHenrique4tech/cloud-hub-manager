"""
Backup Validation Service — detecta VMs sem backup, valida saúde dos backups
existentes e gera resumo de cobertura por subscription.

Fontes:
  - azure.mgmt.recoveryservices   → listar vaults
  - azure.mgmt.recoveryservicesbackup → listar itens protegidos + jobs
  - azure.mgmt.compute            → listar todas as VMs (cross-rg)

Classificação de risco:
  critical  → VM sem nenhum backup
  high      → backup falhando há >3 dias
  medium    → restore point com >7 dias
  ok        → backup saudável e recente
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# Thresholds
STALE_BACKUP_DAYS = 7    # restore point mais antigo que isso → medium risk
FAILING_BACKUP_DAYS = 3  # último job com falha há mais de N dias → high risk


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _age_days(iso_str: Optional[str]) -> Optional[float]:
    """Returns age in days from an ISO timestamp string, or None."""
    if not iso_str:
        return None
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (_utcnow() - dt).total_seconds() / 86400
    except Exception:
        return None


def _risk_level(last_backup_time: Optional[str], last_backup_status: Optional[str]) -> str:
    """Classify backup risk based on age and last job status."""
    status = (last_backup_status or "").lower()
    age = _age_days(last_backup_time)

    if "failed" in status or "unhealthy" in status:
        if age is None or age > FAILING_BACKUP_DAYS:
            return "high"
    if age is None:
        return "medium"
    if age > STALE_BACKUP_DAYS:
        return "medium"
    return "ok"


class BackupValidationService:
    """
    High-level service for cross-vault backup coverage analysis.
    Accepts an already-built AzureService instance.
    """

    def __init__(self, azure_service):
        self.svc = azure_service

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _list_vaults(self) -> list[dict]:
        """List all Recovery Services Vaults in the subscription."""
        vaults = []
        try:
            for v in self.svc.recovery_services_client.vaults.list_by_subscription_id():
                rg = v.id.split("/resourceGroups/")[1].split("/")[0] if v.id else ""
                vaults.append({
                    "name": v.name,
                    "resource_group": rg,
                    "location": v.location,
                    "id": v.id,
                })
        except Exception as e:
            logger.warning("[BackupValidation] Error listing vaults: %s", e)
        return vaults

    def _list_all_vms(self) -> list[dict]:
        """List all VMs in the subscription via Compute API."""
        vms = []
        try:
            for vm in self.svc.compute_client.virtual_machines.list_all():
                rg = ""
                try:
                    rg = vm.id.split("/resourceGroups/")[1].split("/")[0]
                except Exception:
                    pass
                power_state = None
                try:
                    if vm.instance_view and vm.instance_view.statuses:
                        for s in vm.instance_view.statuses:
                            if s.code and s.code.startswith("PowerState/"):
                                power_state = s.code.split("/")[1]
                except Exception:
                    pass
                vms.append({
                    "id": (vm.id or "").lower(),
                    "name": vm.name,
                    "resource_group": rg,
                    "location": vm.location,
                    "power_state": power_state,
                    "os_type": str(vm.storage_profile.os_disk.os_type) if vm.storage_profile and vm.storage_profile.os_disk else None,
                })
        except Exception as e:
            logger.warning("[BackupValidation] Error listing VMs: %s", e)
        return vms

    def _list_protected_items_all_vaults(self, vaults: list[dict]) -> list[dict]:
        """List all protected VM items across all vaults."""
        items = []
        for vault in vaults:
            try:
                for item in self.svc.backup_client.backup_protected_items.list(
                    vault["name"],
                    vault["resource_group"],
                    filter="backupManagementType eq 'AzureIaasVM' and itemType eq 'VM'",
                ):
                    props = item.properties
                    source_id = getattr(props, "source_resource_id", None) or ""
                    lbt = getattr(props, "last_backup_time", None)
                    last_backup_time = lbt.isoformat() if lbt else None
                    policy_id = getattr(props, "policy_id", None) or ""

                    items.append({
                        "source_resource_id": source_id.lower(),
                        "vm_name": getattr(props, "friendly_name", None) or item.name,
                        "vault_name": vault["name"],
                        "vault_rg": vault["resource_group"],
                        "protection_status": getattr(props, "protection_status", None),
                        "protection_state": str(getattr(props, "protection_state", None)),
                        "last_backup_status": str(getattr(props, "last_backup_status", None)),
                        "last_backup_time": last_backup_time,
                        "health_status": str(getattr(props, "health_status", None)),
                        "policy_name": policy_id.split("/")[-1] if policy_id else None,
                        "risk": _risk_level(last_backup_time, str(getattr(props, "last_backup_status", None))),
                    })
            except Exception as e:
                logger.warning("[BackupValidation] Error listing items in vault %s: %s", vault["name"], e)
        return items

    # ── Public API ────────────────────────────────────────────────────────────

    def get_coverage_summary(self) -> dict:
        """
        Returns:
          total_vms, protected_vms, unprotected_vms, coverage_pct,
          healthy, stale, failing, vaults_count
        """
        vaults = self._list_vaults()
        all_vms = self._list_all_vms()
        protected = self._list_protected_items_all_vaults(vaults)
        protected_ids = {p["source_resource_id"] for p in protected if p["source_resource_id"]}

        total = len(all_vms)
        prot_count = sum(1 for vm in all_vms if vm["id"] in protected_ids)
        unprot_count = total - prot_count
        coverage_pct = round((prot_count / total * 100), 1) if total else 0.0

        healthy = sum(1 for p in protected if p["risk"] == "ok")
        stale   = sum(1 for p in protected if p["risk"] == "medium")
        failing = sum(1 for p in protected if p["risk"] == "high")

        return {
            "total_vms": total,
            "protected_vms": prot_count,
            "unprotected_vms": unprot_count,
            "coverage_pct": coverage_pct,
            "healthy_backups": healthy,
            "stale_backups": stale,
            "failing_backups": failing,
            "vaults_count": len(vaults),
            "scanned_at": _utcnow().isoformat(),
        }

    def get_unprotected_vms(self) -> list[dict]:
        """Returns list of VMs with no backup coverage."""
        vaults = self._list_vaults()
        all_vms = self._list_all_vms()
        protected = self._list_protected_items_all_vaults(vaults)
        protected_ids = {p["source_resource_id"] for p in protected if p["source_resource_id"]}

        return [
            {**vm, "risk": "critical"}
            for vm in all_vms
            if vm["id"] not in protected_ids
        ]

    def get_backup_health(self) -> list[dict]:
        """
        Returns all protected items with health classification.
        Includes: ok, stale (>7d), failing.
        """
        vaults = self._list_vaults()
        items = self._list_protected_items_all_vaults(vaults)
        # Sort: failing first, then stale, then ok
        risk_order = {"high": 0, "medium": 1, "ok": 2}
        return sorted(items, key=lambda x: risk_order.get(x["risk"], 9))
