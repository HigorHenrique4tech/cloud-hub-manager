"""
Live pricing API — queries AWS Pricing API (boto3) and Azure Retail Prices API (public REST).
All results are cached in-memory for 24 h to avoid repeated external calls.
"""

import json
import time
from typing import List, Optional

import boto3
import httpx
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import get_workspace_member
from app.database import get_db
from app.models.db_models import CloudAccount
from app.services.auth_service import decrypt_credential

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/pricing",
    tags=["pricing"],
)

# ── In-memory TTL cache (24 h) ────────────────────────────────────────────────

_CACHE: dict = {}
_TTL = 86_400  # seconds


def _cget(key: str):
    entry = _CACHE.get(key)
    if entry and time.monotonic() - entry["ts"] < _TTL:
        return entry["v"]
    return None


def _cset(key: str, value):
    _CACHE[key] = {"v": value, "ts": time.monotonic()}


# ── AWS region → pricing display name ────────────────────────────────────────

_AWS_REGIONS = {
    "us-east-1":      "US East (N. Virginia)",
    "us-east-2":      "US East (Ohio)",
    "us-west-1":      "US West (N. California)",
    "us-west-2":      "US West (Oregon)",
    "sa-east-1":      "South America (Sao Paulo)",
    "eu-west-1":      "Europe (Ireland)",
    "eu-west-2":      "Europe (London)",
    "eu-central-1":   "Europe (Frankfurt)",
    "ap-southeast-1": "Asia Pacific (Singapore)",
    "ap-southeast-2": "Asia Pacific (Sydney)",
    "ap-northeast-1": "Asia Pacific (Tokyo)",
    "ap-south-1":     "Asia Pacific (Mumbai)",
    "ca-central-1":   "Canada (Central)",
}

# ── RDS engine spec: (api_engine, edition_or_None, license_display_or_None) ──

_RDS_ENGINES = {
    "mysql":             ("MySQL",             None,          None),
    "postgres":          ("PostgreSQL",        None,          None),
    "mariadb":           ("MariaDB",           None,          None),
    "aurora-mysql":      ("Aurora MySQL",      None,          None),
    "aurora-postgresql": ("Aurora PostgreSQL", None,          None),
    "sqlserver-ex":      ("SQL Server",        "Express",     "SQL Server Express"),
    "sqlserver-web":     ("SQL Server",        "Web",         "SQL Server Web"),
    "sqlserver-se":      ("SQL Server",        "Standard",    "SQL Server SE"),
    "sqlserver-ee":      ("SQL Server",        "Enterprise",  "SQL Server EE"),
    "oracle-ee":         ("Oracle",            "Enterprise",  "Oracle EE"),
    "oracle-se2":        ("Oracle",            "Standard Two","Oracle SE2"),
}

# ── Static fallbacks for storage / non-compute items ─────────────────────────

_EBS_PER_GB  = {"gp2": 0.10, "gp3": 0.08, "io1": 0.125, "io2": 0.125, "st1": 0.045, "sc1": 0.025}
_RDS_STORAGE = {"gp2": 0.115, "gp3": 0.115, "io1": 0.125}
_AZ_DISK_PGB = {"Standard_LRS": 0.04, "StandardSSD_LRS": 0.075, "Premium_LRS": 0.135, "UltraSSD_LRS": 0.25}

_AZ_SQL = {
    "Basic": 4.99,
    "S0": 14.72, "S1": 29.43, "S2": 58.87, "S3": 117.73, "S4": 235.47,
    "P1": 465.08, "P2": 930.16, "P4": 1860.31,
    "GP_Gen5_2": 185.67, "GP_Gen5_4": 371.34, "GP_Gen5_8": 742.68, "GP_Gen5_16": 1485.36,
    "BC_Gen5_2": 557.60, "BC_Gen5_4": 1115.20, "BC_Gen5_8": 2230.40,
}

_AZ_APP = {
    "F1": 0, "D1": 9.49,
    "B1": 12.41, "B2": 24.82, "B3": 49.64,
    "S1": 56.94, "S2": 113.88, "S3": 227.76,
    "P1v2": 67.16, "P2v2": 134.32, "P3v2": 268.64,
    "P1v3": 80.52, "P2v3": 161.04, "P3v3": 322.08,
}

HOURS = 730  # hours per month

# ── Low-level price fetchers ──────────────────────────────────────────────────


def _pricing_client(access_key: str, secret_key: str):
    """boto3 pricing client — always us-east-1 (only endpoint available)."""
    return boto3.client(
        "pricing",
        region_name="us-east-1",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )


def _parse_on_demand(price_list: list) -> Optional[float]:
    """Extract the first non-zero On-Demand USD/hr from a PriceList response."""
    for raw in price_list:
        item = json.loads(raw)
        for term in item.get("terms", {}).get("OnDemand", {}).values():
            for dim in term.get("priceDimensions", {}).values():
                usd = float(dim.get("pricePerUnit", {}).get("USD") or 0)
                if usd > 0:
                    return usd
    return None


def _fetch_ec2(client, instance_type: str, os: str, location: str) -> Optional[float]:
    """Fetch EC2 On-Demand hourly rate. os: 'Linux' | 'Windows'."""
    k = f"ec2:{instance_type}:{os}:{location}"
    if (v := _cget(k)) is not None:
        return v
    try:
        resp = client.get_products(
            ServiceCode="AmazonEC2",
            Filters=[
                {"Type": "TERM_MATCH", "Field": "instanceType",    "Value": instance_type},
                {"Type": "TERM_MATCH", "Field": "operatingSystem", "Value": os},
                {"Type": "TERM_MATCH", "Field": "location",        "Value": location},
                {"Type": "TERM_MATCH", "Field": "tenancy",         "Value": "Shared"},
                {"Type": "TERM_MATCH", "Field": "preInstalledSw",  "Value": "NA"},
                {"Type": "TERM_MATCH", "Field": "capacitystatus",  "Value": "Used"},
            ],
            MaxResults=5,
        )
        price = _parse_on_demand(resp.get("PriceList", []))
    except (ClientError, BotoCoreError):
        return None
    if price:
        _cset(k, price)
    return price


def _fetch_rds(
    client, instance_class: str, db_engine: str, edition: Optional[str],
    multi_az: bool, location: str
) -> Optional[float]:
    """Fetch RDS On-Demand hourly rate."""
    deploy = "Multi-AZ" if multi_az else "Single-AZ"
    k = f"rds:{instance_class}:{db_engine}:{edition}:{multi_az}:{location}"
    if (v := _cget(k)) is not None:
        return v
    try:
        filters = [
            {"Type": "TERM_MATCH", "Field": "instanceType",     "Value": instance_class},
            {"Type": "TERM_MATCH", "Field": "databaseEngine",   "Value": db_engine},
            {"Type": "TERM_MATCH", "Field": "deploymentOption", "Value": deploy},
            {"Type": "TERM_MATCH", "Field": "location",         "Value": location},
        ]
        if edition:
            filters.append({"Type": "TERM_MATCH", "Field": "databaseEdition", "Value": edition})
        resp = client.get_products(ServiceCode="AmazonRDS", Filters=filters, MaxResults=5)
        price = _parse_on_demand(resp.get("PriceList", []))
    except (ClientError, BotoCoreError):
        return None
    if price:
        _cset(k, price)
    return price


def _fetch_azure_vm(size: str, os: str, location: str) -> Optional[float]:
    """
    Fetch Azure VM retail price via public Azure Retail Prices API.
    os: 'Linux' | 'Windows'
    No authentication required.
    """
    k = f"az-vm:{size}:{os}:{location}"
    if (v := _cget(k)) is not None:
        return v
    # "Standard_D4s_v3" → "D4s v3" (API skuName format)
    sku = size.removeprefix("Standard_").replace("_", " ")
    parts = [
        f"armRegionName eq '{location}'",
        f"priceType eq 'Consumption'",
        f"serviceName eq 'Virtual Machines'",
        f"contains(skuName, '{sku}')",
    ]
    if os == "Windows":
        parts.append("contains(productName, 'Windows')")
    else:
        parts.append("not contains(productName, 'Windows')")
    try:
        resp = httpx.get(
            "https://prices.azure.com/api/retail/prices",
            params={"api-version": "2023-01-01-preview", "$filter": " and ".join(parts)},
            timeout=15,
        )
        resp.raise_for_status()
        for item in resp.json().get("Items", []):
            if "Spot" not in item.get("meterName", "") and "Low Priority" not in item.get("meterName", ""):
                price = item.get("retailPrice", 0)
                if price and price > 0:
                    _cset(k, price)
                    return price
    except Exception:
        pass
    return None


# ── Credential helper ─────────────────────────────────────────────────────────


def _get_aws_creds(db: Session, workspace_id: str):
    acct = (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == workspace_id,
            CloudAccount.provider == "aws",
            CloudAccount.is_active == True,
        )
        .first()
    )
    if not acct:
        return None, None, "us-east-1"
    c = decrypt_credential(acct.encrypted_data)
    return c.get("access_key"), c.get("secret_key"), c.get("region", "us-east-1")


# ── Request / Response schemas ────────────────────────────────────────────────


class VolumeIn(BaseModel):
    volume_type: str = "gp3"
    volume_size_gb: int = 20


class DataDiskIn(BaseModel):
    size_gb: int = 128
    type: str = "Standard_LRS"


class EstimateRequest(BaseModel):
    type: str
    # EC2
    instance_type: Optional[str] = None
    image_platform: Optional[str] = "linux"   # 'linux' | 'windows'
    volumes: List[VolumeIn] = []
    # RDS
    db_instance_class: Optional[str] = None
    engine: Optional[str] = "mysql"
    multi_az: bool = False
    allocated_storage: int = 20
    storage_type: str = "gp2"
    # Azure VM
    vm_size: Optional[str] = None
    image_publisher: Optional[str] = None
    image_offer: Optional[str] = None
    os_disk_type: str = "Standard_LRS"
    os_disk_size_gb: int = 128
    data_disks: List[DataDiskIn] = []
    location: str = "eastus"
    # Azure SQL
    sku_name: Optional[str] = None
    # Azure App Service
    plan_sku: Optional[str] = None


class PriceItem(BaseModel):
    label: str
    amount: float
    isLicense: bool = False


class EstimateResponse(BaseModel):
    monthly: float
    hourly: float
    items: List[PriceItem]
    source: str        # "live" | "static"
    region: Optional[str] = None


# ── Endpoint ──────────────────────────────────────────────────────────────────


@ws_router.post("/estimate", response_model=EstimateResponse)
def get_estimate(
    body: EstimateRequest,
    db: Session = Depends(get_db),
    member: MemberContext = Depends(get_workspace_member),
):
    items: list[PriceItem] = []
    source = "live"
    region_out: Optional[str] = None

    # ── EC2 ──────────────────────────────────────────────────────────────────
    if body.type == "ec2":
        if not body.instance_type:
            raise HTTPException(400, "instance_type required")

        access_key, secret_key, region = _get_aws_creds(db, member.workspace_id)
        if not access_key:
            raise HTTPException(503, "AWS credentials not configured in this workspace")

        location = _AWS_REGIONS.get(region, "US East (N. Virginia)")
        region_out = region
        client = _pricing_client(access_key, secret_key)
        is_windows = body.image_platform == "windows"

        linux_rate = _fetch_ec2(client, body.instance_type, "Linux", location)
        if not linux_rate:
            raise HTTPException(503, f"Pricing unavailable for {body.instance_type}")

        items.append(PriceItem(
            label=f"Compute ({body.instance_type}, Linux)",
            amount=linux_rate * HOURS,
        ))

        if is_windows:
            win_rate = _fetch_ec2(client, body.instance_type, "Windows", location)
            if win_rate and win_rate > linux_rate:
                items.append(PriceItem(
                    label="Licença Windows Server",
                    amount=(win_rate - linux_rate) * HOURS,
                    isLicense=True,
                ))

        for v in body.volumes:
            gb = v.volume_size_gb or 8
            items.append(PriceItem(
                label=f"EBS {v.volume_type} ({gb} GB)",
                amount=gb * _EBS_PER_GB.get(v.volume_type, 0.10),
            ))

    # ── RDS ──────────────────────────────────────────────────────────────────
    elif body.type == "rds":
        if not body.db_instance_class:
            raise HTTPException(400, "db_instance_class required")

        access_key, secret_key, region = _get_aws_creds(db, member.workspace_id)
        if not access_key:
            raise HTTPException(503, "AWS credentials not configured in this workspace")

        location = _AWS_REGIONS.get(region, "US East (N. Virginia)")
        region_out = region
        client = _pricing_client(access_key, secret_key)

        engine = body.engine or "mysql"
        spec = _RDS_ENGINES.get(engine, _RDS_ENGINES["mysql"])
        db_engine, edition, lic_label = spec
        az_suffix = ", Multi-AZ" if body.multi_az else ""
        is_licensed = lic_label is not None

        if is_licensed:
            # Show compute baseline (MySQL equivalent) and license as separate lines
            mysql_engine, _, _ = _RDS_ENGINES["mysql"]
            base_rate = _fetch_rds(client, body.db_instance_class, mysql_engine, None, body.multi_az, location)
            full_rate = _fetch_rds(client, body.db_instance_class, db_engine, edition, body.multi_az, location)
            if not base_rate or not full_rate:
                raise HTTPException(503, f"Pricing unavailable for {body.db_instance_class} / {engine}")
            items.append(PriceItem(
                label=f"Instância ({body.db_instance_class}{az_suffix})",
                amount=base_rate * HOURS,
            ))
            if full_rate > base_rate:
                items.append(PriceItem(
                    label=f"Licença {lic_label} (License Included)",
                    amount=(full_rate - base_rate) * HOURS,
                    isLicense=True,
                ))
        else:
            rate = _fetch_rds(client, body.db_instance_class, db_engine, edition, body.multi_az, location)
            if not rate:
                raise HTTPException(503, f"Pricing unavailable for {body.db_instance_class} / {engine}")
            items.append(PriceItem(
                label=f"Instância ({body.db_instance_class}{az_suffix})",
                amount=rate * HOURS,
            ))

        gb = body.allocated_storage or 20
        items.append(PriceItem(
            label=f"Storage {body.storage_type} ({gb} GB)",
            amount=gb * _RDS_STORAGE.get(body.storage_type, 0.115),
        ))

    # ── Azure VM ─────────────────────────────────────────────────────────────
    elif body.type == "azure-vm":
        if not body.vm_size:
            raise HTTPException(400, "vm_size required")

        is_windows = (
            body.image_publisher == "MicrosoftWindowsServer"
            or "windows" in (body.image_offer or "").lower()
        )
        region_out = body.location

        linux_rate = _fetch_azure_vm(body.vm_size, "Linux", body.location)
        if not linux_rate:
            raise HTTPException(503, f"Pricing unavailable for {body.vm_size} in {body.location}")

        items.append(PriceItem(
            label=f"VM ({body.vm_size}, Linux)",
            amount=linux_rate * HOURS,
        ))

        if is_windows:
            win_rate = _fetch_azure_vm(body.vm_size, "Windows", body.location)
            if win_rate and win_rate > linux_rate:
                items.append(PriceItem(
                    label="Licença Windows Server",
                    amount=(win_rate - linux_rate) * HOURS,
                    isLicense=True,
                ))

        disk_gb = body.os_disk_size_gb or 128
        items.append(PriceItem(
            label=f"OS Disk {body.os_disk_type} ({disk_gb} GB)",
            amount=disk_gb * _AZ_DISK_PGB.get(body.os_disk_type, 0.04),
        ))
        for i, d in enumerate(body.data_disks):
            items.append(PriceItem(
                label=f"Data Disk {i + 1} ({d.size_gb} GB)",
                amount=d.size_gb * _AZ_DISK_PGB.get(d.type, 0.04),
            ))

    # ── Azure SQL ─────────────────────────────────────────────────────────────
    elif body.type == "azure-sql":
        if not body.sku_name:
            raise HTTPException(400, "sku_name required")
        monthly = _AZ_SQL.get(body.sku_name)
        if monthly is None:
            raise HTTPException(404, f"SKU '{body.sku_name}' not found")
        source = "static"
        items.append(PriceItem(label=f"Azure SQL Database ({body.sku_name})", amount=monthly))

    # ── Azure App Service ─────────────────────────────────────────────────────
    elif body.type == "azure-app-service":
        if not body.plan_sku:
            raise HTTPException(400, "plan_sku required")
        monthly = _AZ_APP.get(body.plan_sku)
        if monthly is None:
            raise HTTPException(404, f"SKU '{body.plan_sku}' not found")
        source = "static"
        items.append(PriceItem(label=f"App Service Plan ({body.plan_sku})", amount=monthly))

    else:
        raise HTTPException(400, f"Unknown resource type: {body.type}")

    if not items:
        raise HTTPException(404, "No pricing data available for this configuration")

    total = sum(i.amount for i in items)
    return EstimateResponse(
        monthly=total,
        hourly=total / HOURS,
        items=items,
        source=source,
        region=region_out,
    )
