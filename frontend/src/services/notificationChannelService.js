import api, { wsUrl } from './api';

const base = () => wsUrl('/notification-channels');

const notificationChannelService = {
  list: () => api.get(base()).then((r) => r.data),
  create: (data) => api.post(base(), data).then((r) => r.data),
  update: (id, data) => api.put(`${base()}/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`${base()}/${id}`).then((r) => r.data),
  test: (id) => api.post(`${base()}/${id}/test`).then((r) => r.data),
  deliveries: (id, page = 1) =>
    api.get(`${base()}/${id}/deliveries`, { params: { page } }).then((r) => r.data),
};

export default notificationChannelService;
