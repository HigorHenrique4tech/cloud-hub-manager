import api, { wsUrl } from './api';

const approvalService = {
  list: ({ status, page = 1, page_size = 20 } = {}) => {
    const params = { page, page_size };
    if (status) params.status = status;
    return api.get(wsUrl('/approvals'), { params }).then(r => r.data);
  },

  getCount: () =>
    api.get(wsUrl('/approvals/count')).then(r => r.data),

  get: (id) =>
    api.get(wsUrl(`/approvals/${id}`)).then(r => r.data),

  approve: (id, notes = '') =>
    api.post(wsUrl(`/approvals/${id}/approve`), { notes }).then(r => r.data),

  reject: (id, notes = '') =>
    api.post(wsUrl(`/approvals/${id}/reject`), { notes }).then(r => r.data),

  cancel: (id) =>
    api.delete(wsUrl(`/approvals/${id}`)).then(r => r.data),

  requestApproval: (recId) =>
    api.post(wsUrl(`/finops/recommendations/${recId}/request-approval`)).then(r => r.data),
};

export default approvalService;
