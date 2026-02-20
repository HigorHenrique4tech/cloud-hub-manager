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
        self._iam_client = None

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
        if not self._ce_client:
            self._ce_client = self._boto3_client('ce', 'us-east-1')
        return self._ce_client

    @property
    def iam_client(self):
        if not self._iam_client:
            self._iam_client = self._boto3_client('iam', 'us-east-1')
        return self._iam_client

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

    async def list_amis(self, search: str = '') -> Dict:
        """List AMIs filtered by search term (amazon-owned + self-owned)."""
        try:
            filters = [
                {'Name': 'state', 'Values': ['available']},
                {'Name': 'architecture', 'Values': ['x86_64']},
            ]
            if search:
                filters.append({'Name': 'name', 'Values': [f'*{search}*']})
            response = self.ec2_client.describe_images(
                Owners=['amazon', 'self'],
                Filters=filters,
            )
            amis = [
                {
                    'image_id': img['ImageId'],
                    'name': img.get('Name', ''),
                    'description': img.get('Description', ''),
                    'architecture': img.get('Architecture', ''),
                    'creation_date': img.get('CreationDate', ''),
                }
                for img in response.get('Images', [])
            ]
            amis.sort(key=lambda x: x['creation_date'], reverse=True)
            return {'success': True, 'amis': amis[:50]}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_amis error: {e}")
            return {'success': False, 'error': str(e), 'amis': []}

    async def list_instance_types(self) -> Dict:
        try:
            types = []
            paginator = self.ec2_client.get_paginator('describe_instance_types')
            for page in paginator.paginate(MaxResults=100):
                for it in page.get('InstanceTypes', []):
                    types.append({
                        'name': it['InstanceType'],
                        'vcpus': it['VCpuInfo']['DefaultVCpus'],
                        'memory_mb': it['MemoryInfo']['SizeInMiB'],
                    })
            types.sort(key=lambda x: (x['vcpus'], x['memory_mb']))
            return {'success': True, 'instance_types': types}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_instance_types error: {e}")
            return {'success': False, 'error': str(e), 'instance_types': []}

    async def list_key_pairs(self) -> Dict:
        try:
            response = self.ec2_client.describe_key_pairs()
            pairs = [
                {'name': kp['KeyName'], 'fingerprint': kp.get('KeyFingerprint', '')}
                for kp in response.get('KeyPairs', [])
            ]
            return {'success': True, 'key_pairs': pairs}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_key_pairs error: {e}")
            return {'success': False, 'error': str(e), 'key_pairs': []}

    async def list_security_groups(self) -> Dict:
        try:
            response = self.ec2_client.describe_security_groups()
            groups = [
                {
                    'id': sg['GroupId'],
                    'name': sg['GroupName'],
                    'description': sg.get('Description', ''),
                    'vpc_id': sg.get('VpcId', ''),
                }
                for sg in response.get('SecurityGroups', [])
            ]
            return {'success': True, 'security_groups': groups}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_security_groups error: {e}")
            return {'success': False, 'error': str(e), 'security_groups': []}

    async def list_subnets(self) -> Dict:
        try:
            response = self.ec2_client.describe_subnets()
            subnets = []
            for s in response.get('Subnets', []):
                name = next((tag['Value'] for tag in (s.get('Tags') or []) if tag['Key'] == 'Name'), '')
                subnets.append({
                    'id': s['SubnetId'],
                    'name': name,
                    'vpc_id': s['VpcId'],
                    'cidr': s['CidrBlock'],
                    'az': s['AvailabilityZone'],
                    'available_ips': s.get('AvailableIpAddressCount', 0),
                })
            return {'success': True, 'subnets': subnets}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_subnets error: {e}")
            return {'success': False, 'error': str(e), 'subnets': []}

    async def list_availability_zones(self) -> Dict:
        try:
            response = self.ec2_client.describe_availability_zones(
                Filters=[{'Name': 'state', 'Values': ['available']}]
            )
            zones = [
                {'zone_name': az['ZoneName'], 'zone_id': az['ZoneId'], 'region': az['RegionName']}
                for az in response.get('AvailabilityZones', [])
            ]
            return {'success': True, 'availability_zones': zones}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_availability_zones error: {e}")
            return {'success': False, 'error': str(e), 'availability_zones': []}

    async def list_regions(self) -> Dict:
        try:
            response = self.ec2_client.describe_regions()
            regions = [
                {'name': r['RegionName'], 'endpoint': r['Endpoint']}
                for r in response.get('Regions', [])
            ]
            return {'success': True, 'regions': regions}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_regions error: {e}")
            return {'success': False, 'error': str(e), 'regions': []}

    async def create_ec2_instance(self, params: dict) -> Dict:
        try:
            tags = [{'Key': 'Name', 'Value': params['name']}]
            for k, v in params.get('tags', {}).items():
                tags.append({'Key': k, 'Value': v})
            tag_spec = [{'ResourceType': 'instance', 'Tags': tags}]

            block_devices = []
            for vol in params.get('volumes', []):
                ebs = {
                    'VolumeSize': vol['volume_size_gb'],
                    'VolumeType': vol['volume_type'],
                    'DeleteOnTermination': vol.get('delete_on_termination', True),
                    'Encrypted': vol.get('encrypted', False),
                }
                if vol.get('iops') and vol['volume_type'] in ('io1', 'io2', 'gp3'):
                    ebs['Iops'] = vol['iops']
                if vol.get('throughput') and vol['volume_type'] == 'gp3':
                    ebs['Throughput'] = vol['throughput']
                block_devices.append({'DeviceName': vol['device_name'], 'Ebs': ebs})

            run_kwargs = {
                'ImageId': params['image_id'],
                'InstanceType': params.get('instance_type', 't3.micro'),
                'MinCount': 1,
                'MaxCount': 1,
                'TagSpecifications': tag_spec,
            }
            if params.get('key_name'):
                run_kwargs['KeyName'] = params['key_name']
            if block_devices:
                run_kwargs['BlockDeviceMappings'] = block_devices
            if params.get('user_data'):
                run_kwargs['UserData'] = params['user_data']
            if params.get('iam_instance_profile'):
                run_kwargs['IamInstanceProfile'] = {'Arn': params['iam_instance_profile']}

            if params.get('associate_public_ip') and params.get('subnet_id'):
                run_kwargs['NetworkInterfaces'] = [{
                    'DeviceIndex': 0,
                    'SubnetId': params['subnet_id'],
                    'AssociatePublicIpAddress': True,
                    'Groups': params.get('security_group_ids', []),
                }]
            else:
                if params.get('security_group_ids'):
                    run_kwargs['SecurityGroupIds'] = params['security_group_ids']
                if params.get('subnet_id'):
                    run_kwargs['SubnetId'] = params['subnet_id']

            response = self.ec2_client.run_instances(**run_kwargs)
            instance = response['Instances'][0]
            return {'success': True, 'instance_id': instance['InstanceId'], 'state': instance['State']['Name']}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"create_ec2_instance error: {e}")
            return {'success': False, 'error': str(e)}

    async def create_vpc(self, params: dict) -> Dict:
        try:
            tags = [{'Key': 'Name', 'Value': params['name']}]
            for k, v in params.get('tags', {}).items():
                tags.append({'Key': k, 'Value': v})

            response = self.ec2_client.create_vpc(
                CidrBlock=params.get('cidr_block', '10.0.0.0/16'),
                InstanceTenancy=params.get('tenancy', 'default'),
                TagSpecifications=[{'ResourceType': 'vpc', 'Tags': tags}],
            )
            vpc_id = response['Vpc']['VpcId']

            if params.get('enable_dns_support', True):
                self.ec2_client.modify_vpc_attribute(VpcId=vpc_id, EnableDnsSupport={'Value': True})
            if params.get('enable_dns_hostnames', True):
                self.ec2_client.modify_vpc_attribute(VpcId=vpc_id, EnableDnsHostnames={'Value': True})

            created_subnets = []
            for subnet_def in params.get('subnets', []):
                sub_args = {'VpcId': vpc_id, 'CidrBlock': subnet_def['cidr_block']}
                if subnet_def.get('availability_zone'):
                    sub_args['AvailabilityZone'] = subnet_def['availability_zone']
                if subnet_def.get('name'):
                    sub_args['TagSpecifications'] = [{'ResourceType': 'subnet', 'Tags': [{'Key': 'Name', 'Value': subnet_def['name']}]}]
                sub_resp = self.ec2_client.create_subnet(**sub_args)
                created_subnets.append(sub_resp['Subnet']['SubnetId'])

            return {'success': True, 'vpc_id': vpc_id, 'subnets': created_subnets}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"create_vpc error: {e}")
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
                try:
                    loc = self.s3_client.get_bucket_location(Bucket=name)
                    bucket_region = loc.get('LocationConstraint') or 'us-east-1'
                except Exception:
                    bucket_region = 'unknown'
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
                    public_access = None
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

    async def create_s3_bucket(self, params: dict) -> Dict:
        try:
            bucket_name = params['bucket_name']
            region = params.get('region', 'us-east-1')
            s3 = self._boto3_client('s3', region)

            create_args = {'Bucket': bucket_name}
            if region != 'us-east-1':
                create_args['CreateBucketConfiguration'] = {'LocationConstraint': region}
            s3.create_bucket(**create_args)

            if params.get('versioning_enabled'):
                s3.put_bucket_versioning(Bucket=bucket_name, VersioningConfiguration={'Status': 'Enabled'})

            enc_algo = params.get('encryption_algorithm', 'AES256')
            enc_rule = {'ApplyServerSideEncryptionByDefault': {'SSEAlgorithm': enc_algo}}
            if enc_algo == 'aws:kms' and params.get('kms_key_id'):
                enc_rule['ApplyServerSideEncryptionByDefault']['KMSMasterKeyID'] = params['kms_key_id']
            s3.put_bucket_encryption(Bucket=bucket_name, ServerSideEncryptionConfiguration={'Rules': [enc_rule]})

            s3.put_public_access_block(Bucket=bucket_name, PublicAccessBlockConfiguration={
                'BlockPublicAcls': params.get('block_public_acls', True),
                'IgnorePublicAcls': params.get('ignore_public_acls', True),
                'BlockPublicPolicy': params.get('block_public_policy', True),
                'RestrictPublicBuckets': params.get('restrict_public_buckets', True),
            })

            tags = params.get('tags', {})
            if tags:
                s3.put_bucket_tagging(Bucket=bucket_name, Tagging={
                    'TagSet': [{'Key': k, 'Value': v} for k, v in tags.items()]
                })

            return {'success': True, 'bucket_name': bucket_name, 'region': region}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"create_s3_bucket error: {e}")
            return {'success': False, 'error': str(e)}

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

    async def list_rds_engine_versions(self, engine: str = 'mysql') -> Dict:
        try:
            response = self.rds_client.describe_db_engine_versions(Engine=engine)
            versions = [
                {
                    'engine': v['Engine'],
                    'version': v['EngineVersion'],
                    'description': v.get('DBEngineVersionDescription', ''),
                }
                for v in response.get('DBEngineVersions', [])
            ]
            return {'success': True, 'versions': versions}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_rds_engine_versions error: {e}")
            return {'success': False, 'error': str(e), 'versions': []}

    async def list_rds_instance_classes(self, engine: str = 'mysql') -> Dict:
        try:
            classes = set()
            paginator = self.rds_client.get_paginator('describe_orderable_db_instance_options')
            for page in paginator.paginate(Engine=engine, MaxRecords=100):
                for opt in page.get('OrderableDBInstanceOptions', []):
                    classes.add(opt['DBInstanceClass'])
            return {'success': True, 'instance_classes': sorted(list(classes))}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_rds_instance_classes error: {e}")
            return {'success': False, 'error': str(e), 'instance_classes': []}

    async def list_db_subnet_groups(self) -> Dict:
        try:
            response = self.rds_client.describe_db_subnet_groups()
            groups = [
                {
                    'name': g['DBSubnetGroupName'],
                    'description': g.get('DBSubnetGroupDescription', ''),
                    'vpc_id': g.get('VpcId', ''),
                }
                for g in response.get('DBSubnetGroups', [])
            ]
            return {'success': True, 'subnet_groups': groups}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_db_subnet_groups error: {e}")
            return {'success': False, 'error': str(e), 'subnet_groups': []}

    async def create_rds_instance(self, params: dict) -> Dict:
        try:
            tags = [{'Key': k, 'Value': v} for k, v in params.get('tags', {}).items()]
            create_args = {
                'DBInstanceIdentifier': params['db_instance_identifier'],
                'Engine': params['engine'],
                'DBInstanceClass': params.get('db_instance_class', 'db.t3.micro'),
                'AllocatedStorage': params.get('allocated_storage_gb', 20),
                'StorageType': params.get('storage_type', 'gp3'),
                'MasterUsername': params['master_username'],
                'MasterUserPassword': params['master_password'],
                'MultiAZ': params.get('multi_az', False),
                'PubliclyAccessible': params.get('publicly_accessible', False),
                'BackupRetentionPeriod': params.get('backup_retention_days', 7),
                'StorageEncrypted': params.get('storage_encrypted', True),
                'AutoMinorVersionUpgrade': params.get('auto_minor_version_upgrade', True),
                'DeletionProtection': params.get('deletion_protection', False),
                'Tags': tags,
            }
            if params.get('engine_version'):
                create_args['EngineVersion'] = params['engine_version']
            if params.get('db_name'):
                create_args['DBName'] = params['db_name']
            if params.get('vpc_security_group_ids'):
                create_args['VpcSecurityGroupIds'] = params['vpc_security_group_ids']
            if params.get('db_subnet_group_name'):
                create_args['DBSubnetGroupName'] = params['db_subnet_group_name']
            if params.get('iops') and params.get('storage_type') in ('io1', 'gp3'):
                create_args['Iops'] = params['iops']

            response = self.rds_client.create_db_instance(**create_args)
            db_instance = response['DBInstance']
            return {
                'success': True,
                'db_instance_id': db_instance['DBInstanceIdentifier'],
                'status': db_instance['DBInstanceStatus'],
            }
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"create_rds_instance error: {e}")
            return {'success': False, 'error': str(e)}

    # ── Lambda ───────────────────────────────────────────────────────────────

    async def list_lambda_functions(self) -> Dict:
        try:
            functions = []
            paginator = self.lambda_client.get_paginator('list_functions')
            for page in paginator.paginate():
                for fn in page.get('Functions', []):
                    functions.append({
                        'name': fn.get('FunctionName'),
                        'runtime': fn.get('Runtime'),
                        'memory_mb': fn.get('MemorySize'),
                        'timeout_sec': fn.get('Timeout'),
                        'description': fn.get('Description'),
                        'last_modified': fn.get('LastModified'),
                        'handler': fn.get('Handler'),
                        'code_size_bytes': fn.get('CodeSize'),
                    })
            return {'success': True, 'region': self.region, 'total_functions': len(functions), 'functions': functions}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_lambda_functions error: {e}")
            return {'success': False, 'error': str(e), 'functions': []}

    async def list_iam_roles(self, service_filter: str = 'lambda') -> Dict:
        try:
            roles = []
            paginator = self.iam_client.get_paginator('list_roles')
            for page in paginator.paginate():
                for role in page.get('Roles', []):
                    trust = str(role.get('AssumeRolePolicyDocument', ''))
                    if service_filter in trust:
                        roles.append({'arn': role['Arn'], 'name': role['RoleName']})
            return {'success': True, 'roles': roles}
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"list_iam_roles error: {e}")
            return {'success': False, 'error': str(e), 'roles': []}

    async def create_lambda_function(self, params: dict) -> Dict:
        try:
            import base64
            code = {}
            if params.get('code_zip_base64'):
                code['ZipFile'] = base64.b64decode(params['code_zip_base64'])
            elif params.get('code_s3_bucket') and params.get('code_s3_key'):
                code['S3Bucket'] = params['code_s3_bucket']
                code['S3Key'] = params['code_s3_key']
            else:
                return {'success': False, 'error': 'Código obrigatório (zip base64 ou S3)'}

            env_vars = {ev['key']: ev['value'] for ev in params.get('environment_variables', [])}
            create_args = {
                'FunctionName': params['function_name'],
                'Runtime': params['runtime'],
                'Role': params['role_arn'],
                'Handler': params.get('handler', 'lambda_function.lambda_handler'),
                'Code': code,
                'MemorySize': params.get('memory_size_mb', 128),
                'Timeout': params.get('timeout_seconds', 3),
                'Tags': params.get('tags', {}),
            }
            if params.get('description'):
                create_args['Description'] = params['description']
            if env_vars:
                create_args['Environment'] = {'Variables': env_vars}
            if params.get('layers'):
                create_args['Layers'] = params['layers']

            response = self.lambda_client.create_function(**create_args)
            return {
                'success': True,
                'function_name': response['FunctionName'],
                'function_arn': response['FunctionArn'],
            }
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"create_lambda_function error: {e}")
            return {'success': False, 'error': str(e)}

    # ── Overview ─────────────────────────────────────────────────────────────

    async def get_overview(self) -> Dict:
        try:
            ec2_resp = self.ec2_client.describe_instances()
            ec2_total = sum(len(r.get('Instances', [])) for r in ec2_resp.get('Reservations', []))
            ec2_running = sum(
                1 for r in ec2_resp.get('Reservations', [])
                for i in r.get('Instances', [])
                if i.get('State', {}).get('Name') == 'running'
            )
            s3_resp = self.s3_client.list_buckets()
            s3_total = len(s3_resp.get('Buckets', []))
            rds_resp = self.rds_client.describe_db_instances()
            rds_total = len(rds_resp.get('DBInstances', []))
            lambda_resp = self.lambda_client.list_functions()
            lambda_total = len(lambda_resp.get('Functions', []))
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
                daily.append({'date': period['TimePeriod']['Start'], 'total': round(period_total, 4)})
            by_service = sorted(
                [{'name': k, 'amount': round(v, 4)} for k, v in service_map.items()],
                key=lambda x: x['amount'], reverse=True,
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

    # ── Delete operations ─────────────────────────────────────────────────────

    async def terminate_ec2_instance(self, instance_id: str) -> Dict:
        try:
            self.ec2_client.terminate_instances(InstanceIds=[instance_id])
            return {'success': True}
        except ClientError as e:
            logger.error(f"terminate_ec2_instance error: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"terminate_ec2_instance error: {e}")
            return {'success': False, 'error': str(e)}

    async def delete_s3_bucket(self, bucket_name: str) -> Dict:
        try:
            self.s3_client.delete_bucket(Bucket=bucket_name)
            return {'success': True}
        except ClientError as e:
            code = e.response['Error']['Code']
            if code == 'BucketNotEmpty':
                return {'success': False, 'error': 'O bucket não está vazio. Remova todos os objetos antes de excluir.'}
            logger.error(f"delete_s3_bucket error: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"delete_s3_bucket error: {e}")
            return {'success': False, 'error': str(e)}

    async def delete_rds_instance(self, db_instance_id: str) -> Dict:
        try:
            self.rds_client.delete_db_instance(
                DBInstanceIdentifier=db_instance_id,
                SkipFinalSnapshot=True,
                DeleteAutomatedBackups=True,
            )
            return {'success': True}
        except ClientError as e:
            logger.error(f"delete_rds_instance error: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"delete_rds_instance error: {e}")
            return {'success': False, 'error': str(e)}

    async def delete_lambda_function(self, function_name: str) -> Dict:
        try:
            self.lambda_client.delete_function(FunctionName=function_name)
            return {'success': True}
        except ClientError as e:
            logger.error(f"delete_lambda_function error: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"delete_lambda_function error: {e}")
            return {'success': False, 'error': str(e)}

    async def delete_vpc(self, vpc_id: str) -> Dict:
        try:
            self.ec2_client.delete_vpc(VpcId=vpc_id)
            return {'success': True}
        except ClientError as e:
            code = e.response['Error']['Code']
            if code == 'DependencyViolation':
                return {'success': False, 'error': 'A VPC ainda possui recursos associados (subnets, IGW, ENIs). Remova-os antes de excluir a VPC.'}
            logger.error(f"delete_vpc error: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"delete_vpc error: {e}")
            return {'success': False, 'error': str(e)}

    # ── Detail operations ─────────────────────────────────────────────────────

    async def get_ec2_instance_detail(self, instance_id: str) -> Dict:
        try:
            resp = self.ec2_client.describe_instances(InstanceIds=[instance_id])
            reservations = resp.get('Reservations', [])
            if not reservations or not reservations[0].get('Instances'):
                return {'success': False, 'error': 'Instância não encontrada'}
            inst = reservations[0]['Instances'][0]
            security_groups = [
                {'id': sg['GroupId'], 'name': sg['GroupName']}
                for sg in inst.get('SecurityGroups', [])
            ]
            volumes = [
                {
                    'device': bdm.get('DeviceName'),
                    'volume_id': bdm.get('Ebs', {}).get('VolumeId'),
                    'status': bdm.get('Ebs', {}).get('Status'),
                    'delete_on_termination': bdm.get('Ebs', {}).get('DeleteOnTermination'),
                }
                for bdm in inst.get('BlockDeviceMappings', [])
            ]
            tags = {t['Key']: t['Value'] for t in (inst.get('Tags') or [])}
            iam_profile = inst.get('IamInstanceProfile', {}).get('Arn', '') if inst.get('IamInstanceProfile') else ''
            return {
                'success': True,
                'ami_id': inst.get('ImageId'),
                'key_name': inst.get('KeyName') or '—',
                'security_groups': security_groups,
                'subnet_id': inst.get('SubnetId') or '—',
                'vpc_id': inst.get('VpcId') or '—',
                'architecture': inst.get('Architecture'),
                'virtualization_type': inst.get('VirtualizationType'),
                'root_device_type': inst.get('RootDeviceType'),
                'root_device_name': inst.get('RootDeviceName'),
                'monitoring_state': inst.get('Monitoring', {}).get('State', '—'),
                'iam_instance_profile': iam_profile or '—',
                'state_reason': inst.get('StateTransitionReason') or '—',
                'volumes': volumes,
                'tags': tags,
            }
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"get_ec2_instance_detail error: {e}")
            return {'success': False, 'error': str(e)}

    async def get_s3_bucket_detail(self, bucket_name: str) -> Dict:
        try:
            # Versioning
            try:
                ver_resp = self.s3_client.get_bucket_versioning(Bucket=bucket_name)
                versioning_status = ver_resp.get('Status', 'Disabled') or 'Disabled'
            except Exception:
                versioning_status = '—'
            # Encryption
            try:
                enc_resp = self.s3_client.get_bucket_encryption(Bucket=bucket_name)
                rules = enc_resp.get('ServerSideEncryptionConfiguration', {}).get('Rules', [])
                encryption_type = rules[0].get('ApplyServerSideEncryptionByDefault', {}).get('SSEAlgorithm', '—') if rules else '—'
            except Exception:
                encryption_type = '—'
            # Tags
            try:
                tag_resp = self.s3_client.get_bucket_tagging(Bucket=bucket_name)
                tags = {t['Key']: t['Value'] for t in tag_resp.get('TagSet', [])}
            except Exception:
                tags = {}
            # Location
            try:
                loc_resp = self.s3_client.get_bucket_location(Bucket=bucket_name)
                region = loc_resp.get('LocationConstraint') or 'us-east-1'
            except Exception:
                region = '—'
            return {
                'success': True,
                'region': region,
                'versioning_status': versioning_status,
                'encryption_type': encryption_type,
                'tags': tags,
            }
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"get_s3_bucket_detail error: {e}")
            return {'success': False, 'error': str(e)}

    async def get_rds_instance_detail(self, db_instance_id: str) -> Dict:
        try:
            resp = self.rds_client.describe_db_instances(DBInstanceIdentifier=db_instance_id)
            instances = resp.get('DBInstances', [])
            if not instances:
                return {'success': False, 'error': 'Instância RDS não encontrada'}
            db = instances[0]
            vpc_sgs = [
                {'id': sg.get('VpcSecurityGroupId'), 'status': sg.get('Status')}
                for sg in db.get('VpcSecurityGroups', [])
            ]
            param_group = db.get('DBParameterGroups', [{}])[0].get('DBParameterGroupName', '—') if db.get('DBParameterGroups') else '—'
            subnet_group = db.get('DBSubnetGroup', {}).get('DBSubnetGroupName', '—') if db.get('DBSubnetGroup') else '—'
            tags = {t['Key']: t['Value'] for t in (db.get('TagList') or [])}
            return {
                'success': True,
                'parameter_group': param_group,
                'subnet_group': subnet_group,
                'vpc_security_groups': vpc_sgs,
                'backup_retention': db.get('BackupRetentionPeriod'),
                'preferred_backup_window': db.get('PreferredBackupWindow', '—'),
                'preferred_maintenance_window': db.get('PreferredMaintenanceWindow', '—'),
                'auto_minor_version_upgrade': db.get('AutoMinorVersionUpgrade'),
                'deletion_protection': db.get('DeletionProtection'),
                'publicly_accessible': db.get('PubliclyAccessible'),
                'storage_type': db.get('StorageType'),
                'storage_encrypted': db.get('StorageEncrypted'),
                'ca_certificate': db.get('CACertificateIdentifier', '—'),
                'tags': tags,
            }
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"get_rds_instance_detail error: {e}")
            return {'success': False, 'error': str(e)}

    async def get_lambda_function_detail(self, function_name: str) -> Dict:
        try:
            resp = self.lambda_client.get_function(FunctionName=function_name)
            config = resp.get('Configuration', {})
            code = resp.get('Code', {})
            env_vars = config.get('Environment', {}).get('Variables', {})
            layers = [
                {'arn': l.get('Arn'), 'size': l.get('CodeSize')}
                for l in config.get('Layers', [])
            ]
            vpc_config = config.get('VpcConfig') or {}
            return {
                'success': True,
                'function_arn': config.get('FunctionArn'),
                'description': config.get('Description') or '—',
                'role_arn': config.get('Role', '—'),
                'package_type': config.get('PackageType', '—'),
                'architectures': config.get('Architectures', []),
                'tracing_mode': config.get('TracingConfig', {}).get('Mode', '—'),
                'env_var_keys': list(env_vars.keys()),
                'layers': layers,
                'vpc_id': vpc_config.get('VpcId') or '—',
                'vpc_subnets_count': len(vpc_config.get('SubnetIds', [])),
                'vpc_sgs_count': len(vpc_config.get('SecurityGroupIds', [])),
                'code_location': code.get('Location', '—'),
                'last_update_status': config.get('LastUpdateStatus', '—'),
                'state': config.get('State', '—'),
            }
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"get_lambda_function_detail error: {e}")
            return {'success': False, 'error': str(e)}

    async def get_vpc_detail(self, vpc_id: str) -> Dict:
        try:
            # VPC attributes
            vpc_resp = self.ec2_client.describe_vpcs(VpcIds=[vpc_id])
            vpcs = vpc_resp.get('Vpcs', [])
            if not vpcs:
                return {'success': False, 'error': 'VPC não encontrada'}
            vpc = vpcs[0]
            tags = {t['Key']: t['Value'] for t in (vpc.get('Tags') or [])}
            # DNS attributes
            try:
                dns_support = self.ec2_client.describe_vpc_attribute(VpcId=vpc_id, Attribute='enableDnsSupport')
                enable_dns_support = dns_support.get('EnableDnsSupport', {}).get('Value', False)
            except Exception:
                enable_dns_support = None
            try:
                dns_hostnames = self.ec2_client.describe_vpc_attribute(VpcId=vpc_id, Attribute='enableDnsHostnames')
                enable_dns_hostnames = dns_hostnames.get('EnableDnsHostnames', {}).get('Value', False)
            except Exception:
                enable_dns_hostnames = None
            # Subnets
            subnets_resp = self.ec2_client.describe_subnets(Filters=[{'Name': 'vpc-id', 'Values': [vpc_id]}])
            subnets = [
                {
                    'id': s['SubnetId'],
                    'cidr': s['CidrBlock'],
                    'az': s['AvailabilityZone'],
                    'public': s.get('MapPublicIpOnLaunch', False),
                    'available_ips': s.get('AvailableIpAddressCount', 0),
                    'name': next((t['Value'] for t in (s.get('Tags') or []) if t['Key'] == 'Name'), ''),
                }
                for s in subnets_resp.get('Subnets', [])
            ]
            # Internet Gateway
            igw_resp = self.ec2_client.describe_internet_gateways(
                Filters=[{'Name': 'attachment.vpc-id', 'Values': [vpc_id]}]
            )
            igws = igw_resp.get('InternetGateways', [])
            igw_id = igws[0].get('InternetGatewayId', '—') if igws else '—'
            return {
                'success': True,
                'enable_dns_support': enable_dns_support,
                'enable_dns_hostnames': enable_dns_hostnames,
                'tenancy': vpc.get('InstanceTenancy', '—'),
                'subnets': subnets,
                'igw_id': igw_id,
                'tags': tags,
            }
        except (NoCredentialsError, ClientError, Exception) as e:
            logger.error(f"get_vpc_detail error: {e}")
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
