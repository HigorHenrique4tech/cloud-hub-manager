from pydantic import BaseModel, EmailStr, field_validator
from typing import List, Optional, Dict
from datetime import datetime
from uuid import UUID


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
    subscription_id: Optional[str] = None
    subscriptions_count: Optional[int] = None
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


# ── Auth & User schemas ──────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator('password')
    @classmethod
    def password_max_length(cls, v: str) -> str:
        if len(v.encode('utf-8')) > 72:
            raise ValueError('A senha deve ter no máximo 72 caracteres')
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    is_active: bool
    is_verified: bool = False
    default_org_id: Optional[UUID] = None
    oauth_provider: Optional[str] = None
    avatar_url: Optional[str] = None
    mfa_enabled: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserResponse


# ── MFA schemas ─────────────────────────────────────────────────────────────

class MFARequiredResponse(BaseModel):
    mfa_required: bool = True
    mfa_token: str


class MFAVerifyRequest(BaseModel):
    mfa_token: str
    otp: str  # 6 dígitos como string


class MFAToggleRequest(BaseModel):
    enabled: bool
    password: str  # senha atual para confirmar


# ── Profile update schemas ───────────────────────────────────────────────────

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_max_length(cls, v: str) -> str:
        if len(v.encode('utf-8')) > 72:
            raise ValueError('A senha deve ter no máximo 72 caracteres')
        return v
