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
import logging

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
