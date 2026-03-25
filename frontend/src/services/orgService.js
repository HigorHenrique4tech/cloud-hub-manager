import api from './api';

export const orgService = {
  // ── Organizations ────────────────────────────────────────────────────────
  listOrgs: async () => (await api.get('/orgs')).data,
  createOrg: async (name, slug) => (await api.post('/orgs', { name, slug })).data,
  getOrg: async (slug) => (await api.get(`/orgs/${slug}`)).data,
  updateOrg: async (slug, data) => (await api.put(`/orgs/${slug}`, data)).data,
  deleteOrg: async (slug) => (await api.delete(`/orgs/${slug}`)).data,
  updatePlan: async (slug, plan_tier) =>
    (await api.put(`/orgs/${slug}/plan`, { plan_tier })).data,

  // ── Members ──────────────────────────────────────────────────────────────
  listMembers: async (slug) => (await api.get(`/orgs/${slug}/members`)).data,
  inviteMember: async (slug, email, role, phone = null, department = null) =>
    (await api.post(`/orgs/${slug}/members`, { email, role, phone, department })).data,
  updateMemberRole: async (slug, userId, role) =>
    (await api.put(`/orgs/${slug}/members/${userId}`, { role })).data,
  updateMember: async (slug, userId, data) =>
    (await api.put(`/orgs/${slug}/members/${userId}`, data)).data,
  removeMember: async (slug, userId) =>
    (await api.delete(`/orgs/${slug}/members/${userId}`)).data,

  // ── Invitations ────────────────────────────────────────────────────────
  listInvitations: async (slug) =>
    (await api.get(`/orgs/${slug}/invitations`)).data,
  cancelInvitation: async (slug, invitationId) =>
    (await api.delete(`/orgs/${slug}/invitations/${invitationId}`)).data,

  // ── Workspaces ───────────────────────────────────────────────────────────
  listWorkspaces: async (slug) =>
    (await api.get(`/orgs/${slug}/workspaces`)).data,
  createWorkspace: async (slug, data) =>
    (await api.post(`/orgs/${slug}/workspaces`, data)).data,
  getWorkspace: async (slug, wsId) =>
    (await api.get(`/orgs/${slug}/workspaces/${wsId}`)).data,
  updateWorkspace: async (slug, wsId, data) =>
    (await api.put(`/orgs/${slug}/workspaces/${wsId}`, data)).data,
  deleteWorkspace: async (slug, wsId) =>
    (await api.delete(`/orgs/${slug}/workspaces/${wsId}`)).data,

  // ── Workspace Members ────────────────────────────────────────────────────
  listWorkspaceMembers: async (slug, wsId) =>
    (await api.get(`/orgs/${slug}/workspaces/${wsId}/members`)).data,
  listAvailableWorkspaceMembers: async (slug, wsId) =>
    (await api.get(`/orgs/${slug}/workspaces/${wsId}/members/available`)).data,
  addWorkspaceMember: async (slug, wsId, userId, roleOverride = null) =>
    (await api.post(`/orgs/${slug}/workspaces/${wsId}/members`, { user_id: userId, role_override: roleOverride })).data,
  updateWorkspaceMemberRole: async (slug, wsId, userId, roleOverride) =>
    (await api.put(`/orgs/${slug}/workspaces/${wsId}/members/${userId}`, { role_override: roleOverride })).data,
  removeWorkspaceMember: async (slug, wsId, userId) =>
    (await api.delete(`/orgs/${slug}/workspaces/${wsId}/members/${userId}`)).data,

  // ── Managed Orgs (MSP / Enterprise) ─────────────────────────────────────
  listManagedOrgs: async (slug, { page = 1, perPage = 50, search, sortBy } = {}) =>
    (await api.get(`/orgs/${slug}/managed-orgs`, {
      params: { page, per_page: perPage, search: search || undefined, sort_by: sortBy || undefined },
    })).data,
  getManagedOrgsSummary: async (slug) =>
    (await api.get(`/orgs/${slug}/managed-orgs/summary`)).data,
  getMspWidgetSummary: async (slug) =>
    (await api.get(`/orgs/${slug}/managed-orgs/widget-summary`)).data,
  batchSuspendPartners: async (slug, partnerSlugs) =>
    (await api.post(`/orgs/${slug}/managed-orgs/batch-suspend`, { partner_slugs: partnerSlugs })).data,
  batchActivatePartners: async (slug, partnerSlugs) =>
    (await api.post(`/orgs/${slug}/managed-orgs/batch-activate`, { partner_slugs: partnerSlugs })).data,
  createManagedOrg: async (slug, name) =>
    (await api.post(`/orgs/${slug}/managed-orgs`, { name })).data,
  removeManagedOrg: async (slug, partnerSlug) =>
    (await api.delete(`/orgs/${slug}/managed-orgs/${partnerSlug}`)).data,
  updateManagedOrg: async (partnerSlug, data) =>
    (await api.put(`/orgs/${partnerSlug}`, data)).data,
  updatePartnerNotes: async (partnerSlug, notes) =>
    (await api.patch(`/admin/orgs/${partnerSlug}/notes`, { notes })).data,

  // ── Currency ────────────────────────────────────────────────────────────
  updateCurrency: async (slug, data) =>
    (await api.put(`/orgs/${slug}/currency`, data)).data,
  getExchangeRate: async (slug) =>
    (await api.get(`/orgs/${slug}/exchange-rate`)).data,

  // ── Branding (White Label) ──────────────────────────────────────────────
  getBranding: async (slug) =>
    (await api.get(`/orgs/${slug}/branding`)).data,
  updateBranding: async (slug, data) =>
    (await api.put(`/orgs/${slug}/branding`, data)).data,
  resetBranding: async (slug) =>
    (await api.delete(`/orgs/${slug}/branding`)).data,

  // ── Cloud Accounts ───────────────────────────────────────────────────────
  listAccounts: async (slug, wsId, provider) => {
    const params = provider ? { provider } : {};
    return (await api.get(`/orgs/${slug}/workspaces/${wsId}/accounts`, { params })).data;
  },
  createAccount: async (slug, wsId, data) =>
    (await api.post(`/orgs/${slug}/workspaces/${wsId}/accounts`, data)).data,
  deleteAccount: async (slug, wsId, accountId) =>
    (await api.delete(`/orgs/${slug}/workspaces/${wsId}/accounts/${accountId}`)).data,
  testAccount: async (slug, wsId, accountId) =>
    (await api.post(`/orgs/${slug}/workspaces/${wsId}/accounts/${accountId}/test`)).data,
};

export default orgService;
