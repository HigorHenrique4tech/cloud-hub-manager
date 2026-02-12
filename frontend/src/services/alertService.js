import api from './api';

export const alertService = {
  listAlerts: async () => (await api.get('/alerts')).data,

  createAlert: async (data) => (await api.post('/alerts', data)).data,

  updateAlert: async (id, data) => (await api.put(`/alerts/${id}`, data)).data,

  deleteAlert: async (id) => (await api.delete(`/alerts/${id}`)).data,

  getEvents: async ({ unread_only = false, limit = 50 } = {}) =>
    (await api.get('/alerts/events', { params: { unread_only, limit } })).data,

  markEventRead: async (id) => (await api.post(`/alerts/events/${id}/read`)).data,

  markAllRead: async () => (await api.post('/alerts/events/read-all')).data,

  evaluateAlerts: async (payload) => (await api.post('/alerts/evaluate', payload)).data,
};

export default alertService;
