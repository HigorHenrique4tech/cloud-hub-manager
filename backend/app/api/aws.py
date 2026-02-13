from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.services import AWSService
from app.models.db_models import CloudAccount
from app.core import settings
from app.core.dependencies import require_permission
from app.core.auth_context import MemberContext
from app.database import get_db
from app.services.auth_service import decrypt_credential
from app.services.log_service import log_activity
import logging

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# Workspace-scoped router (multi-tenant, RBAC)
# ═══════════════════════════════════════════════════════════════════════════════

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/aws",
    tags=["AWS (workspace)"],
)


def _build_aws_service_from_account(account: CloudAccount) -> AWSService:
    """Build AWSService from a CloudAccount record."""
    data = decrypt_credential(account.encrypted_data)
    access_key = data.get("access_key_id", "")
    secret_key = data.get("secret_access_key", "")
    region = data.get("region", settings.AWS_DEFAULT_REGION)

    if not access_key or not secret_key:
        raise HTTPException(
            status_code=400,
            detail="Credencial AWS incompleta nesta conta cloud.",
        )
    return AWSService(access_key=access_key, secret_key=secret_key, region=region)


def _get_ws_aws_accounts(member: MemberContext, db: Session):
    """Return all active AWS CloudAccounts for the workspace."""
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
    """Get the first (default) AWS account in the workspace."""
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
    account_id: Optional[str] = Query(None, description="Specific cloud account ID"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List EC2 instances. Optionally filter by cloud account."""
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
        return await svc.list_ec2_instances()

    # Default: use first account
    svc = _get_single_aws_service(member, db)
    return await svc.list_ec2_instances()


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


# ── Costs ───────────────────────────────────────────────────────────────────

@ws_router.get("/costs")
async def ws_get_aws_costs(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    granularity: str = Query("DAILY", description="DAILY or MONTHLY"),
    account_id: Optional[str] = Query(None, description="Specific cloud account ID"),
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

    result = await svc.get_cost_and_usage(
        start_date=start_date,
        end_date=end_date,
        granularity=granularity.upper(),
    )
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', 'Erro ao obter dados de custo AWS'))
    return result
