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
  }
};

export default azureService;