import api, { wsUrl } from './api';

export const alertService = {
  listAlerts: async () => (await api.get(wsUrl('/alerts'))).data,

  createAlert: async (data) => (await api.post(wsUrl('/alerts'), data)).data,

  updateAlert: async (id, data) => (await api.put(wsUrl(`/alerts/${id}`), data)).data,

  deleteAlert: async (id) => (await api.delete(wsUrl(`/alerts/${id}`))).data,

  getEvents: async ({ unread_only = false, limit = 50, offset = 0, notification_type } = {}) => {
    const params = { unread_only, limit, offset };
    if (notification_type) params.notification_type = notification_type;
    const data = (await api.get(wsUrl('/alerts/events'), { params })).data;
    // Normalise: backend now returns {items, total, ...}
    if (data && Array.isArray(data.items)) return data.items;
    if (Array.isArray(data)) return data;
    return data?.events || [];
  },

  markEventRead: async (id) => (await api.post(wsUrl(`/alerts/events/${id}/read`))).data,

  markAllRead: async () => (await api.post(wsUrl('/alerts/events/read-all'))).data,

  evaluateAlerts: async (payload) => (await api.post(wsUrl('/alerts/evaluate'), payload)).data,
};

export default alertService;
