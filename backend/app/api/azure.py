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
