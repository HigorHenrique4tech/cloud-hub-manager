import api from './api';

function orgUrl(path) {
  const orgSlug = localStorage.getItem('selectedOrg');
  if (!orgSlug) throw new Error('Organização não selecionada');
  return `/orgs/${orgSlug}${path}`;
}

const supportService = {
  // ── Client ───────────────────────────────────────────────────────────────────
  list: (params = {}) =>
    api.get(orgUrl('/tickets'), { params }).then((r) => r.data),

  create: (data) =>
    api.post(orgUrl('/tickets'), data).then((r) => r.data),

  get: (ticketId) =>
    api.get(orgUrl(`/tickets/${ticketId}`)).then((r) => r.data),

  getMessages: (ticketId, since = null) => {
    const params = since ? { since } : {};
    return api.get(orgUrl(`/tickets/${ticketId}/messages`), { params }).then((r) => r.data);
  },

  addMessage: (ticketId, data) =>
    api.post(orgUrl(`/tickets/${ticketId}/messages`), data).then((r) => r.data),

  // ── Admin / Helpdesk ──────────────────────────────────────────────────────────
  adminList: (params = {}) =>
    api.get('/admin/tickets', { params }).then((r) => r.data),

  adminGet: (ticketId) =>
    api.get(`/admin/tickets/${ticketId}`).then((r) => r.data),

  adminGetMessages: (ticketId, since = null) => {
    const params = since ? { since } : {};
    return api.get(`/admin/tickets/${ticketId}/messages`, { params }).then((r) => r.data);
  },

  adminUpdateStatus: (ticketId, status) =>
    api.patch(`/admin/tickets/${ticketId}/status`, { status }).then((r) => r.data),

  adminUpdatePriority: (ticketId, priority) =>
    api.patch(`/admin/tickets/${ticketId}/priority`, { priority }).then((r) => r.data),

  adminAddMessage: (ticketId, data) =>
    api.post(`/admin/tickets/${ticketId}/messages`, data).then((r) => r.data),

  listMacros: () =>
    api.get('/admin/support/macros').then((r) => r.data),

  rate: (ticketId, rating, comment = '') => {
    const orgSlug = localStorage.getItem('selectedOrg');
    if (!orgSlug) throw new Error('Organização não selecionada');
    return api.post(`/orgs/${orgSlug}/tickets/${ticketId}/rate`, { rating, comment }).then((r) => r.data);
  },
};

export default supportService;
