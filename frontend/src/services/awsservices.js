import api from './api';

export const awsService = {
  testConnection: async () => (await api.get('/aws/test-connection')).data,

  // Overview
  getOverview: async () => (await api.get('/aws/overview')).data,

  // EC2
  listEC2Instances: async () => (await api.get('/aws/ec2/instances')).data,
  startEC2Instance: async (instanceId) => (await api.post(`/aws/ec2/instances/${instanceId}/start`)).data,
  stopEC2Instance: async (instanceId) => (await api.post(`/aws/ec2/instances/${instanceId}/stop`)).data,
  listVPCs: async () => (await api.get('/aws/ec2/vpcs')).data,

  // S3
  listS3Buckets: async () => (await api.get('/aws/s3/buckets')).data,

  // RDS
  listRDSInstances: async () => (await api.get('/aws/rds/instances')).data,

  // Lambda
  listLambdaFunctions: async () => (await api.get('/aws/lambda/functions')).data,

  // Costs
  getCosts: async (startDate, endDate, granularity = 'DAILY') =>
    (await api.get('/aws/costs', { params: { start_date: startDate, end_date: endDate, granularity } })).data,
};

export default awsService;
