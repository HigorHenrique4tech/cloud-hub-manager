"""
Apply / rollback helpers for AWS, Azure, and GCP recommendations.
Also contains _apply_recommendation_logic used by bulk-apply and approvals.
"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.db_models import (
    FinOpsAction,
    FinOpsRecommendation,
    ScheduledAction,
)
from app.services.finops_service import AWSFinOpsScanner, AzureFinOpsScanner, GCPFinOpsScanner
from app.services.log_service import log_activity

from ._helpers import _get_aws_scanner, _get_azure_scanner, _get_gcp_scanner

logger = logging.getLogger(__name__)


# ── Apply helpers (AWS) ────────────────────────────────────────────────────────


def _apply_aws(rec: FinOpsRecommendation, scanner: AWSFinOpsScanner) -> dict:
    """
    Execute the AWS action for a recommendation.
    Returns rollback_data dict (can be empty if non-reversible).
    """
    ec2 = scanner._client("ec2")
    rtype = rec.recommendation_type
    rrestype = rec.resource_type

    if rrestype == "ebs" and rtype == "delete":
        ec2.delete_volume(VolumeId=rec.resource_id)
        return {}  # non-reversible

    elif rrestype == "elastic_ip" and rtype == "delete":
        allocation_id = (rec.current_spec or {}).get("allocation_id", "")
        if allocation_id:
            ec2.release_address(AllocationId=allocation_id)
        else:
            ec2.release_address(PublicIp=rec.resource_id)
        return {}

    elif rrestype == "snapshot" and rtype == "delete":
        ec2.delete_snapshot(SnapshotId=rec.resource_id)
        return {}

    elif rrestype == "ec2" and rtype in ("stop", "right_size"):
        if rtype == "stop":
            ec2.stop_instances(InstanceIds=[rec.resource_id])
            return {"action": "start", "instance_ids": [rec.resource_id]}
        else:
            # right_size: change instance type (requires stop first)
            rec_spec = rec.recommended_spec or {}
            new_type = rec_spec.get("instance_type")
            if not new_type:
                raise HTTPException(status_code=400, detail="Tipo de instância recomendado não definido.")
            current_spec = rec.current_spec or {}
            old_type = current_spec.get("instance_type", "unknown")
            # stop → wait → change → start
            ec2.stop_instances(InstanceIds=[rec.resource_id])
            ec2.get_waiter("instance_stopped").wait(
                InstanceIds=[rec.resource_id],
                WaiterConfig={"Delay": 5, "MaxAttempts": 40},
            )
            ec2.modify_instance_attribute(
                InstanceId=rec.resource_id,
                InstanceType={"Value": new_type},
            )
            ec2.start_instances(InstanceIds=[rec.resource_id])
            return {"action": "restore_type", "instance_id": rec.resource_id, "original_type": old_type}

    elif rrestype == "rds" and rtype == "stop":
        rds = scanner._client("rds")
        rds.stop_db_instance(DBInstanceIdentifier=rec.resource_id)
        return {"action": "start_rds", "db_id": rec.resource_id}

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Ação '{rtype}' para recurso '{rrestype}' não suportada ainda."
        )


def _rollback_aws(action: FinOpsAction, scanner: AWSFinOpsScanner):
    data = action.rollback_data or {}
    ec2 = scanner._client("ec2")
    act = data.get("action", "")

    if act == "start":
        ec2.start_instances(InstanceIds=data.get("instance_ids", []))
    elif act == "restore_type":
        ec2.stop_instances(InstanceIds=[data["instance_id"]])
        ec2.get_waiter("instance_stopped").wait(
            InstanceIds=[data["instance_id"]],
            WaiterConfig={"Delay": 5, "MaxAttempts": 40},
        )
        ec2.modify_instance_attribute(
            InstanceId=data["instance_id"],
            InstanceType={"Value": data["original_type"]},
        )
        ec2.start_instances(InstanceIds=[data["instance_id"]])
    elif act == "start_rds":
        rds = scanner._client("rds")
        rds.start_db_instance(DBInstanceIdentifier=data["db_id"])
    else:
        raise HTTPException(status_code=400, detail="Rollback não disponível para esta ação.")


# ── Apply helpers (Azure) ──────────────────────────────────────────────────────


def _apply_azure(rec: FinOpsRecommendation, scanner: AzureFinOpsScanner) -> dict:
    rtype = rec.recommendation_type
    rrestype = rec.resource_type
    spec = rec.current_spec or {}

    compute = scanner._compute()
    network = scanner._network()

    if rrestype == "managed_disk" and rtype == "delete":
        rg = spec.get("resource_group", "")
        compute.disks.begin_delete(rg, rec.resource_name).result()
        return {}

    elif rrestype == "public_ip" and rtype == "delete":
        rg = spec.get("resource_group", "")
        network.public_ip_addresses.begin_delete(rg, rec.resource_name).result()
        return {}

    elif rrestype == "vm" and rtype in ("stop", "right_size"):
        rg = spec.get("resource_group", "")
        if rtype == "stop":
            compute.virtual_machines.begin_deallocate(rg, rec.resource_name).result()
            return {"action": "start_vm", "resource_group": rg, "vm_name": rec.resource_name}
        else:
            rec_spec = rec.recommended_spec or {}
            new_size = rec_spec.get("vm_size")
            if not new_size:
                raise HTTPException(status_code=400, detail="Tamanho de VM recomendado não definido.")
            old_size = spec.get("vm_size", "unknown")
            from azure.mgmt.compute.models import HardwareProfile
            vm_obj = compute.virtual_machines.get(rg, rec.resource_name)
            vm_obj.hardware_profile = HardwareProfile(vm_size=new_size)
            compute.virtual_machines.begin_create_or_update(rg, rec.resource_name, vm_obj).result()
            return {"action": "restore_vm_size", "resource_group": rg, "vm_name": rec.resource_name, "original_size": old_size}
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Ação '{rtype}' para recurso '{rrestype}' não suportada ainda."
        )


def _rollback_azure(action: FinOpsAction, scanner: AzureFinOpsScanner):
    data = action.rollback_data or {}
    act = data.get("action", "")
    compute = scanner._compute()

    if act == "start_vm":
        compute.virtual_machines.begin_start(data["resource_group"], data["vm_name"]).result()
    elif act == "restore_vm_size":
        from azure.mgmt.compute.models import HardwareProfile
        rg, name = data["resource_group"], data["vm_name"]
        vm_obj = compute.virtual_machines.get(rg, name)
        vm_obj.hardware_profile = HardwareProfile(vm_size=data["original_size"])
        compute.virtual_machines.begin_create_or_update(rg, name, vm_obj).result()
    else:
        raise HTTPException(status_code=400, detail="Rollback não disponível para esta ação.")


# ── Apply helpers (GCP) ───────────────────────────────────────────────────────


def _apply_gcp(rec: FinOpsRecommendation, scanner: GCPFinOpsScanner) -> dict:
    """Execute GCP action for a recommendation. Returns rollback_data."""
    rtype = rec.recommendation_type
    rrestype = rec.resource_type
    spec = rec.current_spec or {}
    project = scanner.project_id

    if rrestype == "compute_instance" and rtype == "stop":
        zone = spec.get("zone") or rec.region or ""
        if not zone:
            raise HTTPException(status_code=400, detail="Zona da instância GCE não encontrada.")
        op = scanner._instances_client().stop(project=project, zone=zone, instance=rec.resource_id)
        op.result()
        return {"action": "start_instance", "project": project, "zone": zone, "instance": rec.resource_id}

    elif rrestype == "persistent_disk" and rtype == "delete":
        zone = spec.get("zone") or rec.region or ""
        if not zone:
            raise HTTPException(status_code=400, detail="Zona do disco persistente não encontrada.")
        op = scanner._disks_client().delete(project=project, zone=zone, disk=rec.resource_id)
        op.result()
        return {}  # não reversível

    elif rrestype == "static_ip" and rtype == "delete":
        region = spec.get("region") or rec.region or ""
        if not region:
            raise HTTPException(status_code=400, detail="Região do IP estático não encontrada.")
        op = scanner._addresses_client().delete(project=project, region=region, address=rec.resource_id)
        op.result()
        return {}  # não reversível

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Ação '{rtype}' para recurso '{rrestype}' (GCP) não suportada ainda.",
        )


def _rollback_gcp(action: FinOpsAction, scanner: GCPFinOpsScanner):
    data = action.rollback_data or {}
    act = data.get("action", "")

    if act == "start_instance":
        op = scanner._instances_client().start(
            project=data["project"],
            zone=data["zone"],
            instance=data["instance"],
        )
        op.result()
    else:
        raise HTTPException(status_code=400, detail="Rollback não disponível para esta ação GCP.")


# ── Shared apply logic ────────────────────────────────────────────────────────


def _apply_recommendation_logic(rec: FinOpsRecommendation, member, db: Session) -> None:
    """Shared apply logic used by bulk-apply (mirrors apply_recommendation endpoint)."""
    if rec.recommendation_type == "schedule":
        from app.services.scheduler_service import register_schedule
        spec = rec.recommended_spec or {}
        created_ids = []
        for action in ("start", "stop"):
            time_key = "suggested_start" if action == "start" else "suggested_stop"
            schedule_time = spec.get(time_key, "08:00" if action == "start" else "19:00")
            s = ScheduledAction(
                workspace_id=member.workspace_id,
                provider=rec.provider,
                resource_id=rec.resource_id,
                resource_name=rec.resource_name,
                resource_type=rec.resource_type,
                action=action,
                schedule_type=spec.get("schedule_type", "weekdays"),
                schedule_time=schedule_time,
                timezone=spec.get("timezone", "America/Sao_Paulo"),
                is_enabled=True,
                created_by=member.user.id,
                created_at=datetime.utcnow(),
            )
            db.add(s)
            db.flush()
            register_schedule(s)
            created_ids.append(str(s.id))
        rec.status = "applied"
        rec.applied_at = datetime.utcnow()
        rec.applied_by = member.user.id
        finops_action = FinOpsAction(
            workspace_id=member.workspace_id,
            recommendation_id=rec.id,
            action_type="schedule",
            provider=rec.provider,
            resource_id=rec.resource_id,
            resource_name=rec.resource_name,
            resource_type=rec.resource_type,
            estimated_saving=rec.estimated_saving_monthly,
            status="executed",
            executed_by=member.user.id,
            rollback_data={"scheduled_action_ids": created_ids},
        )
        db.add(finops_action)
        db.commit()
        return

    if rec.recommendation_type == "rightsizing":
        raise ValueError(
            "Rightsizing requer execução manual: acesse o painel de instâncias e redimensione o recurso para o tipo recomendado."
        )

    if rec.provider == "aws":
        scanner = _get_aws_scanner(member.workspace_id, db,
                                   account_id=str(rec.cloud_account_id) if rec.cloud_account_id else None)
        if not scanner:
            raise ValueError("Nenhuma conta AWS configurada.")
        _apply_aws(rec, scanner)
    elif rec.provider == "azure":
        scanner = _get_azure_scanner(member.workspace_id, db,
                                     account_id=str(rec.cloud_account_id) if rec.cloud_account_id else None)
        if not scanner:
            raise ValueError("Nenhuma conta Azure configurada.")
        _apply_azure(rec, scanner)
    elif rec.provider == "gcp":
        scanner = _get_gcp_scanner(member.workspace_id, db,
                                   account_id=str(rec.cloud_account_id) if rec.cloud_account_id else None)
        if not scanner:
            raise ValueError("Nenhuma conta GCP configurada.")
        # GCP apply not implemented — raise to surface in failed list
        raise ValueError("Aplicação automática GCP não suportada.")
    else:
        raise ValueError(f"Provider '{rec.provider}' não suportado.")

    rec.status = "applied"
    rec.applied_at = datetime.utcnow()
    rec.applied_by = member.user.id
    finops_action = FinOpsAction(
        workspace_id=member.workspace_id,
        recommendation_id=rec.id,
        action_type=rec.recommendation_type,
        resource_id=rec.resource_id,
        resource_name=rec.resource_name,
        resource_type=rec.resource_type,
        provider=rec.provider,
        estimated_saving=rec.estimated_saving_monthly,
        status="executed",
        executed_by=member.user.id,
    )
    db.add(finops_action)
    db.commit()
    log_activity(
        db=db, user=member.user,
        action="finops.apply_recommendation",
        resource_type=rec.resource_type,
        resource_id=rec.resource_id,
        resource_name=rec.resource_name,
        provider=rec.provider,
        status="success",
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
