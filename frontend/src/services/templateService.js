import api, { wsUrl } from './api';

const templateService = {
  getTemplates: async ({ provider, resourceType } = {}) => {
    const params = {};
    if (provider)      params.provider      = provider;
    if (resourceType)  params.resource_type = resourceType;
    const { data } = await api.get(wsUrl('/templates'), { params });
    return data;
  },

  createTemplate: async (payload) => {
    const { data } = await api.post(wsUrl('/templates'), payload);
    return data;
  },

  updateTemplate: async (id, payload) => {
    const { data } = await api.patch(wsUrl(`/templates/${id}`), payload);
    return data;
  },

  deleteTemplate: async (id) => {
    await api.delete(wsUrl(`/templates/${id}`));
  },
};

export default templateService;
