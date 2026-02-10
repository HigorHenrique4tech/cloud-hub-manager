from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime


class EC2Instance(BaseModel):
    """EC2 Instance model"""
    instance_id: str
    name: str
    instance_type: str
    state: str
    availability_zone: Optional[str] = None
    private_ip: Optional[str] = None
    public_ip: Optional[str] = None
    launch_time: Optional[str] = None


class EC2ListResponse(BaseModel):
    """Response for EC2 list endpoint"""
    success: bool
    region: str
    total_instances: int
    instances: List[EC2Instance]
    error: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str
    timestamp: datetime


class ConnectionTestResponse(BaseModel):
    """Connection test response"""
    success: bool
    message: Optional[str] = None
    region: Optional[str] = None
    error: Optional[str] = None


class AzureVM(BaseModel):
    """Azure Virtual Machine model"""
    vm_id: str
    name: str
    resource_group: str
    location: str
    vm_size: Optional[str] = None
    power_state: str
    os_type: Optional[str] = None
    tags: Dict = {}


class AzureVMListResponse(BaseModel):
    """Response for Azure VM list endpoint"""
    success: bool
    subscription_id: str
    total_vms: int
    virtual_machines: List[AzureVM]
    error: Optional[str] = None


class AzureResourceGroup(BaseModel):
    """Azure Resource Group model"""
    name: str
    location: str
    tags: Dict = {}
    provisioning_state: Optional[str] = None


class AzureResourceGroupListResponse(BaseModel):
    """Response for Azure Resource Group list"""
    success: bool
    total_resource_groups: int
    resource_groups: List[AzureResourceGroup]
    error: Optional[str] = None