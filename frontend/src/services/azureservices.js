import api, { wsUrl } from './api';

export const azureService = {
  testConnection: async () => (await api.get(wsUrl('/azure/test-connection'))).data,

  // Form helpers
  listLocations: async () => (await api.get(wsUrl('/azure/locations'))).data,
  listVMSizes: async (location) => (await api.get(wsUrl('/azure/vm-sizes'), { params: { location } })).data,
  listVMImagePublishers: async (location) => (await api.get(wsUrl('/azure/vm-images/publishers'), { params: { location } })).data,
  listVMImageOffers: async (location, publisher) => (await api.get(wsUrl('/azure/vm-images/offers'), { params: { location, publisher } })).data,
  listVMImageSkus: async (location, publisher, offer) => (await api.get(wsUrl('/azure/vm-images/skus'), { params: { location, publisher, offer } })).data,

  // VMs
  listVMs: async () => (await api.get(wsUrl('/azure/vms'))).data,
  startVM: async (resourceGroup, vmName) => (await api.post(wsUrl(`/azure/vms/${resourceGroup}/${vmName}/start`))).data,
  stopVM: async (resourceGroup, vmName) => (await api.post(wsUrl(`/azure/vms/${resourceGroup}/${vmName}/stop`))).data,
  createVM: async (data) => (await api.post(wsUrl('/azure/vms'), data)).data,

  // Resource Groups
  listResourceGroups: async () => (await api.get(wsUrl('/azure/resource-groups'))).data,
  listResourceGroupResources: async (rgName) => (await api.get(wsUrl(`/azure/resource-groups/${encodeURIComponent(rgName)}/resources`))).data,

  // Storage Accounts
  listStorageAccounts: async () => (await api.get(wsUrl('/azure/storage-accounts'))).data,
  createStorageAccount: async (data) => (await api.post(wsUrl('/azure/storage-accounts'), data)).data,

  // Virtual Networks
  listVNets: async () => (await api.get(wsUrl('/azure/vnets'))).data,
  createVNet: async (data) => (await api.post(wsUrl('/azure/vnets'), data)).data,

  // Databases
  listDatabases: async () => (await api.get(wsUrl('/azure/databases'))).data,
  createSQLDatabase: async (data) => (await api.post(wsUrl('/azure/databases'), data)).data,

  // App Services
  listAppServices: async () => (await api.get(wsUrl('/azure/app-services'))).data,
  startAppService: async (resourceGroup, appName) => (await api.post(wsUrl(`/azure/app-services/${resourceGroup}/${appName}/start`))).data,
  stopAppService: async (resourceGroup, appName) => (await api.post(wsUrl(`/azure/app-services/${resourceGroup}/${appName}/stop`))).data,
  createAppService: async (data) => (await api.post(wsUrl('/azure/app-services'), data)).data,

  // Subscriptions
  listSubscriptions: async () => (await api.get(wsUrl('/azure/subscriptions'))).data,
};

export default azureService;
