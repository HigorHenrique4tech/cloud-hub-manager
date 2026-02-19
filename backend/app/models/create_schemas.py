"""
Pydantic schemas for cloud resource creation requests.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict


# ── AWS EC2 ─────────────────────────────────────────────────────────────────

class EbsVolume(BaseModel):
    device_name: str = "/dev/sda1"
    volume_size_gb: int = 20
    volume_type: str = "gp3"
    iops: Optional[int] = None
    throughput: Optional[int] = None
    delete_on_termination: bool = True
    encrypted: bool = False


class CreateEC2Request(BaseModel):
    name: str
    image_id: str
    instance_type: str = "t3.micro"
    key_name: Optional[str] = None
    security_group_ids: List[str] = []
    subnet_id: Optional[str] = None
    volumes: List[EbsVolume] = []
    user_data: Optional[str] = None
    iam_instance_profile: Optional[str] = None
    associate_public_ip: bool = False
    tags: Dict[str, str] = {}


# ── AWS S3 ──────────────────────────────────────────────────────────────────

class CreateS3BucketRequest(BaseModel):
    bucket_name: str
    region: str = "us-east-1"
    versioning_enabled: bool = False
    encryption_algorithm: str = "AES256"
    kms_key_id: Optional[str] = None
    block_public_acls: bool = True
    block_public_policy: bool = True
    ignore_public_acls: bool = True
    restrict_public_buckets: bool = True
    tags: Dict[str, str] = {}


# ── AWS RDS ─────────────────────────────────────────────────────────────────

class CreateRDSRequest(BaseModel):
    db_instance_identifier: str
    engine: str = "mysql"
    engine_version: Optional[str] = None
    db_instance_class: str = "db.t3.micro"
    allocated_storage_gb: int = 20
    storage_type: str = "gp3"
    iops: Optional[int] = None
    multi_az: bool = False
    db_name: Optional[str] = None
    master_username: str
    master_password: str
    vpc_security_group_ids: List[str] = []
    db_subnet_group_name: Optional[str] = None
    publicly_accessible: bool = False
    backup_retention_days: int = 7
    storage_encrypted: bool = True
    auto_minor_version_upgrade: bool = True
    deletion_protection: bool = False
    tags: Dict[str, str] = {}


# ── AWS Lambda ──────────────────────────────────────────────────────────────

class LambdaEnvironmentVar(BaseModel):
    key: str
    value: str


class CreateLambdaRequest(BaseModel):
    function_name: str
    runtime: str = "python3.12"
    handler: str = "lambda_function.lambda_handler"
    role_arn: str
    code_zip_base64: Optional[str] = None
    code_s3_bucket: Optional[str] = None
    code_s3_key: Optional[str] = None
    description: Optional[str] = None
    memory_size_mb: int = Field(default=128, ge=128, le=10240)
    timeout_seconds: int = Field(default=3, ge=1, le=900)
    environment_variables: List[LambdaEnvironmentVar] = []
    layers: List[str] = []
    tags: Dict[str, str] = {}


# ── AWS VPC ─────────────────────────────────────────────────────────────────

class VPCSubnet(BaseModel):
    cidr_block: str
    availability_zone: Optional[str] = None
    name: Optional[str] = None
    is_public: bool = False


class CreateVPCRequest(BaseModel):
    name: str
    cidr_block: str = "10.0.0.0/16"
    enable_dns_support: bool = True
    enable_dns_hostnames: bool = True
    tenancy: str = "default"
    subnets: List[VPCSubnet] = []
    tags: Dict[str, str] = {}


# ── Azure VM ────────────────────────────────────────────────────────────────

class AzureDataDisk(BaseModel):
    name: str
    disk_size_gb: int = 32
    lun: int = 0
    storage_account_type: str = "Standard_LRS"


class CreateAzureVMRequest(BaseModel):
    name: str
    resource_group: str
    location: str
    vm_size: str = "Standard_B1s"
    image_publisher: str = "Canonical"
    image_offer: str = "0001-com-ubuntu-server-jammy"
    image_sku: str = "22_04-lts-gen2"
    image_version: str = "latest"
    admin_username: str
    admin_password: Optional[str] = None
    ssh_public_key: Optional[str] = None
    vnet_name: Optional[str] = None
    subnet_name: Optional[str] = None
    create_public_ip: bool = False
    os_disk_type: str = "Standard_LRS"
    os_disk_size_gb: Optional[int] = None
    data_disks: List[AzureDataDisk] = []
    tags: Dict[str, str] = {}


# ── Azure Storage Account ──────────────────────────────────────────────────

class CreateAzureStorageRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=24, pattern=r"^[a-z0-9]+$")
    resource_group: str
    location: str
    sku: str = "Standard_LRS"
    kind: str = "StorageV2"
    access_tier: str = "Hot"
    enable_https_only: bool = True
    min_tls_version: str = "TLS1_2"
    allow_blob_public_access: bool = False
    tags: Dict[str, str] = {}


# ── Azure VNet ──────────────────────────────────────────────────────────────

class AzureSubnetDef(BaseModel):
    name: str
    address_prefix: str


class CreateAzureVNetRequest(BaseModel):
    name: str
    resource_group: str
    location: str
    address_prefixes: List[str] = ["10.0.0.0/16"]
    subnets: List[AzureSubnetDef] = []
    tags: Dict[str, str] = {}


# ── Azure SQL Database ─────────────────────────────────────────────────────

class CreateAzureSQLRequest(BaseModel):
    server_name: str
    resource_group: str
    location: str
    admin_login: str
    admin_password: str
    database_name: str
    sku_name: str = "Basic"
    max_size_bytes: Optional[int] = None
    collation: str = "SQL_Latin1_General_CP1_CI_AS"
    tags: Dict[str, str] = {}


# ── Azure App Service ──────────────────────────────────────────────────────

class CreateAzureAppServiceRequest(BaseModel):
    name: str
    resource_group: str
    location: str
    runtime: str
    plan_name: Optional[str] = None
    plan_sku: str = "F1"
    always_on: bool = False
    tags: Dict[str, str] = {}
