import api from './api';

export const azureService = {
  // Test connection
  testConnection: async () => {
    const response = await api.get('/azure/test-connection');
    return response.data;
  },

  // List VMs
  listVMs: async () => {
    const response = await api.get('/azure/vms');
    return response.data;
  },

  // List Resource Groups
  listResourceGroups: async () => {
    const response = await api.get('/azure/resource-groups');
    return response.data;
  },

  // Start VM
  startVM: async (resourceGroup, vmName) => {
    const response = await api.post(`/azure/vms/${resourceGroup}/${vmName}/start`);
    return response.data;
  },

  // Stop VM
  stopVM: async (resourceGroup, vmName) => {
    const response = await api.post(`/azure/vms/${resourceGroup}/${vmName}/stop`);
    return response.data;
  },

  // Subscriptions
  listSubscriptions: async () => {
    const response = await api.get('/azure/subscriptions');
    return response.data;
  },

  // Resources inside a resource group
  listResourceGroupResources: async (rgName) => {
    const response = await api.get(`/azure/resource-groups/${encodeURIComponent(rgName)}/resources`);
    return response.data;
  },

  // Storage Accounts
  listStorageAccounts: async () => {
    const response = await api.get('/azure/storage-accounts');
    return response.data;
  },

  // Virtual Networks
  listVNets: async () => {
    const response = await api.get('/azure/vnets');
    return response.data;
  },

  // Databases
  listDatabases: async () => {
    const response = await api.get('/azure/databases');
    return response.data;
  },

  // App Services
  listAppServices: async () => {
    const response = await api.get('/azure/app-services');
    return response.data;
  },

  startAppService: async (resourceGroup, appName) => {
    const response = await api.post(`/azure/app-services/${resourceGroup}/${appName}/start`);
    return response.data;
  },

  stopAppService: async (resourceGroup, appName) => {
    const response = await api.post(`/azure/app-services/${resourceGroup}/${appName}/stop`);
    return response.data;
  },
};

export default azureService;