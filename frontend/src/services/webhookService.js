import api, { wsUrl } from './api';

const webhookService = {
  list:              ()         => api.get(wsUrl('/webhooks')).then(r => r.data),
  create:            (data)     => api.post(wsUrl('/webhooks'), data).then(r => r.data),
  update:            (id, data) => api.put(wsUrl(`/webhooks/${id}`), data).then(r => r.data),
  remove:            (id)       => api.delete(wsUrl(`/webhooks/${id}`)),
  test:              (id)       => api.post(wsUrl(`/webhooks/${id}/test`)).then(r => r.data),
  regenerateSecret:  (id)       => api.post(wsUrl(`/webhooks/${id}/regenerate-secret`)).then(r => r.data),
  deliveries:        (id, page = 1) =>
    api.get(wsUrl(`/webhooks/${id}/deliveries`), { params: { page } }).then(r => r.data),
};

export default webhookService;
