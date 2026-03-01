import api, { wsUrl } from './api';

const m365Service = {
  // ── Credentials ────────────────────────────────────────────────────────────

  getCredentials: async () => {
    const { data } = await api.get(wsUrl('/m365/credentials'));
    return data;
  },

  saveCredentials: async (payload) => {
    const { data } = await api.post(wsUrl('/m365/credentials'), payload);
    return data;
  },

  deleteCredentials: async () => {
    const { data } = await api.delete(wsUrl('/m365/credentials'));
    return data;
  },

  // ── Workspace-scoped data ──────────────────────────────────────────────────

  getOverview: async () => {
    const { data } = await api.get(wsUrl('/m365/overview'));
    return data;
  },

  getUsers: async () => {
    const { data } = await api.get(wsUrl('/m365/users'));
    return data;
  },

  getLicenses: async () => {
    const { data } = await api.get(wsUrl('/m365/licenses'));
    return data;
  },

  getLicenseUsers: async (skuId) => {
    const { data } = await api.get(wsUrl(`/m365/licenses/${skuId}/users`));
    return data;
  },

  assignLicense: async (skuId, userId) => {
    const { data } = await api.post(wsUrl(`/m365/licenses/${skuId}/assign`), { user_id: userId });
    return data;
  },

  removeLicense: async (skuId, userId) => {
    const { data } = await api.delete(wsUrl(`/m365/licenses/${skuId}/assign/${userId}`));
    return data;
  },

  getGroups: async () => {
    const { data } = await api.get(wsUrl('/m365/groups'));
    return data;
  },

  getTeams: async () => {
    const { data } = await api.get(wsUrl('/m365/teams'));
    return data;
  },

  getTeamMembers: async (teamId) => {
    const { data } = await api.get(wsUrl(`/m365/teams/${teamId}/members`));
    return data;
  },

  addTeamMember: async (teamId, userId, roles = []) => {
    const { data } = await api.post(wsUrl(`/m365/teams/${teamId}/members`), { user_id: userId, roles });
    return data;
  },

  getGroupMembers: async (groupId) => {
    const { data } = await api.get(wsUrl(`/m365/groups/${groupId}/members`));
    return data;
  },

  addGroupMember: async (groupId, userId, roles = []) => {
    const { data } = await api.post(wsUrl(`/m365/groups/${groupId}/members`), { user_id: userId, roles });
    return data;
  },

  createUser: async (payload) => {
    const { data } = await api.post(wsUrl('/m365/users'), payload);
    return data;
  },

  createGroup: async (payload) => {
    const { data } = await api.post(wsUrl('/m365/groups'), payload);
    return data;
  },

  getUserAuthMethods: async (userId) => {
    const { data } = await api.get(wsUrl(`/m365/users/${userId}/auth-methods`));
    return data;
  },

  revokeUserSessions: async (userId) => {
    const { data } = await api.post(wsUrl(`/m365/users/${userId}/revoke-sessions`));
    return data;
  },

  deleteAuthMethod: async (userId, methodType, methodId) => {
    const { data } = await api.delete(wsUrl(`/m365/users/${userId}/auth-methods/${methodType}/${methodId}`));
    return data;
  },

  toggleUserAccount: async (userId, enabled) => {
    const { data } = await api.patch(wsUrl(`/m365/users/${userId}/toggle`), { enabled });
    return data;
  },

  resetUserPassword: async (userId, newPassword, forceChange = true) => {
    const { data } = await api.post(wsUrl(`/m365/users/${userId}/reset-password`), {
      new_password: newPassword,
      force_change: forceChange,
    });
    return data;
  },

  createTap: async (userId, lifetimeMinutes = 60, isUsableOnce = true) => {
    const { data } = await api.post(wsUrl(`/m365/users/${userId}/tap`), {
      lifetime_minutes: lifetimeMinutes,
      is_usable_once: isUsableOnce,
    });
    return data;
  },

  getUserGroups: async (userId) => {
    const { data } = await api.get(wsUrl(`/m365/users/${userId}/groups`));
    return data;
  },

  getServiceHealth: async () => {
    const { data } = await api.get(wsUrl('/m365/service-health'));
    return data;
  },

  getSecurity: async () => {
    const { data } = await api.get(wsUrl('/m365/security'));
    return data;
  },

  // ── MSP Master ─────────────────────────────────────────────────────────────

  getTenantsSummary: async (orgSlug) => {
    const { data } = await api.get(`/orgs/${orgSlug}/m365/tenants`);
    return data;
  },
};

export default m365Service;
