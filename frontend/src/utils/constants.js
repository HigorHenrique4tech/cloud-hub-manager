// Cloud providers
export const CLOUD_PROVIDERS = {
  AWS: 'aws',
  AZURE: 'azure',
  GCP: 'gcp'
};

// Instance states
export const INSTANCE_STATES = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  STOPPING: 'stopping',
  STARTING: 'starting',
  PENDING: 'pending',
  TERMINATED: 'terminated'
};

// Refresh intervals (in milliseconds)
export const REFRESH_INTERVALS = {
  FAST: 10000,    // 10 seconds
  MEDIUM: 30000,  // 30 seconds
  SLOW: 60000     // 1 minute
};

// API endpoints
export const API_ENDPOINTS = {
  AWS_EC2: '/aws/ec2/instances',
  AWS_TEST: '/aws/test-connection',
  AZURE_VMS: '/azure/vms',
  AZURE_TEST: '/azure/test-connection',
  AZURE_RGS: '/azure/resource-groups'
};

export default {
  CLOUD_PROVIDERS,
  INSTANCE_STATES,
  REFRESH_INTERVALS,
  API_ENDPOINTS
};