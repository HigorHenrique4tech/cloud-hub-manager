import api from './api';

export const awsService = {
  // Test connection
  testConnection: async () => {
    const response = await api.get('/aws/test-connection');
    return response.data;
  },

  // List EC2 instances
  listEC2Instances: async () => {
    const response = await api.get('/aws/ec2/instances');
    return response.data;
  },

  // Start EC2 instance
  startEC2Instance: async (instanceId) => {
    const response = await api.post(`/aws/ec2/instances/${instanceId}/start`);
    return response.data;
  },

  // Stop EC2 instance
  stopEC2Instance: async (instanceId) => {
    const response = await api.post(`/aws/ec2/instances/${instanceId}/stop`);
    return response.data;
  }
};

export default awsService;