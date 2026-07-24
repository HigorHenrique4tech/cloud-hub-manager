import api from './api';

function orgUrl(path) {
  const orgSlug = localStorage.getItem('selectedOrg');
  if (!orgSlug) throw new Error('Organização não selecionada');
  return `/orgs/${orgSlug}${path}`;
}

const supportService = {
  // ── Client (user sees only own tickets) ──────────────────────────────────

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

  // ── Admin / Helpdesk ─────────────────────────────────────────────────────

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

  adminAssign: (ticketId, assignedTo) =>
    api.patch(`/admin/tickets/${ticketId}/assign`, { assigned_to: assignedTo }).then((r) => r.data),

  adminUpdateTags: (ticketId, tags) =>
    api.patch(`/admin/tickets/${ticketId}/tags`, { tags }).then((r) => r.data),

  rate: (ticketId, rating, comment = null) =>
    api.post(orgUrl(`/tickets/${ticketId}/rate`), { rating, comment }).then((r) => r.data),

  // Macros available for agents
  listMacros: (category = null) =>
    api.get('/admin/support/macros', { params: category ? { category } : {} }).then((r) => r.data),

  // Agents list (for assignment dropdown)
  listAgents: () =>
    api.get('/admin/support/agents').then((r) => r.data),
};

export default supportService;
