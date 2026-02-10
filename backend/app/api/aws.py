from fastapi import APIRouter, HTTPException, Depends
from app.services import AWSService
from app.models import EC2ListResponse, ConnectionTestResponse
from app.core import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/aws", tags=["AWS"])


def get_aws_service():
    """Dependency to get AWS service instance"""
    if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise HTTPException(
            status_code=400,
            detail="AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env file"
        )
    
    return AWSService(
        access_key=settings.AWS_ACCESS_KEY_ID,
        secret_key=settings.AWS_SECRET_ACCESS_KEY,
        region=settings.AWS_DEFAULT_REGION
    )


@router.get("/test-connection", response_model=ConnectionTestResponse)
async def test_aws_connection(aws_service: AWSService = Depends(get_aws_service)):
    """
    Test AWS connection and credentials
    """
    result = await aws_service.test_connection()
    return result


@router.get("/ec2/instances", response_model=EC2ListResponse)
async def list_ec2_instances(aws_service: AWSService = Depends(get_aws_service)):
    """
    List all EC2 instances in the configured region
    
    Returns:
        List of EC2 instances with their details
    """
    result = await aws_service.list_ec2_instances()
    
    if not result['success'] and result.get('error'):
        logger.warning(f"Error listing EC2 instances: {result['error']}")
    
    return result


@router.get("/ec2/instances/{instance_id}")
async def get_ec2_instance(
    instance_id: str,
    aws_service: AWSService = Depends(get_aws_service)
):
    """
    Get details of a specific EC2 instance
    
    Args:
        instance_id: The EC2 instance ID
    """
    # TODO: Implementar quando necessário
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/ec2/instances/{instance_id}/start")
async def start_ec2_instance(
    instance_id: str,
    aws_service: AWSService = Depends(get_aws_service)
):
    """
    Start an EC2 instance
    
    Args:
        instance_id: The EC2 instance ID
    """
    # TODO: Implementar quando necessário
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/ec2/instances/{instance_id}/stop")
async def stop_ec2_instance(
    instance_id: str,
    aws_service: AWSService = Depends(get_aws_service)
):
    """
    Stop an EC2 instance
    
    Args:
        instance_id: The EC2 instance ID
    """
    # TODO: Implementar quando necessário
    raise HTTPException(status_code=501, detail="Not implemented yet")
