from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.services import AWSService
from app.models import EC2ListResponse, ConnectionTestResponse
from app.models.db_models import User, CloudCredential
from app.core import settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.services.auth_service import decrypt_credential
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/aws", tags=["AWS"])


def get_aws_service(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AWSService:
    """Build AWSService using the user's stored credential (falls back to .env globals)."""
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


@router.get("/test-connection", response_model=ConnectionTestResponse)
async def test_aws_connection(aws_service: AWSService = Depends(get_aws_service)):
    """Test AWS connection and credentials"""
    return await aws_service.test_connection()


@router.get("/ec2/instances", response_model=EC2ListResponse)
async def list_ec2_instances(aws_service: AWSService = Depends(get_aws_service)):
    """List all EC2 instances in the configured region"""
    result = await aws_service.list_ec2_instances()
    if not result['success'] and result.get('error'):
        logger.warning(f"Error listing EC2 instances: {result['error']}")
    return result


@router.get("/ec2/instances/{instance_id}")
async def get_ec2_instance(instance_id: str, aws_service: AWSService = Depends(get_aws_service)):
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/ec2/instances/{instance_id}/start")
async def start_ec2_instance(instance_id: str, aws_service: AWSService = Depends(get_aws_service)):
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/ec2/instances/{instance_id}/stop")
async def stop_ec2_instance(instance_id: str, aws_service: AWSService = Depends(get_aws_service)):
    raise HTTPException(status_code=501, detail="Not implemented yet")
