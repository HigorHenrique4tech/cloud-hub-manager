import asyncio

from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from app.services import AzureService
from app.models.db_models import CloudAccount
from app.models.create_schemas import (
    CreateAzureVMRequest, CreateAzureStorageRequest, CreateAzureVNetRequest,
    CreateAzureSQLRequest, CreateAzureAppServiceRequest,
    CreateSubnetRequest, UpdateSubnetRequest, CreateVNetPeeringRequest,
)
from app.core.dependencies import require_permission
from app.core.auth_context import MemberContext
from app.database import get_db, SessionLocal
from app.services.auth_service import decrypt_credential, decrypt_for_account
from app.services.log_service import log_activity
from app.services.security_service import AzureSecurityScanner
from app.services.notification_service import push_notification
from app.services import background_task_service as bts
from app.core.cache import cache_get, cache_set, cache_delete
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/azure",
    tags=["Azure (workspace)"],
)


def _build_azure_service_from_account(db: Session, account: CloudAccount) -> AzureService:
    data = decrypt_for_account(db, account)
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


async def _run(fn, *args, _timeout=120, **kwargs):
    """Run a synchronous Azure SDK call in a thread pool with timeout."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(fn, *args, **kwargs),
            timeout=_timeout,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail=f"Operação Azure expirou após {_timeout}s")


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
    return _build_azure_service_from_account(db, account)


# ── Connection ──────────────────────────────────────────────────────────────

@ws_router.get("/test-connection")
async def ws_test_azure_connection(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await _run(svc.test_connection)


# ── Helpers for form dropdowns ─────────────────────────────────────────────

@ws_router.get("/locations")
async def ws_list_locations(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await _run(svc.list_locations)


@ws_router.get("/vm-sizes")
async def ws_list_vm_sizes(
    location: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await _run(svc.list_vm_sizes, location)


@ws_router.get("/vm-images/publishers")
async def ws_list_vm_image_publishers(
    location: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await _run(svc.list_vm_image_publishers, location)


@ws_router.get("/vm-images/offers")
async def ws_list_vm_image_offers(
    location: str = Query(...),
    publisher: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await _run(svc.list_vm_image_offers, location, publisher)


@ws_router.get("/vm-images/skus")
async def ws_list_vm_image_skus(
    location: str = Query(...),
    publisher: str = Query(...),
    offer: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await _run(svc.list_vm_image_skus, location, publisher, offer)


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
        _svc = _build_azure_service_from_account(db, account)
        return await _run(_svc.list_virtual_machines)
    cache_key = f"azure:{member.workspace_id}:vms"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.list_virtual_machines)
    cache_set(cache_key, result, ttl=120)
    return result


@ws_router.post("/vms", status_code=202)
async def ws_create_virtual_machine(
    body: CreateAzureVMRequest,
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    task = bts.create_task(
        db, member.workspace_id, member.user.id,
        "azure_vm_create", f"Criar VM: {body.name}"
    )
    log_activity(db, member.user, 'azurevm.create', 'AzureVM',
                 resource_name=body.name, provider='azure',
                 detail=f"Resource group: {body.resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)

    async def _bg():
        bg_db = SessionLocal()
        try:
            bts.set_running(bg_db, task.id)
            result = await _run(svc.create_virtual_machine, body.model_dump())
            if result.get('success'):
                bts.set_completed(bg_db, task.id, result)
            else:
                bts.set_failed(bg_db, task.id, result.get('error', 'Erro desconhecido'))
        except Exception as exc:
            bts.set_failed(bg_db, task.id, str(exc))
        finally:
            bg_db.close()

    cache_delete(f"azure:{member.workspace_id}:vms")
    background_tasks.add_task(_bg)
    return {"task_id": str(task.id), "status": "queued", "label": task.label}


@ws_router.post("/vms/{resource_group}/{vm_name}/start")
async def ws_start_vm(
    resource_group: str, vm_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.start_virtual_machine, resource_group, vm_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to start VM'))
    log_activity(db, member.user, 'azurevm.start', 'AzureVM',
                 resource_name=vm_name, provider='azure', detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    from app.services.notification_channel_service import fire_event as _fire
    _fire(db, member.workspace_id, "resource.started", {
        "resource_name": vm_name, "resource_type": "vm",
        "provider": "azure", "action": "start",
    })
    return result


@ws_router.post("/vms/{resource_group}/{vm_name}/stop")
async def ws_stop_vm(
    resource_group: str, vm_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.stop_virtual_machine, resource_group, vm_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to stop VM'))
    log_activity(db, member.user, 'azurevm.stop', 'AzureVM',
                 resource_name=vm_name, provider='azure', detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    from app.services.notification_channel_service import fire_event as _fire
    _fire(db, member.workspace_id, "resource.stopped", {
        "resource_name": vm_name, "resource_type": "vm",
        "provider": "azure", "action": "stop",
    })
    return result


# ── Resource Groups ───────────────────────────────────────────────────────

@ws_router.get("/resource-groups")
async def ws_list_resource_groups(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.list_resource_groups)
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
    return await _run(svc.list_resource_group_resources, rg_name)


# ── Storage Accounts ─────────────────────────────────────────────────────

@ws_router.get("/storage-accounts")
async def ws_list_storage_accounts(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cache_key = f"azure:{member.workspace_id}:storage"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.list_storage_accounts)
    cache_set(cache_key, result, ttl=180)
    return result


@ws_router.post("/storage-accounts", status_code=202)
async def ws_create_storage_account(
    body: CreateAzureStorageRequest,
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    task = bts.create_task(
        db, member.workspace_id, member.user.id,
        "azure_storage_create", f"Criar Storage Account: {body.name}"
    )
    log_activity(db, member.user, 'storage.create', 'StorageAccount',
                 resource_name=body.name, provider='azure',
                 detail=f"Resource group: {body.resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)

    async def _bg():
        bg_db = SessionLocal()
        try:
            bts.set_running(bg_db, task.id)
            result = await _run(svc.create_storage_account, body.model_dump())
            if result.get('success'):
                bts.set_completed(bg_db, task.id, result)
            else:
                bts.set_failed(bg_db, task.id, result.get('error', 'Erro desconhecido'))
        except Exception as exc:
            bts.set_failed(bg_db, task.id, str(exc))
        finally:
            bg_db.close()

    cache_delete(f"azure:{member.workspace_id}:storage")
    background_tasks.add_task(_bg)
    return {"task_id": str(task.id), "status": "queued", "label": task.label}


# ── VNets ────────────────────────────────────────────────────────────────

@ws_router.get("/vnets")
async def ws_list_vnets(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cache_key = f"azure:{member.workspace_id}:vnets"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.list_vnets)
    cache_set(cache_key, result, ttl=300)
    return result


@ws_router.post("/vnets")
async def ws_create_vnet(
    body: CreateAzureVNetRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.create_vnet, body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar VNet'))
    cache_delete(f"azure:{member.workspace_id}:vnets")
    log_activity(db, member.user, 'vnet.create', 'VNet',
                 resource_name=body.name, provider='azure',
                 detail=f"Resource group: {body.resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── Subnets ──────────────────────────────────────────────────────────────

@ws_router.post("/vnets/{resource_group}/{vnet_name}/subnets")
async def ws_create_subnet(
    resource_group: str,
    vnet_name: str,
    body: CreateSubnetRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.create_subnet, resource_group, vnet_name,
                        body.subnet_name, body.address_prefix, body.nsg_id)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar subnet'))
    cache_delete(f"azure:{member.workspace_id}:vnets")
    log_activity(db, member.user, 'subnet.create', 'Subnet',
                 resource_name=body.subnet_name, provider='azure',
                 detail=f"VNet: {vnet_name}, CIDR: {body.address_prefix}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.put("/vnets/{resource_group}/{vnet_name}/subnets/{subnet_name}")
async def ws_update_subnet(
    resource_group: str,
    vnet_name: str,
    subnet_name: str,
    body: UpdateSubnetRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.update_subnet, resource_group, vnet_name,
                        subnet_name, body.address_prefix, body.nsg_id)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao atualizar subnet'))
    cache_delete(f"azure:{member.workspace_id}:vnets")
    log_activity(db, member.user, 'subnet.update', 'Subnet',
                 resource_name=subnet_name, provider='azure',
                 detail=f"VNet: {vnet_name}, CIDR: {body.address_prefix}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/vnets/{resource_group}/{vnet_name}/subnets/{subnet_name}")
async def ws_delete_subnet(
    resource_group: str,
    vnet_name: str,
    subnet_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.delete_subnet, resource_group, vnet_name, subnet_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao excluir subnet'))
    cache_delete(f"azure:{member.workspace_id}:vnets")
    log_activity(db, member.user, 'subnet.delete', 'Subnet',
                 resource_name=subnet_name, provider='azure',
                 detail=f"VNet: {vnet_name}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── VNet Peering ─────────────────────────────────────────────────────────

@ws_router.get("/vnets/{resource_group}/{vnet_name}/peerings")
async def ws_list_vnet_peerings(
    resource_group: str,
    vnet_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.list_vnet_peerings, resource_group, vnet_name)
    return result


@ws_router.post("/vnets/{resource_group}/{vnet_name}/peerings")
async def ws_create_vnet_peering(
    resource_group: str,
    vnet_name: str,
    body: CreateVNetPeeringRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.create_vnet_peering, resource_group, vnet_name,
                        body.peering_name, body.remote_vnet_id,
                        body.allow_forwarded_traffic, body.allow_gateway_transit,
                        body.use_remote_gateways)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar peering'))
    cache_delete(f"azure:{member.workspace_id}:vnets")
    log_activity(db, member.user, 'peering.create', 'VNetPeering',
                 resource_name=body.peering_name, provider='azure',
                 detail=f"VNet: {vnet_name} → {body.remote_vnet_id.split('/')[-1]}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/vnets/{resource_group}/{vnet_name}/peerings/{peering_name}")
async def ws_delete_vnet_peering(
    resource_group: str,
    vnet_name: str,
    peering_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.delete_vnet_peering, resource_group, vnet_name, peering_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao excluir peering'))
    cache_delete(f"azure:{member.workspace_id}:vnets")
    log_activity(db, member.user, 'peering.delete', 'VNetPeering',
                 resource_name=peering_name, provider='azure',
                 detail=f"VNet: {vnet_name}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── Databases ─────────────────────────────────────────────────────────────

@ws_router.get("/databases")
async def ws_list_databases(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cache_key = f"azure:{member.workspace_id}:databases"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.list_databases)
    cache_set(cache_key, result, ttl=180)
    return result


@ws_router.post("/databases")
async def ws_create_sql_database(
    body: CreateAzureSQLRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.create_sql_database, body.model_dump())
    if not result.get('success'):
        status_code = 400 if result.get('code') == 'REGION_NOT_ALLOWED' else 500
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Erro ao criar banco de dados SQL'))
    cache_delete(f"azure:{member.workspace_id}:databases")
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
    cache_key = f"azure:{member.workspace_id}:appservices"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.list_app_services)
    cache_set(cache_key, result, ttl=180)
    return result


@ws_router.post("/app-services")
async def ws_create_app_service(
    body: CreateAzureAppServiceRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.create_app_service, body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar App Service'))
    cache_delete(f"azure:{member.workspace_id}:appservices")
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
    result = await _run(svc.start_app_service, resource_group, app_name)
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
    result = await _run(svc.stop_app_service, resource_group, app_name)
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
    return await _run(svc.list_subscriptions)


# ── Detail ──────────────────────────────────────────────────────────────────

@ws_router.get("/vms/{resource_group}/{vm_name}")
async def ws_get_vm_detail(
    resource_group: str,
    vm_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.get_vm_detail, resource_group, vm_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da VM'))
    return result


# ── NIC + NSG Endpoints ──────────────────────────────────────────────────────

class NSGRuleCreate(BaseModel):
    rule_name: str = Field(..., min_length=1, max_length=80)
    priority: int = Field(..., ge=100, le=4096)
    direction: str = Field(..., pattern="^(Inbound|Outbound)$")
    access: str = Field(..., pattern="^(Allow|Deny)$")
    protocol: str = Field(..., pattern="^(Tcp|Udp|Icmp|\\*)$")
    source_address: str = Field(default="*")
    source_port: str = Field(default="*")
    dest_address: str = Field(default="*")
    dest_port: str
    description: str = Field(default="")


@ws_router.get("/nics/{resource_group}/{nic_name}")
async def ws_get_nic_detail(
    resource_group: str,
    nic_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Retorna detalhes completos de uma NIC, incluindo NSG e suas regras."""
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.get_nic_detail, resource_group, nic_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da NIC'))
    return result


@ws_router.post("/nsg/{resource_group}/{nsg_name}/rules", status_code=201)
async def ws_add_nsg_rule(
    resource_group: str,
    nsg_name: str,
    body: NSGRuleCreate,
    member: MemberContext = Depends(require_permission("resources.edit")),
    db: Session = Depends(get_db),
):
    """Adiciona ou atualiza uma regra em um NSG."""
    svc = _get_single_azure_service(member, db)
    result = await _run(
        svc.add_nsg_rule,
        resource_group, nsg_name, body.rule_name,
        body.priority, body.direction, body.access, body.protocol,
        body.source_address, body.source_port,
        body.dest_address, body.dest_port, body.description,
    )
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar regra NSG'))
    log_activity(db, member.user, "nsg.rule.create", "NSGRule",
                 resource_name=f"{nsg_name}/{body.rule_name}")
    return result


@ws_router.delete("/nsg/{resource_group}/{nsg_name}/rules/{rule_name}", status_code=200)
async def ws_delete_nsg_rule(
    resource_group: str,
    nsg_name: str,
    rule_name: str,
    member: MemberContext = Depends(require_permission("resources.edit")),
    db: Session = Depends(get_db),
):
    """Remove uma regra de um NSG."""
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.delete_nsg_rule, resource_group, nsg_name, rule_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao excluir regra NSG'))
    log_activity(db, member.user, "nsg.rule.delete", "NSGRule",
                 resource_name=f"{nsg_name}/{rule_name}")
    return result


@ws_router.get("/databases/{resource_group}/{server_name}")
async def ws_get_sql_server_detail(
    resource_group: str,
    server_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.get_sql_server_detail, resource_group, server_name)
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
    result = await _run(svc.get_app_service_detail, resource_group, app_name)
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
    result = await _run(svc.get_storage_account_detail, resource_group, account_name)
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
    result = await _run(svc.get_vnet_detail, resource_group, vnet_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da VNet'))
    return result


# ── Delete (all run in background) ──────────────────────────────────────────

def _make_delete_bg(db_factory, task_id, svc_fn, *args):
    """Returns an async background coroutine that runs svc_fn and updates the task."""
    async def _bg():
        bg_db = db_factory()
        try:
            bts.set_running(bg_db, task_id)
            result = await _run(svc_fn, *args)
            if result.get('success'):
                bts.set_completed(bg_db, task_id, result)
            else:
                bts.set_failed(bg_db, task_id, result.get('error', 'Erro desconhecido'))
        except Exception as exc:
            bts.set_failed(bg_db, task_id, str(exc))
        finally:
            bg_db.close()
    return _bg


@ws_router.delete("/vms/{resource_group}/{vm_name}", status_code=202)
async def ws_delete_azure_vm(
    resource_group: str,
    vm_name: str,
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    task = bts.create_task(db, member.workspace_id, member.user.id,
                           "azure_vm_delete", f"Excluir VM: {vm_name}")
    log_activity(db, member.user, 'vm.delete', 'AzureVM',
                 resource_name=vm_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    cache_delete(f"azure:{member.workspace_id}:vms")
    background_tasks.add_task(_make_delete_bg(SessionLocal, task.id, svc.delete_virtual_machine, resource_group, vm_name))
    return {"task_id": str(task.id), "status": "queued", "label": task.label}


@ws_router.delete("/storage-accounts/{resource_group}/{account_name}", status_code=202)
async def ws_delete_azure_storage(
    resource_group: str,
    account_name: str,
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    task = bts.create_task(db, member.workspace_id, member.user.id,
                           "azure_storage_delete", f"Excluir Storage Account: {account_name}")
    log_activity(db, member.user, 'storage.delete', 'AzureStorage',
                 resource_name=account_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    cache_delete(f"azure:{member.workspace_id}:storage")
    background_tasks.add_task(_make_delete_bg(SessionLocal, task.id, svc.delete_storage_account, resource_group, account_name))
    return {"task_id": str(task.id), "status": "queued", "label": task.label}


@ws_router.delete("/vnets/{resource_group}/{vnet_name}", status_code=202)
async def ws_delete_azure_vnet(
    resource_group: str,
    vnet_name: str,
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    task = bts.create_task(db, member.workspace_id, member.user.id,
                           "azure_vnet_delete", f"Excluir VNet: {vnet_name}")
    log_activity(db, member.user, 'vnet.delete', 'AzureVNet',
                 resource_name=vnet_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    cache_delete(f"azure:{member.workspace_id}:vnets")
    background_tasks.add_task(_make_delete_bg(SessionLocal, task.id, svc.delete_virtual_network, resource_group, vnet_name))
    return {"task_id": str(task.id), "status": "queued", "label": task.label}


@ws_router.delete("/databases/{resource_group}/{server_name}", status_code=202)
async def ws_delete_azure_sql_server(
    resource_group: str,
    server_name: str,
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    task = bts.create_task(db, member.workspace_id, member.user.id,
                           "azure_sql_delete", f"Excluir SQL Server: {server_name}")
    log_activity(db, member.user, 'sql.delete', 'AzureSQL',
                 resource_name=server_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    cache_delete(f"azure:{member.workspace_id}:databases")
    background_tasks.add_task(_make_delete_bg(SessionLocal, task.id, svc.delete_sql_server, resource_group, server_name))
    return {"task_id": str(task.id), "status": "queued", "label": task.label}


@ws_router.delete("/app-services/{resource_group}/{app_name}", status_code=202)
async def ws_delete_azure_app_service(
    resource_group: str,
    app_name: str,
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    task = bts.create_task(db, member.workspace_id, member.user.id,
                           "azure_appservice_delete", f"Excluir App Service: {app_name}")
    log_activity(db, member.user, 'appservice.delete', 'AzureAppService',
                 resource_name=app_name, provider='azure',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    cache_delete(f"azure:{member.workspace_id}:appservices")
    background_tasks.add_task(_make_delete_bg(SessionLocal, task.id, svc.delete_app_service, resource_group, app_name))
    return {"task_id": str(task.id), "status": "queued", "label": task.label}


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
        svc = _build_azure_service_from_account(db, account)
    else:
        try:
            svc = _get_single_azure_service(member, db)
        except HTTPException:
            return {"success": True, "total": 0, "by_service": [], "daily": [], "currency": "USD"}
    result = await _run(svc.get_cost_by_subscription, start_date, end_date, granularity.capitalize())
    if not result.get('success'):
        error_msg = result.get('error', '')
        if '429' in error_msg:
            # Rate limited — return empty data instead of 500
            logger.warning("Azure Cost Management rate-limited, returning empty data")
            return {"success": True, "total": 0, "by_service": [], "daily": [], "currency": "USD",
                    "warning": "Dados de custo temporariamente indisponiveis (rate limit). Tente novamente em alguns minutos."}
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter dados de custo Azure'))
    return result


# ── Cost Drill-down ──────────────────────────────────────────────────────────

@ws_router.get("/costs/resources")
async def ws_get_azure_cost_resources(
    service: str = Query(..., description="Azure service name (e.g. 'Virtual Machines')"),
    start_date: str = Query(...),
    end_date: str = Query(...),
    member: MemberContext = Depends(require_permission("costs.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await _run(svc.get_cost_by_resource, service, start_date, end_date)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter custos por recurso Azure'))
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

    creds = decrypt_for_account(db, account)
    scanner = AzureSecurityScanner(
        subscription_id=creds.get("subscription_id", ""),
        tenant_id=creds.get("tenant_id", ""),
        client_id=creds.get("client_id", ""),
        client_secret=creds.get("client_secret", ""),
    )
    findings = scanner.scan_all()

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: order.get(f.get("severity", "low"), 3))

    critical = sum(1 for f in findings if f.get("severity") in ("critical", "high"))
    if critical > 0:
        push_notification(
            db, member.workspace_id, "security",
            f"Scan de segurança Azure: {critical} finding(s) crítico(s)/alto(s) encontrado(s).",
            "/security",
        )

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
            properties=VaultProperties(public_network_access="Enabled"),
        )
        # Fire-and-forget — vault provisioning takes ~60s on Azure side; no need to block
        svc.recovery_services_client.vaults.begin_create_or_update(
            body.resource_group, body.vault_name, vault_body
        )
        log_activity(db, member.user, "backup.create", "AZURE_VAULT",
                     resource_name=body.vault_name,
                     provider="azure", organization_id=member.organization_id, workspace_id=member.workspace_id)
        return {"name": body.vault_name, "resource_group": body.resource_group, "provisioning_state": "Creating"}
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
        svc.backup_client.protected_items.create_or_update(
            vault_name, vault_rg, fabric, container_name, item_name, protected_item
        )
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
        svc.backup_client.backups.trigger(
            vault_name, vault_rg, fabric, container_name, item_name,
            BackupRequestResource(
                properties=IaasVMBackupRequest(
                    recovery_point_expiry_time_in_utc=datetime.now(timezone.utc) + timedelta(days=body.retention_days)
                )
            ),
        )
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


# ── Azure Advisor ────────────────────────────────────────────────────────────

def _build_advisor_service(member: MemberContext, db: Session):
    """Build an AzureAdvisorService from workspace credentials."""
    from app.services.azure_advisor_service import AzureAdvisorService
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
    creds = decrypt_for_account(db, account)
    return AzureAdvisorService(
        subscription_id=creds.get("subscription_id", ""),
        tenant_id=creds.get("tenant_id", ""),
        client_id=creds.get("client_id", ""),
        client_secret=creds.get("client_secret", ""),
    )


@ws_router.get("/advisor/summary")
async def ws_advisor_summary(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Get Azure Advisor summary (counts by category and impact)."""
    try:
        advisor = _build_advisor_service(member, db)
        return await asyncio.to_thread(advisor.get_summary)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/advisor/recommendations")
async def ws_advisor_recommendations(
    category: Optional[str] = Query(None, description="Cost, Security, HighAvailability, OperationalExcellence, Performance"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List Azure Advisor recommendations, optionally filtered by category."""
    try:
        advisor = _build_advisor_service(member, db)
        recs = await asyncio.to_thread(advisor.list_recommendations, category)
        # Sort by impact: high > medium > low
        order = {"high": 0, "medium": 1, "low": 2}
        recs.sort(key=lambda r: order.get(r.get("impact", "low"), 2))
        return {"recommendations": recs, "total": len(recs)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/advisor/refresh")
async def ws_advisor_refresh(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Trigger Azure Advisor to refresh recommendations."""
    try:
        advisor = _build_advisor_service(member, db)
        await asyncio.to_thread(advisor.generate_recommendations)
        return {"success": True, "message": "Recomendações do Advisor sendo atualizadas. Aguarde alguns minutos."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Backup Validation (coverage / unprotected VMs / health) ──────────────────

def _build_backup_validation(member: MemberContext, db: Session):
    from app.services.backup_validation_service import BackupValidationService
    svc = _get_single_azure_service(member, db)
    return BackupValidationService(svc)


@ws_router.get("/backup-validation/coverage")
async def ws_backup_coverage(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """
    Returns a summary of backup coverage across all Recovery Services Vaults:
    total VMs, protected, unprotected, coverage %, healthy/stale/failing counts.
    """
    bv = _build_backup_validation(member, db)
    try:
        return await asyncio.to_thread(bv.get_coverage_summary)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/backup-validation/unprotected")
async def ws_backup_unprotected(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Returns list of VMs with no backup coverage (risk=critical)."""
    bv = _build_backup_validation(member, db)
    try:
        items = await asyncio.to_thread(bv.get_unprotected_vms)
        return {"items": items, "total": len(items)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/backup-validation/health")
async def ws_backup_health(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """
    Returns all protected VMs with health classification:
    ok, medium (stale restore point >7d), high (failing >3d).
    """
    bv = _build_backup_validation(member, db)
    try:
        items = await asyncio.to_thread(bv.get_backup_health)
        return {"items": items, "total": len(items)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/backup-validation/scan")
async def ws_backup_scan(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """
    Triggers an on-demand backup coverage scan and returns the summary.
    Also fires notifications if unprotected or failing VMs are found.
    """
    from app.services.notification_service import push_notification

    bv = _build_backup_validation(member, db)
    try:
        summary = await asyncio.to_thread(bv.get_coverage_summary)

        if summary["unprotected_vms"] > 0:
            push_notification(
                db, member.workspace_id, "backup_alert",
                f"{summary['unprotected_vms']} VM(s) sem backup detectada(s). "
                f"Cobertura atual: {summary['coverage_pct']}%",
            )
        if summary["failing_backups"] > 0:
            push_notification(
                db, member.workspace_id, "backup_warning",
                f"{summary['failing_backups']} backup(s) com falha ou restore point desatualizado.",
            )

        log_activity(
            db, member.user, "backup.scan", "AZURE_BACKUP_VALIDATION",
            resource_name="coverage-scan", provider="azure",
            organization_id=member.organization_id,
            workspace_id=member.workspace_id,
        )
        return {**summary, "notifications_sent": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
