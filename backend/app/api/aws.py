from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.services import AWSService
from app.models import EC2ListResponse, ConnectionTestResponse
from app.models.db_models import User, CloudCredential
from app.core import settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.services.auth_service import decrypt_credential
from app.services.log_service import log_activity
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/aws", tags=["AWS"])


def get_aws_service(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AWSService:
    """Build AWSService using the user's stored credential."""
    cred = (
        db.query(CloudCredential)
        .filter(
            CloudCredential.user_id == current_user.id,
            CloudCredential.provider == "aws",
            CloudCredential.is_active == True,
        )
        .order_by(CloudCredential.created_at.desc())
        .first()
    )

    if not cred:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma credencial AWS configurada. Adicione suas credenciais em Configurações."
        )

    data = decrypt_credential(cred.encrypted_data)
    access_key = data.get("access_key_id", "")
    secret_key = data.get("secret_access_key", "")
    region = data.get("region", settings.AWS_DEFAULT_REGION)

    if not access_key or not secret_key:
        raise HTTPException(
            status_code=400,
            detail="Credencial AWS incompleta. Verifique access_key_id e secret_access_key em Configurações."
        )

    return AWSService(access_key=access_key, secret_key=secret_key, region=region)


# ── Connection ──────────────────────────────────────────────────────────────

@router.get("/test-connection", response_model=ConnectionTestResponse)
async def test_aws_connection(aws_service: AWSService = Depends(get_aws_service)):
    return await aws_service.test_connection()


# ── Overview ─────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_aws_overview(aws_service: AWSService = Depends(get_aws_service)):
    result = await aws_service.get_overview()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter overview'))
    return result


# ── EC2 ──────────────────────────────────────────────────────────────────────

@router.get("/ec2/instances", response_model=EC2ListResponse)
async def list_ec2_instances(aws_service: AWSService = Depends(get_aws_service)):
    result = await aws_service.list_ec2_instances()
    if not result['success'] and result.get('error'):
        logger.warning(f"Error listing EC2 instances: {result['error']}")
    return result


@router.get("/ec2/vpcs")
async def list_vpcs(aws_service: AWSService = Depends(get_aws_service)):
    result = await aws_service.list_vpcs()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao listar VPCs'))
    return result


@router.post("/ec2/instances/{instance_id}/start")
async def start_ec2_instance(
    instance_id: str,
    aws_service: AWSService = Depends(get_aws_service),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = await aws_service.start_ec2_instance(instance_id)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao iniciar instância EC2'))
    log_activity(db, current_user, 'ec2.start', 'EC2',
                 resource_id=instance_id, resource_name=instance_id, provider='aws')
    return result


@router.post("/ec2/instances/{instance_id}/stop")
async def stop_ec2_instance(
    instance_id: str,
    aws_service: AWSService = Depends(get_aws_service),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = await aws_service.stop_ec2_instance(instance_id)
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao parar instância EC2'))
    log_activity(db, current_user, 'ec2.stop', 'EC2',
                 resource_id=instance_id, resource_name=instance_id, provider='aws')
    return result


# ── S3 ────────────────────────────────────────────────────────────────────────

@router.get("/s3/buckets")
async def list_s3_buckets(aws_service: AWSService = Depends(get_aws_service)):
    result = await aws_service.list_s3_buckets()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao listar buckets S3'))
    return result


# ── RDS ───────────────────────────────────────────────────────────────────────

@router.get("/rds/instances")
async def list_rds_instances(aws_service: AWSService = Depends(get_aws_service)):
    result = await aws_service.list_rds_instances()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao listar instâncias RDS'))
    return result


# ── Lambda ────────────────────────────────────────────────────────────────────

@router.get("/lambda/functions")
async def list_lambda_functions(aws_service: AWSService = Depends(get_aws_service)):
    result = await aws_service.list_lambda_functions()
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao listar funções Lambda'))
    return result


# ── Costs ─────────────────────────────────────────────────────────────────────

@router.get("/costs")
async def get_aws_costs(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    granularity: str = Query("DAILY", description="DAILY or MONTHLY"),
    aws_service: AWSService = Depends(get_aws_service),
):
    result = await aws_service.get_cost_and_usage(
        start_date=start_date,
        end_date=end_date,
        granularity=granularity.upper(),
    )
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter dados de custo AWS'))
    return result
