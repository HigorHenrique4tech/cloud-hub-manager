import api, { wsUrl } from './api';

const gcpService = {
  // Connection
  testConnection: () => api.get(wsUrl('/gcp/test-connection')),
  getOverview: () => api.get(wsUrl('/gcp/overview')).then(r => r.data),

  // Compute Engine
  listInstances: () => api.get(wsUrl('/gcp/compute/instances')).then(r => r.data),
  startInstance: (zone, name) => api.post(wsUrl(`/gcp/compute/instances/${zone}/${name}/start`)),
  stopInstance: (zone, name) => api.post(wsUrl(`/gcp/compute/instances/${zone}/${name}/stop`)),
  deleteInstance: (zone, name) => api.delete(wsUrl(`/gcp/compute/instances/${zone}/${name}`)),
  listZones: () => api.get(wsUrl('/gcp/compute/zones')).then(r => r.data),
  listMachineTypes: (zone) => api.get(wsUrl(`/gcp/compute/machine-types?zone=${zone}`)).then(r => r.data),

  // Cloud Storage
  listBuckets: () => api.get(wsUrl('/gcp/storage/buckets')).then(r => r.data),
  createBucket: (payload) => api.post(wsUrl('/gcp/storage/buckets'), payload).then(r => r.data),
  deleteBucket: (name) => api.delete(wsUrl(`/gcp/storage/buckets/${name}`)),

  // Cloud SQL
  listSqlInstances: () => api.get(wsUrl('/gcp/sql/instances')).then(r => r.data),
  deleteSqlInstance: (name) => api.delete(wsUrl(`/gcp/sql/instances/${name}`)),

  // Cloud Functions
  listFunctions: (region = 'us-central1') =>
    api.get(wsUrl(`/gcp/functions?region=${region}`)).then(r => r.data),
  deleteFunction: (region, name) => api.delete(wsUrl(`/gcp/functions/${region}/${name}`)),

  // VPC Networks
  listNetworks: () => api.get(wsUrl('/gcp/networks')).then(r => r.data),
  createNetwork: (payload) => api.post(wsUrl('/gcp/networks'), payload).then(r => r.data),
  deleteNetwork: (name) => api.delete(wsUrl(`/gcp/networks/${name}`)),

  // Metrics
  getMetrics: () => api.get(wsUrl('/gcp/metrics')).then(r => r.data),
};

export default gcpService;
