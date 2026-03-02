from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.services import AWSService
from app.models.db_models import CloudAccount
from app.models.create_schemas import (
    CreateEC2Request, CreateS3BucketRequest, CreateRDSRequest,
    CreateLambdaRequest, CreateVPCRequest,
)
from app.core import settings
from app.core.dependencies import require_permission
from app.core.auth_context import MemberContext
from app.database import get_db
from app.services.auth_service import decrypt_credential
from app.services.log_service import log_activity
from app.services.security_service import AWSSecurityScanner
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/aws",
    tags=["AWS (workspace)"],
)


def _build_aws_service_from_account(account: CloudAccount) -> AWSService:
    data = decrypt_credential(account.encrypted_data)
    access_key = data.get("access_key_id", "")
    secret_key = data.get("secret_access_key", "")
    region = data.get("region", settings.AWS_DEFAULT_REGION)
    if not access_key or not secret_key:
        raise HTTPException(status_code=400, detail="Credencial AWS incompleta nesta conta cloud.")
    return AWSService(access_key=access_key, secret_key=secret_key, region=region)


def _get_ws_aws_accounts(member: MemberContext, db: Session):
    return (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.provider == "aws",
            CloudAccount.is_active == True,
        )
        .order_by(CloudAccount.created_at.desc())
        .all()
    )


def _get_single_aws_service(member: MemberContext, db: Session) -> AWSService:
    accounts = _get_ws_aws_accounts(member, db)
    if not accounts:
        raise HTTPException(status_code=400, detail="Nenhuma conta AWS configurada neste workspace.")
    return _build_aws_service_from_account(accounts[0])


# ── Connection ──────────────────────────────────────────────────────────────

@ws_router.get("/test-connection")
async def ws_test_aws_connection(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.test_connection()


# ── Overview ────────────────────────────────────────────────────────────────

@ws_router.get("/overview")
async def ws_get_aws_overview(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.get_overview()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter overview'))
    return result


# ── EC2 ─────────────────────────────────────────────────────────────────────

@ws_router.get("/ec2/instances")
async def ws_list_ec2_instances(
    account_id: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    if account_id:
        account = db.query(CloudAccount).filter(
            CloudAccount.id == account_id,
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.provider == "aws",
            CloudAccount.is_active == True,
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Conta AWS não encontrada")
        return await _build_aws_service_from_account(account).list_ec2_instances()
    svc = _get_single_aws_service(member, db)
    return await svc.list_ec2_instances()


@ws_router.post("/ec2/instances")
async def ws_create_ec2_instance(
    body: CreateEC2Request,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.create_ec2_instance(body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar instância EC2'))
    log_activity(db, member.user, 'ec2.create', 'EC2',
                 resource_id=result.get('instance_id'), resource_name=body.name,
                 provider='aws', organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/ec2/instances/{instance_id}/start")
async def ws_start_ec2_instance(
    instance_id: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.start_ec2_instance(instance_id)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao iniciar instância EC2'))
    log_activity(db, member.user, 'ec2.start', 'EC2',
                 resource_id=instance_id, resource_name=instance_id, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/ec2/instances/{instance_id}/stop")
async def ws_stop_ec2_instance(
    instance_id: str,
    member: MemberContext = Depends(require_permission("resources.start_stop")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.stop_ec2_instance(instance_id)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao parar instância EC2'))
    log_activity(db, member.user, 'ec2.stop', 'EC2',
                 resource_id=instance_id, resource_name=instance_id, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# EC2 helper endpoints for form dropdowns
@ws_router.get("/ec2/amis")
async def ws_list_amis(
    search: str = Query('', description="Filter AMIs by name"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_amis(search=search)


@ws_router.get("/ec2/instance-types")
async def ws_list_instance_types(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_instance_types()


@ws_router.get("/ec2/key-pairs")
async def ws_list_key_pairs(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_key_pairs()


@ws_router.get("/ec2/security-groups")
async def ws_list_security_groups(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_security_groups()


@ws_router.get("/ec2/subnets")
async def ws_list_subnets(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_subnets()


@ws_router.get("/ec2/availability-zones")
async def ws_list_availability_zones(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_availability_zones()


# ── VPC ─────────────────────────────────────────────────────────────────────

@ws_router.get("/ec2/vpcs")
async def ws_list_vpcs(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.list_vpcs()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao listar VPCs'))
    return result


@ws_router.post("/ec2/vpcs")
async def ws_create_vpc(
    body: CreateVPCRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.create_vpc(body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar VPC'))
    log_activity(db, member.user, 'vpc.create', 'VPC',
                 resource_id=result.get('vpc_id'), resource_name=body.name,
                 provider='aws', organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── S3 ──────────────────────────────────────────────────────────────────────

@ws_router.get("/s3/buckets")
async def ws_list_s3_buckets(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.list_s3_buckets()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao listar buckets S3'))
    return result


@ws_router.post("/s3/buckets")
async def ws_create_s3_bucket(
    body: CreateS3BucketRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.create_s3_bucket(body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar bucket S3'))
    log_activity(db, member.user, 's3.create', 'S3',
                 resource_name=body.bucket_name, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.get("/s3/regions")
async def ws_list_s3_regions(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_regions()


# ── RDS ─────────────────────────────────────────────────────────────────────

@ws_router.get("/rds/instances")
async def ws_list_rds_instances(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.list_rds_instances()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao listar instâncias RDS'))
    return result


@ws_router.post("/rds/instances")
async def ws_create_rds_instance(
    body: CreateRDSRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.create_rds_instance(body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar instância RDS'))
    log_activity(db, member.user, 'rds.create', 'RDS',
                 resource_name=body.db_instance_identifier, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.get("/rds/engine-versions")
async def ws_list_rds_engine_versions(
    engine: str = Query('mysql'),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_rds_engine_versions(engine=engine)


@ws_router.get("/rds/instance-classes")
async def ws_list_rds_instance_classes(
    engine: str = Query('mysql'),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_rds_instance_classes(engine=engine)


@ws_router.get("/rds/subnet-groups")
async def ws_list_db_subnet_groups(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_db_subnet_groups()


# ── Lambda ──────────────────────────────────────────────────────────────────

@ws_router.get("/lambda/functions")
async def ws_list_lambda_functions(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.list_lambda_functions()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao listar funções Lambda'))
    return result


@ws_router.post("/lambda/functions")
async def ws_create_lambda_function(
    body: CreateLambdaRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.create_lambda_function(body.model_dump())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao criar função Lambda'))
    log_activity(db, member.user, 'lambda.create', 'Lambda',
                 resource_name=body.function_name, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.get("/iam/roles")
async def ws_list_iam_roles(
    service: str = Query('lambda'),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    return await svc.list_iam_roles(service_filter=service)


# ── Detail ──────────────────────────────────────────────────────────────────

@ws_router.get("/ec2/instances/{instance_id}")
async def ws_get_ec2_instance_detail(
    instance_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.get_ec2_instance_detail(instance_id)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da instância EC2'))
    return result


@ws_router.get("/ec2/vpcs/{vpc_id}")
async def ws_get_vpc_detail(
    vpc_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.get_vpc_detail(vpc_id)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da VPC'))
    return result


@ws_router.get("/s3/buckets/{bucket_name}")
async def ws_get_s3_bucket_detail(
    bucket_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.get_s3_bucket_detail(bucket_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe do bucket S3'))
    return result


@ws_router.get("/rds/instances/{db_instance_id}")
async def ws_get_rds_instance_detail(
    db_instance_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.get_rds_instance_detail(db_instance_id)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da instância RDS'))
    return result


@ws_router.get("/lambda/functions/{function_name}")
async def ws_get_lambda_function_detail(
    function_name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.get_lambda_function_detail(function_name)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter detalhe da função Lambda'))
    return result


# ── Delete ──────────────────────────────────────────────────────────────────

@ws_router.delete("/ec2/instances/{instance_id}")
async def ws_terminate_ec2_instance(
    instance_id: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.terminate_ec2_instance(instance_id)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao terminar instância EC2'))
    log_activity(db, member.user, 'ec2.delete', 'EC2',
                 resource_id=instance_id, resource_name=instance_id, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/s3/buckets/{bucket_name}")
async def ws_delete_s3_bucket(
    bucket_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.delete_s3_bucket(bucket_name)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao excluir bucket S3'))
    log_activity(db, member.user, 's3.delete', 'S3',
                 resource_name=bucket_name, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/rds/instances/{db_instance_id}")
async def ws_delete_rds_instance(
    db_instance_id: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.delete_rds_instance(db_instance_id)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao excluir instância RDS'))
    log_activity(db, member.user, 'rds.delete', 'RDS',
                 resource_id=db_instance_id, resource_name=db_instance_id, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/lambda/functions/{function_name}")
async def ws_delete_lambda_function(
    function_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.delete_lambda_function(function_name)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao excluir função Lambda'))
    log_activity(db, member.user, 'lambda.delete', 'Lambda',
                 resource_name=function_name, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.delete("/ec2/vpcs/{vpc_id}")
async def ws_delete_vpc(
    vpc_id: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_single_aws_service(member, db)
    result = await svc.delete_vpc(vpc_id)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error', 'Erro ao excluir VPC'))
    log_activity(db, member.user, 'vpc.delete', 'VPC',
                 resource_id=vpc_id, resource_name=vpc_id, provider='aws',
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


# ── Costs ───────────────────────────────────────────────────────────────────

@ws_router.get("/costs")
async def ws_get_aws_costs(
    start_date: str = Query(...),
    end_date: str = Query(...),
    granularity: str = Query("DAILY"),
    account_id: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("costs.view")),
    db: Session = Depends(get_db),
):
    if account_id:
        account = db.query(CloudAccount).filter(
            CloudAccount.id == account_id,
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.provider == "aws",
            CloudAccount.is_active == True,
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Conta AWS não encontrada")
        svc = _build_aws_service_from_account(account)
    else:
        svc = _get_single_aws_service(member, db)
    result = await svc.get_cost_and_usage(start_date=start_date, end_date=end_date, granularity=granularity.upper())
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter dados de custo AWS'))
    return result


# ── Security Scan ─────────────────────────────────────────────────────────────

@ws_router.get("/security/scan")
async def aws_security_scan(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """
    Runs basic security checks on the configured AWS account:
    - S3 buckets without Block Public Access
    - Security Groups with unrestricted inbound access (0.0.0.0/0) on SSH/RDP
    - Root account active access keys
    """
    accounts = _get_ws_aws_accounts(member, db)
    if not accounts:
        raise HTTPException(status_code=400, detail="Nenhuma conta AWS configurada neste workspace.")

    all_findings = []
    for account in accounts:
        creds = decrypt_credential(account.encrypted_data)
        scanner = AWSSecurityScanner(
            access_key=creds.get("access_key_id", ""),
            secret_key=creds.get("secret_access_key", ""),
            region=creds.get("region", "us-east-1"),
        )
        all_findings.extend(scanner.scan_all())

    # Sort by severity
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    all_findings.sort(key=lambda f: order.get(f.get("severity", "low"), 3))

    return {
        "findings": all_findings,
        "total": len(all_findings),
        "scanned_at": datetime.utcnow().isoformat(),
        "provider": "aws",
    }


@ws_router.get("/metrics")
async def ws_get_aws_metrics(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Returns CPU and network metrics for running EC2 instances (last 1 hour)."""
    accounts = _get_ws_aws_accounts(member, db)
    if not accounts:
        raise HTTPException(status_code=400, detail="Nenhuma conta AWS configurada neste workspace.")
    try:
        svc = _build_aws_service_from_account(accounts[0])
        return svc.get_metrics()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Backup (EBS Snapshots + AMIs) ────────────────────────────────────────────

from pydantic import BaseModel as _BM

class CreateSnapshotRequest(_BM):
    volume_id: str
    description: str = ""

class CreateAMIRequest(_BM):
    instance_id: str
    name: str
    description: str = ""


@ws_router.get("/backups/snapshots")
async def ws_list_aws_snapshots(
    instance_id: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List owned EBS snapshots. Optionally filter by instance_id (looks up attached volumes)."""
    svc = _get_single_aws_service(member, db)
    try:
        filters = [{"Name": "status", "Values": ["completed", "pending", "error"]}]

        if instance_id:
            # Get volumes attached to this instance first
            resp = svc.ec2_client.describe_instances(InstanceIds=[instance_id])
            volume_ids = []
            for r in resp.get("Reservations", []):
                for inst in r.get("Instances", []):
                    for bdm in inst.get("BlockDeviceMappings", []):
                        vid = bdm.get("Ebs", {}).get("VolumeId")
                        if vid:
                            volume_ids.append(vid)
            if volume_ids:
                filters.append({"Name": "volume-id", "Values": volume_ids})
            else:
                return {"snapshots": []}

        resp = svc.ec2_client.describe_snapshots(OwnerIds=["self"], Filters=filters)
        snapshots = []
        for s in resp.get("Snapshots", []):
            tags = {t["Key"]: t["Value"] for t in s.get("Tags", [])}
            snapshots.append({
                "snapshot_id": s["SnapshotId"],
                "volume_id": s.get("VolumeId", ""),
                "description": s.get("Description", ""),
                "state": s.get("State", ""),
                "size_gb": s.get("VolumeSize"),
                "start_time": s["StartTime"].isoformat() if s.get("StartTime") else None,
                "encrypted": s.get("Encrypted", False),
                "tags": tags,
            })
        snapshots.sort(key=lambda x: x["start_time"] or "", reverse=True)
        return {"snapshots": snapshots}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/backups/snapshots")
async def ws_create_aws_snapshot(
    body: CreateSnapshotRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Create an EBS snapshot from a volume."""
    svc = _get_single_aws_service(member, db)
    try:
        resp = svc.ec2_client.create_snapshot(
            VolumeId=body.volume_id,
            Description=body.description,
        )
        log_activity(db, member.user, "backup.create", "EBS_SNAPSHOT",
                     resource_id=resp["SnapshotId"], resource_name=body.volume_id,
                     provider="aws", organization_id=member.org_id, workspace_id=member.workspace_id)
        return {
            "snapshot_id": resp["SnapshotId"],
            "volume_id": resp.get("VolumeId", ""),
            "state": resp.get("State", ""),
            "start_time": resp["StartTime"].isoformat() if resp.get("StartTime") else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/backups/snapshots/{snapshot_id}")
async def ws_delete_aws_snapshot(
    snapshot_id: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    """Delete an EBS snapshot."""
    svc = _get_single_aws_service(member, db)
    try:
        svc.ec2_client.delete_snapshot(SnapshotId=snapshot_id)
        log_activity(db, member.user, "backup.delete", "EBS_SNAPSHOT",
                     resource_id=snapshot_id, resource_name=snapshot_id,
                     provider="aws", organization_id=member.org_id, workspace_id=member.workspace_id)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/backups/amis")
async def ws_list_aws_amis(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List AMIs owned by this account."""
    svc = _get_single_aws_service(member, db)
    try:
        resp = svc.ec2_client.describe_images(Owners=["self"])
        amis = []
        for img in resp.get("Images", []):
            tags = {t["Key"]: t["Value"] for t in img.get("Tags", [])}
            amis.append({
                "image_id": img["ImageId"],
                "name": img.get("Name", ""),
                "description": img.get("Description", ""),
                "state": img.get("State", ""),
                "creation_date": img.get("CreationDate", ""),
                "architecture": img.get("Architecture", ""),
                "root_device_type": img.get("RootDeviceType", ""),
                "tags": tags,
            })
        amis.sort(key=lambda x: x["creation_date"], reverse=True)
        return {"amis": amis}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/backups/amis")
async def ws_create_aws_ami(
    body: CreateAMIRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Create an AMI (machine image backup) from an EC2 instance."""
    svc = _get_single_aws_service(member, db)
    try:
        resp = svc.ec2_client.create_image(
            InstanceId=body.instance_id,
            Name=body.name,
            Description=body.description,
            NoReboot=True,
        )
        image_id = resp["ImageId"]
        log_activity(db, member.user, "backup.create", "AMI",
                     resource_id=image_id, resource_name=body.name,
                     provider="aws", organization_id=member.org_id, workspace_id=member.workspace_id)
        return {"image_id": image_id, "name": body.name, "state": "pending"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
