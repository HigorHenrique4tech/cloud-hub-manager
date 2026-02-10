from fastapi import APIRouter, HTTPException, Depends
from app.services import AzureService
from app.models import (
    AzureVMListResponse, 
    AzureResourceGroupListResponse,
    ConnectionTestResponse
)
from app.core import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/azure", tags=["Azure"])


def get_azure_service():
    """Dependency to get Azure service instance"""
    if not all([
        settings.AZURE_SUBSCRIPTION_ID,
        settings.AZURE_TENANT_ID,
        settings.AZURE_CLIENT_ID,
        settings.AZURE_CLIENT_SECRET
    ]):
        raise HTTPException(
            status_code=400,
            detail="Azure credentials not configured. Please set AZURE_* variables in .env file"
        )
    
    return AzureService(
        subscription_id=settings.AZURE_SUBSCRIPTION_ID,
        tenant_id=settings.AZURE_TENANT_ID,
        client_id=settings.AZURE_CLIENT_ID,
        client_secret=settings.AZURE_CLIENT_SECRET
    )


@router.get("/test-connection", response_model=ConnectionTestResponse)
async def test_azure_connection(azure_service: AzureService = Depends(get_azure_service)):
    """
    Test Azure connection and credentials
    """
    result = await azure_service.test_connection()
    return result


@router.get("/vms", response_model=AzureVMListResponse)
async def list_virtual_machines(azure_service: AzureService = Depends(get_azure_service)):
    """
    List all Virtual Machines across all resource groups
    
    Returns:
        List of Azure VMs with their details
    """
    result = await azure_service.list_virtual_machines()
    
    if not result['success'] and result.get('error'):
        logger.warning(f"Error listing Azure VMs: {result['error']}")
    
    return result


@router.get("/resource-groups", response_model=AzureResourceGroupListResponse)
async def list_resource_groups(azure_service: AzureService = Depends(get_azure_service)):
    """
    List all Azure Resource Groups
    
    Returns:
        List of resource groups in the subscription
    """
    result = await azure_service.list_resource_groups()
    
    if not result['success'] and result.get('error'):
        logger.warning(f"Error listing resource groups: {result['error']}")
    
    return result


@router.post("/vms/{resource_group}/{vm_name}/start")
async def start_vm(
    resource_group: str,
    vm_name: str,
    azure_service: AzureService = Depends(get_azure_service)
):
    """
    Start an Azure Virtual Machine
    
    Args:
        resource_group: Resource group name
        vm_name: VM name
    """
    # TODO: Implementar quando necessário
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/vms/{resource_group}/{vm_name}/stop")
async def stop_vm(
    resource_group: str,
    vm_name: str,
    azure_service: AzureService = Depends(get_azure_service)
):
    """
    Stop (deallocate) an Azure Virtual Machine
    
    Args:
        resource_group: Resource group name
        vm_name: VM name
    """
    # TODO: Implementar quando necessário
    raise HTTPException(status_code=501, detail="Not implemented yet")