from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.services import AzureService
from app.models.db_models import CloudAccount
from app.models.create_schemas import (
    CreateAzureVMRequest, CreateAzureStorageRequest, CreateAzureVNetRequest,
    CreateAzureSQLRequest, CreateAzureAppServiceRequest,
)
from app.core.dependencies import require_permission
from app.core.auth_context import MemberContext
from app.database import get_db
from app.services.auth_service import decrypt_credential
from app.services.log_service import log_activity
from app.services.security_service import AzureSecurityScanner
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/azure",
    tags=["Azure (workspace)"],
)


def _build_azure_service_from_account(account: CloudAccount) -> AzureService:
    data = decrypt_credential(account.encrypted_data)
    subscription_id = data.get("subscription_id", "")
    tenant_id = data.get("tenant_id", "")
    client_id = data.get("client_id", "")
    client_secret = data.get("client_secret", "")
    if not all([subscription_id, tenant_id, client_id, client_secret]):
        raise HTTPException(status_code=400, detail="Credencial Azure incompleta nesta conta cloud.")
    return AzureService(
        subscription_id=subscription_id, tenant_id=tenant_id,
        client_id=client_id, client_secret=client_secret,
    )


def _get_single_azure_service(member: MemberContext, db: Session) -> AzureService:
    account = (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.provider == "azure",
            CloudAccount.is_active == True,
        )
        .order_by(CloudAccount.created_at.desc())
        .first()
    )
    if not account:
        raise HTTPException(status_code=400, detail="Nenhuma conta Azure configurada neste workspace.")
    return _build_azure_service_from_account(account)


# ── Connection ──────────────────────────────────────────────────────────────

@ws_router.get("/test-connection")
async def ws_test_azure_connection(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.test_connection()


# ── Helpers for form dropdowns ─────────────────────────────────────────────

@ws_router.get("/locations")
async def ws_list_locations(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_locations()


@ws_router.get("/vm-sizes")
async def ws_list_vm_sizes(
    location: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_vm_sizes(location=location)


@ws_router.get("/vm-images/publishers")
async def ws_list_vm_image_publishers(
    location: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_vm_image_publishers(location=location)


@ws_router.get("/vm-images/offers")
async def ws_list_vm_image_offers(
    location: str = Query(...),
    publisher: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_vm_image_offers(location=location, publisher=publisher)


@ws_router.get("/vm-images/skus")
async def ws_list_vm_image_skus(
    location: str = Query(...),
    publisher: str = Query(...),
    offer: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_vm_image_skus(location=location, publisher=publisher, offer=offer)


# ── VMs ─────────────────────────────────────────────────────────────────────

@ws_router.get("/vms")
async def ws_list_virtual_machines(
    account_id: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    if account_id:
        account = db.query(CloudAccount).filter(
            CloudAccount.id == account_id,
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.provider == "azure",
            CloudAccount.is_active == True,
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Conta Azure não encontrada")
        return await _build_azure_service_from_account(account).list_virtual_machines()
    svc = _get_single_azure_service(member, db)
    return await svc.list_virtual_machines()


@ws_router.post("/vms")
async def ws_create_virtual_machine(
    body: CreateAzureVMRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.create_virtual_machine(body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar VM'))
    log_activity(db, member.user, 'azurevm.create', 'AzureVM',
                 resource_name=body.name, provider='azure',
                 detail=f"Resource group: {body.resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/vms/{resource_group}/{vm_name}/start")
async def ws_start_vm(
    resource_group: str, vm_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.start_virtual_machine(resource_group, vm_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to start VM'))
    log_activity(db, member.user, 'azurevm.start', 'AzureVM',
                 resource_name=vm_name, provider='azure', detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/vms/{resource_group}/{vm_name}/stop")
async def ws_stop_vm(
    resource_group: str, vm_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.stop_virtual_machine(resource_group, vm_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to stop VM'))
    log_activity(db, member.user, 'azurevm.stop', 'AzureVM',
                 resource_name=vm_name, provider='azure', detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── Resource Groups ───────────────────────────────────────────────────────

@ws_router.get("/resource-groups")
async def ws_list_resource_groups(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.list_resource_groups()
    if not result.get('success') and result.get('error'):
        logger.warning(f"Error listing resource groups: {result['error']}")
    return result


@ws_router.get("/resource-groups/{rg_name}/resources")
async def ws_list_rg_resources(
    rg_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_resource_group_resources(rg_name)


# ── Storage Accounts ─────────────────────────────────────────────────────

@ws_router.get("/storage-accounts")
async def ws_list_storage_accounts(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_storage_accounts()


@ws_router.post("/storage-accounts")
async def ws_create_storage_account(
    body: CreateAzureStorageRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.create_storage_account(body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar Storage Account'))
    log_activity(db, member.user, 'storage.create', 'StorageAccount',
                 resource_name=body.name, provider='azure',
                 detail=f"Resource group: {body.resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── VNets ────────────────────────────────────────────────────────────────

@ws_router.get("/vnets")
async def ws_list_vnets(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_vnets()


@ws_router.post("/vnets")
async def ws_create_vnet(
    body: CreateAzureVNetRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.create_vnet(body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar VNet'))
    log_activity(db, member.user, 'vnet.create', 'VNet',
                 resource_name=body.name, provider='azure',
                 detail=f"Resource group: {body.resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── Databases ─────────────────────────────────────────────────────────────

@ws_router.get("/databases")
async def ws_list_databases(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_databases()


@ws_router.post("/databases")
async def ws_create_sql_database(
    body: CreateAzureSQLRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.create_sql_database(body.model_dump())
    if not result.get('success'):
        status_code = 400 if result.get('code') == 'REGION_NOT_ALLOWED' else 500
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Erro ao criar banco de dados SQL'))
    log_activity(db, member.user, 'sql.create', 'SQLDatabase',
                 resource_name=f"{body.server_name}/{body.database_name}", provider='azure',
                 detail=f"Resource group: {body.resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── App Services ──────────────────────────────────────────────────────────

@ws_router.get("/app-services")
async def ws_list_app_services(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_app_services()


@ws_router.post("/app-services")
async def ws_create_app_service(
    body: CreateAzureAppServiceRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.create_app_service(body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar App Service'))
    log_activity(db, member.user, 'appservice.create', 'AppService',
                 resource_name=body.name, provider='azure',
                 detail=f"Resource group: {body.resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/app-services/{resource_group}/{app_name}/start")
async def ws_start_app_service(
    resource_group: str, app_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.start_app_service(resource_group, app_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to start App Service'))
    log_activity(db, member.user, 'appservice.start', 'AppService',
                 resource_name=app_name, provider='azure', detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/app-services/{resource_group}/{app_name}/stop")
async def ws_stop_app_service(
    resource_group: str, app_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.stop_app_service(resource_group, app_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to stop App Service'))
    log_activity(db, member.user, 'appservice.stop', 'AppService',
                 resource_name=app_name, provider='azure', detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── Subscriptions ─────────────────────────────────────────────────────────

@ws_router.get("/subscriptions")
async def ws_list_subscriptions(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_subscriptions()


# ── Detail ──────────────────────────────────────────────────────────────────

@ws_router.get("/vms/{resource_group}/{vm_name}")
async def ws_get_vm_detail(
    resource_group: str,
    vm_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.get_vm_detail(resource_group, vm_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da VM'))
    return result


@ws_router.get("/databases/{resource_group}/{server_name}")
async def ws_get_sql_server_detail(
    resource_group: str,
    server_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.get_sql_server_detail(resource_group, server_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe do servidor SQL'))
    return result


@ws_router.get("/app-services/{resource_group}/{app_name}")
async def ws_get_app_service_detail(
    resource_group: str,
    app_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.get_app_service_detail(resource_group, app_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe do App Service'))
    return result


@ws_router.get("/storage-accounts/{resource_group}/{account_name}")
async def ws_get_storage_account_detail(
    resource_group: str,
    account_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.get_storage_account_detail(resource_group, account_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da Storage Account'))
    return result


@ws_router.get("/vnets/{resource_group}/{vnet_name}")
async def ws_get_vnet_detail(
    resource_group: str,
    vnet_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.get_vnet_detail(resource_group, vnet_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da VNet'))
    return result


# ── Delete ──────────────────────────────────────────────────────────────────

@ws_router.delete("/vms/{resource_group}/{vm_name}")
async def ws_delete_azure_vm(
    resource_group: str,
    vm_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.delete_virtual_machine(resource_group, vm_name)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao excluir VM'))
    log_activity(db, member.user, 'vm.delete', 'AzureVM',
                 resource_name=vm_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/storage-accounts/{resource_group}/{account_name}")
async def ws_delete_azure_storage(
    resource_group: str,
    account_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.delete_storage_account(resource_group, account_name)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao excluir Storage Account'))
    log_activity(db, member.user, 'storage.delete', 'AzureStorage',
                 resource_name=account_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/vnets/{resource_group}/{vnet_name}")
async def ws_delete_azure_vnet(
    resource_group: str,
    vnet_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.delete_virtual_network(resource_group, vnet_name)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao excluir VNet'))
    log_activity(db, member.user, 'vnet.delete', 'AzureVNet',
                 resource_name=vnet_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/databases/{resource_group}/{server_name}")
async def ws_delete_azure_sql_server(
    resource_group: str,
    server_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.delete_sql_server(resource_group, server_name)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao excluir servidor SQL'))
    log_activity(db, member.user, 'sql.delete', 'AzureSQL',
                 resource_name=server_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/app-services/{resource_group}/{app_name}")
async def ws_delete_azure_app_service(
    resource_group: str,
    app_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.delete_app_service(resource_group, app_name)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao excluir App Service'))
    log_activity(db, member.user, 'appservice.delete', 'AzureAppService',
                 resource_name=app_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── Costs ───────────────────────────────────────────────────────────────────

@ws_router.get("/costs")
async def ws_get_azure_costs(
    start_date: str = Query(...),
    end_date: str = Query(...),
    granularity: str = Query("Daily"),
    account_id: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("costs.view")),
    db: Session = Depends(get_db),
):
    if account_id:
        account = db.query(CloudAccount).filter(
            CloudAccount.id == account_id,
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.provider == "azure",
            CloudAccount.is_active == True,
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Conta Azure não encontrada")
        svc = _build_azure_service_from_account(account)
    else:
        svc = _get_single_azure_service(member, db)
    result = await svc.get_cost_by_subscription(
        start_date=start_date, end_date=end_date, granularity=granularity.capitalize()
    )
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter dados de custo Azure'))
    return result


# ── Security Scan ─────────────────────────────────────────────────────────────

@ws_router.get("/security/scan")
async def azure_security_scan(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """
    Runs basic security checks on the configured Azure subscription:
    - Storage Accounts with public blob access enabled
    - NSG rules allowing SSH/RDP from any source
    - VMs without Azure Disk Encryption
    """
    account = (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.provider == "azure",
            CloudAccount.is_active == True,
        )
        .order_by(CloudAccount.created_at.desc())
        .first()
    )
    if not account:
        raise HTTPException(status_code=400, detail="Nenhuma conta Azure configurada neste workspace.")

    creds = decrypt_credential(account.encrypted_data)
    scanner = AzureSecurityScanner(
        subscription_id=creds.get("subscription_id", ""),
        tenant_id=creds.get("tenant_id", ""),
        client_id=creds.get("client_id", ""),
        client_secret=creds.get("client_secret", ""),
    )
    findings = scanner.scan_all()

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: order.get(f.get("severity", "low"), 3))

    return {
        "findings": findings,
        "total": len(findings),
        "scanned_at": datetime.utcnow().isoformat(),
        "provider": "azure",
    }


@ws_router.get("/metrics")
async def ws_get_azure_metrics(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Returns CPU metrics for running Azure VMs (last 1 hour)."""
    try:
        svc = _get_single_azure_service(member, db)
        return svc.get_metrics()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Backup (Managed Disk Snapshots) ─────────────────────────────────────────

from pydantic import BaseModel as _BM
from azure.mgmt.compute.models import Snapshot, CreationData, DiskCreateOption

class CreateAzureSnapshotRequest(_BM):
    resource_group: str
    source_resource_id: str
    snapshot_name: str
    location: str


@ws_router.get("/backups/snapshots")
async def ws_list_azure_snapshots(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List all managed disk snapshots in the subscription."""
    svc = _get_single_azure_service(member, db)
    try:
        snapshots = []
        for s in svc.compute_client.snapshots.list():
            rg = ""
            try:
                rg = s.id.split("/resourceGroups/")[1].split("/")[0]
            except Exception:
                pass
            snapshots.append({
                "snapshot_id": s.id,
                "name": s.name,
                "resource_group": rg,
                "location": s.location,
                "disk_size_gb": s.disk_size_gb,
                "provisioning_state": s.provisioning_state,
                "time_created": s.time_created.isoformat() if s.time_created else None,
                "source_resource_id": s.creation_data.source_resource_id if s.creation_data else None,
                "sku_name": s.sku.name if s.sku else None,
                "tags": s.tags or {},
            })
        snapshots.sort(key=lambda x: x["time_created"] or "", reverse=True)
        return {"snapshots": snapshots}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/backups/snapshots")
async def ws_create_azure_snapshot(
    body: CreateAzureSnapshotRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Create a managed disk snapshot."""
    svc = _get_single_azure_service(member, db)
    try:
        snapshot_body = Snapshot(
            location=body.location,
            creation_data=CreationData(
                create_option=DiskCreateOption.COPY,
                source_resource_id=body.source_resource_id,
            ),
        )
        result = svc.compute_client.snapshots.begin_create_or_update(
            body.resource_group, body.snapshot_name, snapshot_body
        ).result()
        log_activity(db, member.user, "backup.create", "AZURE_SNAPSHOT",
                     resource_id=result.id, resource_name=body.snapshot_name,
                     provider="azure", organization_id=member.organization_id, workspace_id=member.workspace_id)
        return {
            "snapshot_id": result.id,
            "name": result.name,
            "provisioning_state": result.provisioning_state,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/backups/snapshots/{resource_group}/{snapshot_name}")
async def ws_delete_azure_snapshot(
    resource_group: str,
    snapshot_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    """Delete a managed disk snapshot."""
    svc = _get_single_azure_service(member, db)
    try:
        svc.compute_client.snapshots.begin_delete(resource_group, snapshot_name).result()
        log_activity(db, member.user, "backup.delete", "AZURE_SNAPSHOT",
                     resource_id=snapshot_name, resource_name=snapshot_name,
                     provider="azure", organization_id=member.organization_id, workspace_id=member.workspace_id)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/backups/disks")
async def ws_list_azure_disks(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List all managed disks in the subscription (for snapshot source picker)."""
    svc = _get_single_azure_service(member, db)
    try:
        disks = []
        for d in svc.compute_client.disks.list():
            rg = ""
            try:
                rg = d.id.split("/resourceGroups/")[1].split("/")[0]
            except Exception:
                pass
            disks.append({
                "id": d.id,
                "name": d.name,
                "resource_group": rg,
                "location": d.location,
                "disk_size_gb": d.disk_size_gb,
                "os_type": str(d.os_type) if d.os_type else None,
                "disk_state": d.disk_state,
            })
        disks.sort(key=lambda x: (x["resource_group"], x["name"]))
        return {"disks": disks}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Backup — Recovery Services Vault (Azure Backup) ─────────────────────────

class CreateVaultRequest(_BM):
    resource_group: str
    vault_name: str
    location: str

class CreateBackupPolicyRequest(_BM):
    policy_name: str
    schedule_run_times: list[str]        # ISO-8601, ex: ["2024-01-01T02:00:00Z"]
    schedule_run_frequency: str = "Daily"  # "Daily" | "Weekly"
    instant_rp_retention_range_in_days: int = 2
    daily_retention_duration: int = 30

class EnableVMBackupRequest(_BM):
    vm_id: str       # ARM resource ID completo da VM
    vm_rg: str
    vm_name: str
    policy_name: str

class BackupNowRequest(_BM):
    vm_rg: str
    vm_name: str
    retention_days: int = 30


@ws_router.get("/backups/vaults")
async def ws_list_azure_vaults(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List all Recovery Services Vaults in the subscription."""
    svc = _get_single_azure_service(member, db)
    try:
        vaults = []
        for v in svc.recovery_services_client.vaults.list_by_subscription_id():
            rg = ""
            try:
                rg = v.id.split("/resourceGroups/")[1].split("/")[0]
            except Exception:
                pass
            vaults.append({
                "id": v.id,
                "name": v.name,
                "resource_group": rg,
                "location": v.location,
                "provisioning_state": v.properties.provisioning_state if v.properties else None,
                "sku": v.sku.name if v.sku else None,
            })
        vaults.sort(key=lambda x: x["name"])
        return {"vaults": vaults}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/backups/vaults")
async def ws_create_azure_vault(
    body: CreateVaultRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Create a Recovery Services Vault."""
    svc = _get_single_azure_service(member, db)
    try:
        from azure.mgmt.recoveryservices.models import Vault, VaultProperties, Sku
        vault_body = Vault(
            location=body.location,
            sku=Sku(name="Standard"),
            properties=VaultProperties(),
        )
        poller = svc.recovery_services_client.vaults.begin_create_or_update(
            body.resource_group, body.vault_name, vault_body
        )
        result = poller.result()
        log_activity(db, member.user, "backup.create", "AZURE_VAULT",
                     resource_id=result.id, resource_name=body.vault_name,
                     provider="azure", organization_id=member.organization_id, workspace_id=member.workspace_id)
        return {"id": result.id, "name": result.name, "provisioning_state": result.properties.provisioning_state if result.properties else None}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/backups/vaults/{vault_rg}/{vault_name}/policies")
async def ws_list_backup_policies(
    vault_rg: str,
    vault_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List backup policies in a Recovery Services Vault."""
    svc = _get_single_azure_service(member, db)
    try:
        policies = []
        for p in svc.backup_client.backup_policies.list(vault_name, vault_rg):
            props = p.properties
            schedule_freq = None
            schedule_time = None
            retention_daily = None
            instant_rp_days = None
            try:
                if hasattr(props, "schedule_policy") and props.schedule_policy:
                    sp = props.schedule_policy
                    schedule_freq = getattr(sp, "schedule_run_frequency", None)
                    times = getattr(sp, "schedule_run_times", None)
                    schedule_time = times[0].isoformat() if times else None
                if hasattr(props, "retention_policy") and props.retention_policy:
                    rp = props.retention_policy
                    if hasattr(rp, "daily_schedule") and rp.daily_schedule:
                        rd = rp.daily_schedule.retention_duration
                        retention_daily = getattr(rd, "count", None)
                instant_rp_days = getattr(props, "instant_rp_retention_range_in_days", None)
            except Exception:
                pass
            policies.append({
                "name": p.name,
                "id": p.id,
                "type": type(props).__name__ if props else None,
                "schedule_frequency": schedule_freq,
                "schedule_time": schedule_time,
                "retention_daily_count": retention_daily,
                "instant_rp_days": instant_rp_days,
            })
        return {"policies": policies}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/backups/vaults/{vault_rg}/{vault_name}/policies")
async def ws_create_backup_policy(
    vault_rg: str,
    vault_name: str,
    body: CreateBackupPolicyRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Create a custom backup policy in a Recovery Services Vault."""
    svc = _get_single_azure_service(member, db)
    try:
        from azure.mgmt.recoveryservicesbackup.models import (
            ProtectionPolicyResource, AzureIaaSVMProtectionPolicy,
            SimpleSchedulePolicy, LongTermRetentionPolicy,
            RetentionDuration, RetentionDurationType, ScheduleRunType,
            DailyRetentionSchedule,
        )
        from datetime import datetime as _dt
        run_times = [_dt.fromisoformat(t.replace("Z", "+00:00")) for t in body.schedule_run_times]
        policy = ProtectionPolicyResource(
            properties=AzureIaaSVMProtectionPolicy(
                instant_rp_retention_range_in_days=body.instant_rp_retention_range_in_days,
                schedule_policy=SimpleSchedulePolicy(
                    schedule_run_frequency=ScheduleRunType(body.schedule_run_frequency),
                    schedule_run_times=run_times,
                ),
                retention_policy=LongTermRetentionPolicy(
                    daily_schedule=DailyRetentionSchedule(
                        retention_times=run_times,
                        retention_duration=RetentionDuration(
                            count=body.daily_retention_duration,
                            duration_type=RetentionDurationType.DAYS,
                        ),
                    )
                ),
            )
        )
        result = svc.backup_client.protection_policies.create_or_update(
            vault_name, vault_rg, body.policy_name, policy
        )
        log_activity(db, member.user, "backup.create", "AZURE_BACKUP_POLICY",
                     resource_name=body.policy_name, provider="azure",
                     organization_id=member.organization_id, workspace_id=member.workspace_id)
        return {"name": result.name, "id": result.id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/backups/vaults/{vault_rg}/{vault_name}/items")
async def ws_list_protected_items(
    vault_rg: str,
    vault_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List VMs protected by Azure Backup in a vault."""
    svc = _get_single_azure_service(member, db)
    try:
        items = []
        for item in svc.backup_client.backup_protected_items.list(
            vault_name, vault_rg,
            filter="backupManagementType eq 'AzureIaasVM' and itemType eq 'VM'",
        ):
            props = item.properties
            vm_name = None
            vm_rg = None
            policy_name = None
            last_backup_time = None
            try:
                if item.name:
                    parts = item.name.split(";")
                    if len(parts) >= 4:
                        vm_rg = parts[2]
                        vm_name = parts[3]
                policy_id = getattr(props, "policy_id", None)
                if policy_id:
                    policy_name = policy_id.split("/")[-1]
                lbt = getattr(props, "last_backup_time", None)
                last_backup_time = lbt.isoformat() if lbt else None
            except Exception:
                pass
            items.append({
                "name": item.name,
                "vm_name": vm_name or getattr(props, "friendly_name", None),
                "resource_group": vm_rg,
                "protection_status": getattr(props, "protection_status", None),
                "protection_state": str(getattr(props, "protection_state", None)),
                "last_backup_status": str(getattr(props, "last_backup_status", None)),
                "last_backup_time": last_backup_time,
                "policy_name": policy_name,
                "health_status": str(getattr(props, "health_status", None)),
            })
        return {"items": items}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/backups/vaults/{vault_rg}/{vault_name}/protect")
async def ws_enable_vm_backup(
    vault_rg: str,
    vault_name: str,
    body: EnableVMBackupRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Enable Azure Backup for a VM."""
    svc = _get_single_azure_service(member, db)
    try:
        from azure.mgmt.recoveryservicesbackup.models import (
            ProtectedItemResource, AzureIaaSComputeVMProtectedItem,
        )
        fabric = "Azure"
        container_name = f"IaasVMContainer;iaasvmcontainerv2;{body.vm_rg};{body.vm_name}"
        item_name = f"VM;iaasvmcontainerv2;{body.vm_rg};{body.vm_name}"
        policy_id = (
            f"/subscriptions/{svc.subscription_id}/resourceGroups/{vault_rg}"
            f"/providers/Microsoft.RecoveryServices/vaults/{vault_name}"
            f"/backupPolicies/{body.policy_name}"
        )
        protected_item = ProtectedItemResource(
            properties=AzureIaaSComputeVMProtectedItem(
                policy_id=policy_id,
                source_resource_id=body.vm_id,
            )
        )
        svc.backup_client.protected_items.begin_create_or_update(
            vault_name, vault_rg, fabric, container_name, item_name, protected_item
        ).result()
        log_activity(db, member.user, "backup.create", "AZURE_VM_BACKUP",
                     resource_name=body.vm_name, provider="azure",
                     organization_id=member.organization_id, workspace_id=member.workspace_id)
        return {"enabled": True, "vm_name": body.vm_name, "policy_name": body.policy_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/backups/vaults/{vault_rg}/{vault_name}/backup-now")
async def ws_trigger_backup_now(
    vault_rg: str,
    vault_name: str,
    body: BackupNowRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Trigger an on-demand backup for a VM."""
    svc = _get_single_azure_service(member, db)
    try:
        from azure.mgmt.recoveryservicesbackup.models import (
            BackupRequestResource, IaasVMBackupRequest,
        )
        from datetime import datetime, timezone, timedelta
        fabric = "Azure"
        container_name = f"IaasVMContainer;iaasvmcontainerv2;{body.vm_rg};{body.vm_name}"
        item_name = f"VM;iaasvmcontainerv2;{body.vm_rg};{body.vm_name}"
        svc.backup_client.backups.begin_trigger(
            vault_name, vault_rg, fabric, container_name, item_name,
            BackupRequestResource(
                properties=IaasVMBackupRequest(
                    recovery_point_expiry_time_in_utc=datetime.now(timezone.utc) + timedelta(days=body.retention_days)
                )
            ),
        ).result()
        log_activity(db, member.user, "backup.create", "AZURE_BACKUP_JOB",
                     resource_name=body.vm_name, provider="azure",
                     organization_id=member.organization_id, workspace_id=member.workspace_id)
        return {"triggered": True, "vm_name": body.vm_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/backups/vaults/{vault_rg}/{vault_name}/jobs")
async def ws_list_backup_jobs(
    vault_rg: str,
    vault_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List recent backup jobs in a Recovery Services Vault."""
    svc = _get_single_azure_service(member, db)
    try:
        jobs = []
        for j in svc.backup_client.backup_jobs.list(vault_name, vault_rg):
            props = j.properties
            vm_name = None
            start_time = None
            end_time = None
            duration = None
            try:
                entity = getattr(props, "entity_friendly_name", None)
                vm_name = entity
                st = getattr(props, "start_time", None)
                et = getattr(props, "end_time", None)
                start_time = st.isoformat() if st else None
                end_time = et.isoformat() if et else None
                if st and et:
                    secs = int((et - st).total_seconds())
                    duration = f"{secs // 60}m {secs % 60}s"
            except Exception:
                pass
            jobs.append({
                "job_id": j.name,
                "operation": getattr(props, "operation", None),
                "status": getattr(props, "status", None),
                "vm_name": vm_name,
                "start_time": start_time,
                "end_time": end_time,
                "duration": duration,
            })
        return {"jobs": jobs}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
