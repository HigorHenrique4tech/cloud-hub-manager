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
  inviteMember: async (slug, email, role) =>
    (await api.post(`/orgs/${slug}/members`, { email, role })).data,
  updateMemberRole: async (slug, userId, role) =>
    (await api.put(`/orgs/${slug}/members/${userId}`, { role })).data,
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

  // ── Workspace Members (role overrides) ───────────────────────────────────
  listWorkspaceMembers: async (slug, wsId) =>
    (await api.get(`/orgs/${slug}/workspaces/${wsId}/members`)).data,
  updateWorkspaceMemberRole: async (slug, wsId, userId, roleOverride) =>
    (await api.put(`/orgs/${slug}/workspaces/${wsId}/members/${userId}`, { role_override: roleOverride })).data,
  removeWorkspaceMemberOverride: async (slug, wsId, userId) =>
    (await api.delete(`/orgs/${slug}/workspaces/${wsId}/members/${userId}`)).data,

  // ── Managed Orgs (MSP / Enterprise) ─────────────────────────────────────
  listManagedOrgs: async (slug) =>
    (await api.get(`/orgs/${slug}/managed-orgs`)).data,
  getManagedOrgsSummary: async (slug) =>
    (await api.get(`/orgs/${slug}/managed-orgs/summary`)).data,
  createManagedOrg: async (slug, name) =>
    (await api.post(`/orgs/${slug}/managed-orgs`, { name })).data,
  removeManagedOrg: async (slug, partnerSlug) =>
    (await api.delete(`/orgs/${slug}/managed-orgs/${partnerSlug}`)).data,

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
