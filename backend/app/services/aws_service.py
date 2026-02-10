import boto3
from typing import List, Dict, Optional
from botocore.exceptions import ClientError, NoCredentialsError
import logging

logger = logging.getLogger(__name__)


class AWSService:
    """Service for AWS operations"""
    
    def __init__(self, access_key: str, secret_key: str, region: str = "us-east-1"):
        """Initialize AWS service with credentials"""
        self.access_key = access_key
        self.secret_key = secret_key
        self.region = region
        self._ec2_client = None
        self._ce_client = None  # Cost Explorer
    
    @property
    def ec2_client(self):
        """Lazy load EC2 client"""
        if not self._ec2_client:
            self._ec2_client = boto3.client(
                'ec2',
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region
            )
        return self._ec2_client
    
    @property
    def ce_client(self):
        """Lazy load Cost Explorer client"""
        if not self._ce_client:
            self._ce_client = boto3.client(
                'ce',
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region
            )
        return self._ce_client
    
    async def list_ec2_instances(self) -> Dict:
        """
        List all EC2 instances in the configured region
        
        Returns:
            Dict with instances list and metadata
        """
        try:
            response = self.ec2_client.describe_instances()
            
            instances = []
            for reservation in response.get('Reservations', []):
                for instance in reservation.get('Instances', []):
                    # Extract name from tags
                    name = "N/A"
                    if instance.get('Tags'):
                        name_tag = next(
                            (tag['Value'] for tag in instance['Tags'] if tag['Key'] == 'Name'),
                            "N/A"
                        )
                        name = name_tag
                    
                    instances.append({
                        'instance_id': instance.get('InstanceId'),
                        'name': name,
                        'instance_type': instance.get('InstanceType'),
                        'state': instance.get('State', {}).get('Name'),
                        'availability_zone': instance.get('Placement', {}).get('AvailabilityZone'),
                        'private_ip': instance.get('PrivateIpAddress'),
                        'public_ip': instance.get('PublicIpAddress'),
                        'launch_time': instance.get('LaunchTime').isoformat() if instance.get('LaunchTime') else None,
                    })
            
            return {
                'success': True,
                'region': self.region,
                'total_instances': len(instances),
                'instances': instances
            }
            
        except NoCredentialsError:
            logger.error("AWS credentials not found")
            return {
                'success': False,
                'error': 'AWS credentials not configured',
                'instances': []
            }
        except ClientError as e:
            logger.error(f"AWS ClientError: {e}")
            return {
                'success': False,
                'error': str(e),
                'instances': []
            }
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return {
                'success': False,
                'error': str(e),
                'instances': []
            }
    
    async def get_cost_and_usage(self, start_date: str, end_date: str) -> Dict:
        """
        Get AWS cost and usage for a date range
        
        Args:
            start_date: Start date in format YYYY-MM-DD
            end_date: End date in format YYYY-MM-DD
        
        Returns:
            Dict with cost information
        """
        try:
            response = self.ce_client.get_cost_and_usage(
                TimePeriod={
                    'Start': start_date,
                    'End': end_date
                },
                Granularity='DAILY',
                Metrics=['UnblendedCost'],
                GroupBy=[
                    {
                        'Type': 'DIMENSION',
                        'Key': 'SERVICE'
                    }
                ]
            )
            
            return {
                'success': True,
                'data': response.get('ResultsByTime', [])
            }
            
        except ClientError as e:
            logger.error(f"Error getting cost data: {e}")
            return {
                'success': False,
                'error': str(e),
                'data': []
            }
    
    async def test_connection(self) -> Dict:
        """
        Test AWS connection and credentials
        
        Returns:
            Dict with connection status
        """
        try:
            # Simple call to verify credentials
            self.ec2_client.describe_regions()
            return {
                'success': True,
                'message': 'AWS connection successful',
                'region': self.region
            }
        except NoCredentialsError:
            return {
                'success': False,
                'error': 'AWS credentials not found'
            }
        except ClientError as e:
            return {
                'success': False,
                'error': str(e)
            }
