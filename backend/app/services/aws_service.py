import boto3
from typing import Dict
from datetime import datetime, timedelta
from botocore.exceptions import ClientError, NoCredentialsError
import logging

logger = logging.getLogger(__name__)


class AWSService:
    """Service for AWS operations"""

    def __init__(self, access_key: str, secret_key: str, region: str = "us-east-1"):
        self.access_key = access_key
        self.secret_key = secret_key
        self.region = region
        self._ec2_client = None
        self._s3_client = None
        self._rds_client = None
        self._lambda_client = None
        self._ce_client = None

    def _boto3_client(self, service: str, region_override: str = None):
        return boto3.client(
            service,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=region_override or self.region,
        )

    @property
    def ec2_client(self):
        if not self._ec2_client:
            self._ec2_client = self._boto3_client('ec2')
        return self._ec2_client

    @property
    def s3_client(self):
        if not self._s3_client:
            # S3 is a global service — us-east-1 endpoint works for listing
            self._s3_client = self._boto3_client('s3', 'us-east-1')
        return self._s3_client

    @property
    def rds_client(self):
        if not self._rds_client:
            self._rds_client = self._boto3_client('rds')
        return self._rds_client

    @property
    def lambda_client(self):
        if not self._lambda_client:
            self._lambda_client = self._boto3_client('lambda')
        return self._lambda_client

    @property
    def ce_client(self):
        # Cost Explorer only available in us-east-1
        if not self._ce_client:
            self._ce_client = self._boto3_client('ce', 'us-east-1')
        return self._ce_client

    # ── EC2 ──────────────────────────────────────────────────────────────────

    async def list_ec2_instances(self) -> Dict:
        try:
            response = self.ec2_client.describe_instances()
            instances = []
            for reservation in response.get('Reservations', []):
                for instance in reservation.get('Instances', []):
                    name = next(
                        (tag['Value'] for tag in (instance.get('Tags') or []) if tag['Key'] == 'Name'),
                        'N/A'
                    )
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
                'instances': instances,
            }
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_ec2_instances error: {e}")
            return {'success': False, 'error': str(e), 'instances': []}

    async def start_ec2_instance(self, instance_id: str) -> Dict:
        try:
            response = self.ec2_client.start_instances(InstanceIds=[instance_id])
            state = response['StartingInstances'][0]['CurrentState']['Name']
            return {'success': True, 'instance_id': instance_id, 'state': state}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"start_ec2_instance error: {e}")
            return {'success': False, 'error': str(e)}

    async def stop_ec2_instance(self, instance_id: str) -> Dict:
        try:
            response = self.ec2_client.stop_instances(InstanceIds=[instance_id])
            state = response['StoppingInstances'][0]['CurrentState']['Name']
            return {'success': True, 'instance_id': instance_id, 'state': state}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"stop_ec2_instance error: {e}")
            return {'success': False, 'error': str(e)}

    async def list_vpcs(self) -> Dict:
        try:
            response = self.ec2_client.describe_vpcs()
            subnets_resp = self.ec2_client.describe_subnets()
            subnet_counts: Dict[str, int] = {}
            for s in subnets_resp.get('Subnets', []):
                vid = s.get('VpcId', '')
                subnet_counts[vid] = subnet_counts.get(vid, 0) + 1

            vpcs = []
            for vpc in response.get('Vpcs', []):
                name = next(
                    (tag['Value'] for tag in (vpc.get('Tags') or []) if tag['Key'] == 'Name'),
                    'N/A'
                )
                vid = vpc.get('VpcId', '')
                vpcs.append({
                    'vpc_id': vid,
                    'name': name,
                    'cidr': vpc.get('CidrBlock'),
                    'state': vpc.get('State'),
                    'is_default': vpc.get('IsDefault', False),
                    'subnets_count': subnet_counts.get(vid, 0),
                })
            return {'success': True, 'region': self.region, 'total_vpcs': len(vpcs), 'vpcs': vpcs}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_vpcs error: {e}")
            return {'success': False, 'error': str(e), 'vpcs': []}

    # ── S3 ───────────────────────────────────────────────────────────────────

    async def list_s3_buckets(self) -> Dict:
        try:
            response = self.s3_client.list_buckets()
            buckets = []
            for bucket in response.get('Buckets', []):
                name = bucket.get('Name', '')
                created = bucket.get('CreationDate')

                # Detect bucket region
                try:
                    loc = self.s3_client.get_bucket_location(Bucket=name)
                    bucket_region = loc.get('LocationConstraint') or 'us-east-1'
                except Exception:
                    bucket_region = 'unknown'

                # Check public access block
                try:
                    pub = self.s3_client.get_public_access_block(Bucket=name)
                    cfg = pub.get('PublicAccessBlockConfiguration', {})
                    public_access = not (
                        cfg.get('BlockPublicAcls', False) and
                        cfg.get('BlockPublicPolicy', False) and
                        cfg.get('IgnorePublicAcls', False) and
                        cfg.get('RestrictPublicBuckets', False)
                    )
                except Exception:
                    public_access = None  # unknown

                buckets.append({
                    'name': name,
                    'creation_date': created.isoformat() if created else None,
                    'region': bucket_region,
                    'public_access': public_access,
                })
            return {'success': True, 'total_buckets': len(buckets), 'buckets': buckets}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_s3_buckets error: {e}")
            return {'success': False, 'error': str(e), 'buckets': []}

    # ── RDS ──────────────────────────────────────────────────────────────────

    async def list_rds_instances(self) -> Dict:
        try:
            response = self.rds_client.describe_db_instances()
            instances = []
            for db in response.get('DBInstances', []):
                endpoint = db.get('Endpoint') or {}
                instances.append({
                    'db_instance_id': db.get('DBInstanceIdentifier'),
                    'engine': db.get('Engine'),
                    'engine_version': db.get('EngineVersion'),
                    'db_instance_class': db.get('DBInstanceClass'),
                    'status': db.get('DBInstanceStatus'),
                    'endpoint': endpoint.get('Address'),
                    'port': endpoint.get('Port'),
                    'availability_zone': db.get('AvailabilityZone'),
                    'multi_az': db.get('MultiAZ', False),
                    'storage_gb': db.get('AllocatedStorage'),
                })
            return {'success': True, 'region': self.region, 'total_instances': len(instances), 'instances': instances}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_rds_instances error: {e}")
            return {'success': False, 'error': str(e), 'instances': []}

    # ── Lambda ───────────────────────────────────────────────────────────────

    async def list_lambda_functions(self) -> Dict:
        try:
            functions = []
            paginator = self.lambda_client.get_paginator('list_functions')
            for page in paginator.paginate():
                for fn in page.get('Functions', []):
                    modified = fn.get('LastModified')
                    functions.append({
                        'name': fn.get('FunctionName'),
                        'runtime': fn.get('Runtime'),
                        'memory_mb': fn.get('MemorySize'),
                        'timeout_sec': fn.get('Timeout'),
                        'description': fn.get('Description'),
                        'last_modified': modified,
                        'handler': fn.get('Handler'),
                        'code_size_bytes': fn.get('CodeSize'),
                    })
            return {'success': True, 'region': self.region, 'total_functions': len(functions), 'functions': functions}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_lambda_functions error: {e}")
            return {'success': False, 'error': str(e), 'functions': []}

    # ── Overview ─────────────────────────────────────────────────────────────

    async def get_overview(self) -> Dict:
        """Return resource counts for AWS Overview page."""
        try:
            # EC2
            ec2_resp = self.ec2_client.describe_instances()
            ec2_total = sum(len(r.get('Instances', [])) for r in ec2_resp.get('Reservations', []))
            ec2_running = sum(
                1 for r in ec2_resp.get('Reservations', [])
                for i in r.get('Instances', [])
                if i.get('State', {}).get('Name') == 'running'
            )

            # S3
            s3_resp = self.s3_client.list_buckets()
            s3_total = len(s3_resp.get('Buckets', []))

            # RDS
            rds_resp = self.rds_client.describe_db_instances()
            rds_total = len(rds_resp.get('DBInstances', []))

            # Lambda
            lambda_resp = self.lambda_client.list_functions()
            lambda_total = len(lambda_resp.get('Functions', []))

            # VPC
            vpc_resp = self.ec2_client.describe_vpcs()
            vpc_total = len(vpc_resp.get('Vpcs', []))

            return {
                'success': True,
                'region': self.region,
                'resources': {
                    'ec2': {'total': ec2_total, 'running': ec2_running},
                    's3': {'total': s3_total},
                    'rds': {'total': rds_total},
                    'lambda': {'total': lambda_total},
                    'vpc': {'total': vpc_total},
                },
            }
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"get_overview error: {e}")
            return {'success': False, 'error': str(e)}

    # ── Costs ─────────────────────────────────────────────────────────────────

    async def get_cost_and_usage(self, start_date: str, end_date: str, granularity: str = 'DAILY') -> Dict:
        """
        Get AWS cost and usage from Cost Explorer.
        Requires IAM permission: ce:GetCostAndUsage
        """
        try:
            response = self.ce_client.get_cost_and_usage(
                TimePeriod={'Start': start_date, 'End': end_date},
                Granularity=granularity,
                Metrics=['UnblendedCost'],
                GroupBy=[{'Type': 'DIMENSION', 'Key': 'SERVICE'}],
            )

            results = response.get('ResultsByTime', [])
            total = 0.0
            service_map: Dict[str, float] = {}
            daily = []

            for period in results:
                period_total = 0.0
                for group in period.get('Groups', []):
                    svc = group['Keys'][0]
                    amount = float(group['Metrics']['UnblendedCost']['Amount'])
                    period_total += amount
                    service_map[svc] = service_map.get(svc, 0.0) + amount
                total += period_total
                daily.append({
                    'date': period['TimePeriod']['Start'],
                    'total': round(period_total, 4),
                })

            by_service = sorted(
                [{'name': k, 'amount': round(v, 4)} for k, v in service_map.items()],
                key=lambda x: x['amount'],
                reverse=True,
            )

            return {
                'success': True,
                'period': {'start': start_date, 'end': end_date},
                'granularity': granularity,
                'total': round(total, 4),
                'currency': 'USD',
                'by_service': by_service,
                'daily': daily,
            }

        except ClientError as e:
            logger.error(f"Cost Explorer error: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"get_cost_and_usage error: {e}")
            return {'success': False, 'error': str(e)}

    # ── Connection test ───────────────────────────────────────────────────────

    async def test_connection(self) -> Dict:
        try:
            self.ec2_client.describe_regions()
            return {'success': True, 'message': 'AWS connection successful', 'region': self.region}
        except NoCredentialsError:
            return {'success': False, 'error': 'AWS credentials not found'}
        except ClientError as e:
            return {'success': False, 'error': str(e)}
