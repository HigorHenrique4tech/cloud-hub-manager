import api, { wsUrl } from './api';

const policyService = {
  list: () =>
    api.get(wsUrl('/policies')).then(r => r.data),

  get: (id) =>
    api.get(wsUrl(`/policies/${id}`)).then(r => r.data),

  create: (payload) =>
    api.post(wsUrl('/policies'), payload).then(r => r.data),

  update: (id, payload) =>
    api.patch(wsUrl(`/policies/${id}`), payload).then(r => r.data),

  delete: (id) =>
    api.delete(wsUrl(`/policies/${id}`)).then(r => r.data),

  toggle: (id) =>
    api.post(wsUrl(`/policies/${id}/toggle`)).then(r => r.data),

  getLogs: (id, { page = 1, page_size = 20 } = {}) =>
    api.get(wsUrl(`/policies/${id}/logs`), { params: { page, page_size } }).then(r => r.data),
};

export default policyService;
