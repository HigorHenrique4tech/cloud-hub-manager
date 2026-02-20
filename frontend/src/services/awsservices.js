import api, { wsUrl } from './api';

export const awsService = {
  testConnection: async () => (await api.get(wsUrl('/aws/test-connection'))).data,

  // Overview
  getOverview: async () => (await api.get(wsUrl('/aws/overview'))).data,

  // EC2
  listEC2Instances: async () => (await api.get(wsUrl('/aws/ec2/instances'))).data,
  startEC2Instance: async (instanceId) => (await api.post(wsUrl(`/aws/ec2/instances/${instanceId}/start`))).data,
  stopEC2Instance: async (instanceId) => (await api.post(wsUrl(`/aws/ec2/instances/${instanceId}/stop`))).data,
  createEC2Instance: async (data) => (await api.post(wsUrl('/aws/ec2/instances'), data)).data,

  // EC2 form helpers
  listAMIs: async (search = '') => (await api.get(wsUrl('/aws/ec2/amis'), { params: { search } })).data,
  listInstanceTypes: async () => (await api.get(wsUrl('/aws/ec2/instance-types'))).data,
  listKeyPairs: async () => (await api.get(wsUrl('/aws/ec2/key-pairs'))).data,
  listSecurityGroups: async () => (await api.get(wsUrl('/aws/ec2/security-groups'))).data,
  listSubnets: async () => (await api.get(wsUrl('/aws/ec2/subnets'))).data,
  listAvailabilityZones: async () => (await api.get(wsUrl('/aws/ec2/availability-zones'))).data,

  // VPC
  listVPCs: async () => (await api.get(wsUrl('/aws/ec2/vpcs'))).data,
  createVPC: async (data) => (await api.post(wsUrl('/aws/ec2/vpcs'), data)).data,

  // S3
  listS3Buckets: async () => (await api.get(wsUrl('/aws/s3/buckets'))).data,
  createS3Bucket: async (data) => (await api.post(wsUrl('/aws/s3/buckets'), data)).data,
  listS3Regions: async () => (await api.get(wsUrl('/aws/s3/regions'))).data,

  // RDS
  listRDSInstances: async () => (await api.get(wsUrl('/aws/rds/instances'))).data,
  createRDSInstance: async (data) => (await api.post(wsUrl('/aws/rds/instances'), data)).data,
  listRDSEngineVersions: async (engine = 'mysql') => (await api.get(wsUrl('/aws/rds/engine-versions'), { params: { engine } })).data,
  listRDSInstanceClasses: async (engine = 'mysql') => (await api.get(wsUrl('/aws/rds/instance-classes'), { params: { engine } })).data,
  listDBSubnetGroups: async () => (await api.get(wsUrl('/aws/rds/subnet-groups'))).data,

  // Lambda
  listLambdaFunctions: async () => (await api.get(wsUrl('/aws/lambda/functions'))).data,
  createLambdaFunction: async (data) => (await api.post(wsUrl('/aws/lambda/functions'), data)).data,
  listIAMRoles: async (service = 'lambda') => (await api.get(wsUrl('/aws/iam/roles'), { params: { service } })).data,

  // Detail
  getEC2InstanceDetail: async (instanceId) => (await api.get(wsUrl(`/aws/ec2/instances/${instanceId}`))).data,
  getVPCDetail: async (vpcId) => (await api.get(wsUrl(`/aws/ec2/vpcs/${vpcId}`))).data,
  getS3BucketDetail: async (bucketName) => (await api.get(wsUrl(`/aws/s3/buckets/${encodeURIComponent(bucketName)}`))).data,
  getRDSInstanceDetail: async (dbInstanceId) => (await api.get(wsUrl(`/aws/rds/instances/${dbInstanceId}`))).data,
  getLambdaFunctionDetail: async (functionName) => (await api.get(wsUrl(`/aws/lambda/functions/${encodeURIComponent(functionName)}`))).data,

  // Delete
  deleteEC2Instance: async (instanceId) => (await api.delete(wsUrl(`/aws/ec2/instances/${instanceId}`))).data,
  deleteS3Bucket: async (bucketName) => (await api.delete(wsUrl(`/aws/s3/buckets/${bucketName}`))).data,
  deleteRDSInstance: async (dbInstanceId) => (await api.delete(wsUrl(`/aws/rds/instances/${dbInstanceId}`))).data,
  deleteLambdaFunction: async (functionName) => (await api.delete(wsUrl(`/aws/lambda/functions/${functionName}`))).data,
  deleteVPC: async (vpcId) => (await api.delete(wsUrl(`/aws/ec2/vpcs/${vpcId}`))).data,

  // Costs
  getCosts: async (startDate, endDate, granularity = 'DAILY') =>
    (await api.get(wsUrl('/aws/costs'), { params: { start_date: startDate, end_date: endDate, granularity } })).data,
};

export default awsService;
