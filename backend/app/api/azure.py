from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.services import AzureService
from app.models import AzureVMListResponse, AzureResourceGroupListResponse, ConnectionTestResponse
from app.models.db_models import User, CloudCredential, CloudAccount
from app.core.dependencies import get_current_user, require_permission
from app.core.auth_context import MemberContext
from app.database import get_db
from app.services.auth_service import decrypt_credential
from app.services.log_service import log_activity
import logging

logger = logging.getLogger(__name__)

# ── Legacy router (user-scoped via CloudCredential) ─────────────────────────

router = APIRouter(prefix="/azure", tags=["Azure"])


def get_azure_service(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AzureService:
    """Build AzureService using the user's stored credential (falls back to .env globals)."""
    cred = (
        db.query(CloudCredential)
        .filter(
            CloudCredential.user_id == current_user.id,
            CloudCredential.provider == "azure",
            CloudCredential.is_active == True,
        )
        .order_by(CloudCredential.created_at.desc())
        .first()
    )

    if not cred:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma credencial Azure configurada. Adicione suas credenciais em Configurações."
        )

    data = decrypt_credential(cred.encrypted_data)
    subscription_id = data.get("subscription_id", "")
    tenant_id = data.get("tenant_id", "")
    client_id = data.get("client_id", "")
    client_secret = data.get("client_secret", "")

    if not all([subscription_id, tenant_id, client_id, client_secret]):
        raise HTTPException(
            status_code=400,
            detail="Credencial Azure incompleta. Verifique todos os campos em Configurações."
        )

    return AzureService(
        subscription_id=subscription_id,
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )


@router.get("/test-connection", response_model=ConnectionTestResponse)
async def test_azure_connection(azure_service: AzureService = Depends(get_azure_service)):
    """Test Azure connection and credentials"""
    return await azure_service.test_connection()


@router.get("/vms", response_model=AzureVMListResponse)
async def list_virtual_machines(azure_service: AzureService = Depends(get_azure_service)):
    """List all Virtual Machines across all resource groups"""
    result = await azure_service.list_virtual_machines()
    if not result['success'] and result.get('error'):
        logger.warning(f"Error listing Azure VMs: {result['error']}")
    return result


@router.get("/resource-groups", response_model=AzureResourceGroupListResponse)
async def list_resource_groups(azure_service: AzureService = Depends(get_azure_service)):
    """List all Azure Resource Groups"""
    result = await azure_service.list_resource_groups()
    if not result['success'] and result.get('error'):
        logger.warning(f"Error listing resource groups: {result['error']}")
    return result


@router.post("/vms/{resource_group}/{vm_name}/start")
async def start_vm(
    resource_group: str,
    vm_name: str,
    azure_service: AzureService = Depends(get_azure_service),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start an Azure Virtual Machine"""
    result = await azure_service.start_virtual_machine(resource_group, vm_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to start VM'))
    log_activity(db, current_user, 'azurevm.start', 'AzureVM',
                 resource_name=vm_name, provider='azure',
                 detail=f"Resource group: {resource_group}")
    return result


@router.post("/vms/{resource_group}/{vm_name}/stop")
async def stop_vm(
    resource_group: str,
    vm_name: str,
    azure_service: AzureService = Depends(get_azure_service),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stop (deallocate) an Azure Virtual Machine"""
    result = await azure_service.stop_virtual_machine(resource_group, vm_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to stop VM'))
    log_activity(db, current_user, 'azurevm.stop', 'AzureVM',
                 resource_name=vm_name, provider='azure',
                 detail=f"Resource group: {resource_group}")
    return result


@router.get("/subscriptions")
async def list_subscriptions(azure_service: AzureService = Depends(get_azure_service)):
    """List subscriptions accessible with the stored credential"""
    return await azure_service.list_subscriptions()


@router.get("/resource-groups/{rg_name}/resources")
async def list_rg_resources(
    rg_name: str,
    azure_service: AzureService = Depends(get_azure_service),
):
    """List all resources inside a specific resource group"""
    return await azure_service.list_resource_group_resources(rg_name)


@router.get("/storage-accounts")
async def list_storage_accounts(azure_service: AzureService = Depends(get_azure_service)):
    """List all Storage Accounts in the subscription"""
    return await azure_service.list_storage_accounts()


@router.get("/vnets")
async def list_vnets(azure_service: AzureService = Depends(get_azure_service)):
    """List all Virtual Networks in the subscription"""
    return await azure_service.list_vnets()


@router.get("/databases")
async def list_databases(azure_service: AzureService = Depends(get_azure_service)):
    """List all SQL Servers and their databases"""
    return await azure_service.list_databases()


@router.get("/app-services")
async def list_app_services(azure_service: AzureService = Depends(get_azure_service)):
    """List all App Services (Web Apps) in the subscription"""
    return await azure_service.list_app_services()


@router.post("/app-services/{resource_group}/{app_name}/start")
async def start_app_service(
    resource_group: str,
    app_name: str,
    azure_service: AzureService = Depends(get_azure_service),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start an App Service"""
    result = await azure_service.start_app_service(resource_group, app_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to start App Service'))
    log_activity(db, current_user, 'appservice.start', 'AppService',
                 resource_name=app_name, provider='azure',
                 detail=f"Resource group: {resource_group}")
    return result


@router.post("/app-services/{resource_group}/{app_name}/stop")
async def stop_app_service(
    resource_group: str,
    app_name: str,
    azure_service: AzureService = Depends(get_azure_service),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stop an App Service"""
    result = await azure_service.stop_app_service(resource_group, app_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to stop App Service'))
    log_activity(db, current_user, 'appservice.stop', 'AppService',
                 resource_name=app_name, provider='azure',
                 detail=f"Resource group: {resource_group}")
    return result


# ── Costs ─────────────────────────────────────────────────────────────────────

@router.get("/costs")
async def get_azure_costs(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    granularity: str = Query("Daily", description="Daily or Monthly"),
    azure_service: AzureService = Depends(get_azure_service),
):
    """Get Azure cost and usage data from Cost Management API."""
    result = await azure_service.get_cost_by_subscription(
        start_date=start_date,
        end_date=end_date,
        granularity=granularity.capitalize(),
    )
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter dados de custo Azure'))
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Workspace-scoped router (multi-tenant, RBAC)
# ═══════════════════════════════════════════════════════════════════════════════

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/azure",
    tags=["Azure (workspace)"],
)


def _build_azure_service_from_account(account: CloudAccount) -> AzureService:
    """Build AzureService from a CloudAccount record."""
    data = decrypt_credential(account.encrypted_data)
    subscription_id = data.get("subscription_id", "")
    tenant_id = data.get("tenant_id", "")
    client_id = data.get("client_id", "")
    client_secret = data.get("client_secret", "")

    if not all([subscription_id, tenant_id, client_id, client_secret]):
        raise HTTPException(
            status_code=400,
            detail="Credencial Azure incompleta nesta conta cloud.",
        )
    return AzureService(
        subscription_id=subscription_id,
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )


def _get_single_azure_service(member: MemberContext, db: Session) -> AzureService:
    """Get the first (default) Azure account in the workspace."""
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


# ── VMs ─────────────────────────────────────────────────────────────────────

@ws_router.get("/vms")
async def ws_list_virtual_machines(
    account_id: Optional[str] = Query(None, description="Specific cloud account ID"),
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
        svc = _build_azure_service_from_account(account)
    else:
        svc = _get_single_azure_service(member, db)
    return await svc.list_virtual_machines()


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


@ws_router.post("/vms/{resource_group}/{vm_name}/start")
async def ws_start_vm(
    resource_group: str,
    vm_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.start_virtual_machine(resource_group, vm_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to start VM'))
    log_activity(db, member.user, 'azurevm.start', 'AzureVM',
                 resource_name=vm_name, provider='azure',
                 detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/vms/{resource_group}/{vm_name}/stop")
async def ws_stop_vm(
    resource_group: str,
    vm_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.stop_virtual_machine(resource_group, vm_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to stop VM'))
    log_activity(db, member.user, 'azurevm.stop', 'AzureVM',
                 resource_name=vm_name, provider='azure',
                 detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.get("/subscriptions")
async def ws_list_subscriptions(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_subscriptions()


@ws_router.get("/resource-groups/{rg_name}/resources")
async def ws_list_rg_resources(
    rg_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_resource_group_resources(rg_name)


@ws_router.get("/storage-accounts")
async def ws_list_storage_accounts(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_storage_accounts()


@ws_router.get("/vnets")
async def ws_list_vnets(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_vnets()


@ws_router.get("/databases")
async def ws_list_databases(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_databases()


@ws_router.get("/app-services")
async def ws_list_app_services(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    return await svc.list_app_services()


@ws_router.post("/app-services/{resource_group}/{app_name}/start")
async def ws_start_app_service(
    resource_group: str,
    app_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.start_app_service(resource_group, app_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to start App Service'))
    log_activity(db, member.user, 'appservice.start', 'AppService',
                 resource_name=app_name, provider='azure',
                 detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/app-services/{resource_group}/{app_name}/stop")
async def ws_stop_app_service(
    resource_group: str,
    app_name: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_azure_service(member, db)
    result = await svc.stop_app_service(resource_group, app_name)
    if not result['success']:
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to stop App Service'))
    log_activity(db, member.user, 'appservice.stop', 'AppService',
                 resource_name=app_name, provider='azure',
                 detail=f"Resource group: {resource_group}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── Costs ───────────────────────────────────────────────────────────────────

@ws_router.get("/costs")
async def ws_get_azure_costs(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    granularity: str = Query("Daily", description="Daily or Monthly"),
    account_id: Optional[str] = Query(None, description="Specific cloud account ID"),
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
        start_date=start_date,
        end_date=end_date,
        granularity=granularity.capitalize(),
    )
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter dados de custo Azure'))
    return result
