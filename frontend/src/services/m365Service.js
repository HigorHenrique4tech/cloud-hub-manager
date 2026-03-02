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

  // ── SharePoint Admin ────────────────────────────────────────────────────────

  getSites: (search) => api.get(wsUrl('/m365/sharepoint/sites'), { params: search ? { search } : {} }).then(r => r.data),
  getSite: (siteId) => api.get(wsUrl(`/m365/sharepoint/sites/${siteId}`)).then(r => r.data),
  getSiteDrives: (siteId) => api.get(wsUrl(`/m365/sharepoint/sites/${siteId}/drives`)).then(r => r.data),
  getDriveItems: (driveId, folderId) => api.get(wsUrl(`/m365/sharepoint/drives/${driveId}/items`), { params: folderId ? { folder_id: folderId } : {} }).then(r => r.data),
  getSharePointUsage: () => api.get(wsUrl('/m365/sharepoint/usage')).then(r => r.data),

  // ── Exchange Admin ───────────────────────────────────────────────────────────

  getMailboxes: () => api.get(wsUrl('/m365/exchange/mailboxes')).then(r => r.data),
  getMailboxSettings: (userId) => api.get(wsUrl(`/m365/exchange/users/${userId}/mailbox-settings`)).then(r => r.data),
  updateMailboxSettings: (userId, data) => api.patch(wsUrl(`/m365/exchange/users/${userId}/mailbox-settings`), data).then(r => r.data),
  getEmailActivity: () => api.get(wsUrl('/m365/exchange/activity')).then(r => r.data),

  // ── Teams Admin ──────────────────────────────────────────────────────────────

  createTeam: (data) => api.post(wsUrl('/m365/teams'), data).then(r => r.data),
  updateTeam: (teamId, data) => api.patch(wsUrl(`/m365/teams/${teamId}`), data).then(r => r.data),
  archiveTeam: (teamId) => api.post(wsUrl(`/m365/teams/${teamId}/archive`)).then(r => r.data),
  getChannels: (teamId) => api.get(wsUrl(`/m365/teams/${teamId}/channels`)).then(r => r.data),
  createChannel: (teamId, data) => api.post(wsUrl(`/m365/teams/${teamId}/channels`), data).then(r => r.data),
  deleteChannel: (teamId, channelId) => api.delete(wsUrl(`/m365/teams/${teamId}/channels/${channelId}`)).then(r => r.data),
  updateMemberRole: (teamId, memberId, roles) => api.patch(wsUrl(`/m365/teams/${teamId}/members/${memberId}`), { roles }).then(r => r.data),
  removeTeamMember: (teamId, memberId) => api.delete(wsUrl(`/m365/teams/${teamId}/members/${memberId}`)).then(r => r.data),
  getTeamsActivity: () => api.get(wsUrl('/m365/teams/activity')).then(r => r.data),

  // ── Guest Users ──────────────────────────────────────────────────────────────
  getGuests: () => api.get(wsUrl('/m365/guests')).then(r => r.data),
  inviteGuest: (data) => api.post(wsUrl('/m365/guests/invite'), data).then(r => r.data),
  deleteGuest: (userId) => api.delete(wsUrl(`/m365/guests/${userId}`)).then(r => r.data),

  // ── Audit Logs ───────────────────────────────────────────────────────────────
  getSignIns: (params) => api.get(wsUrl('/m365/audit/sign-ins'), { params }).then(r => r.data),
  getDirectoryAudits: (params) => api.get(wsUrl('/m365/audit/directory'), { params }).then(r => r.data),

  // ── OneDrive Usage ───────────────────────────────────────────────────────────
  getOneDriveUsage: () => api.get(wsUrl('/m365/sharepoint/onedrive-usage')).then(r => r.data),

  // ── Offboarding ──────────────────────────────────────────────────────────────
  offboardUser: (userId, data) => api.post(wsUrl(`/m365/users/${userId}/offboard`), data).then(r => r.data),

  // ── Shared Mailboxes & Distribution Lists ────────────────────────────────────
  getSharedMailboxes: () => api.get(wsUrl('/m365/exchange/shared-mailboxes')).then(r => r.data),
  getDistributionLists: () => api.get(wsUrl('/m365/exchange/distribution-lists')).then(r => r.data),
  getDistributionListMembers: (groupId) => api.get(wsUrl(`/m365/exchange/distribution-lists/${groupId}/members`)).then(r => r.data),
  addDistributionListMember: (groupId, userId) => api.post(wsUrl(`/m365/exchange/distribution-lists/${groupId}/members`), { user_id: userId }).then(r => r.data),
  removeDistributionListMember: (groupId, userId) => api.delete(wsUrl(`/m365/exchange/distribution-lists/${groupId}/members/${userId}`)).then(r => r.data),
  createDistributionList: (data) => api.post(wsUrl('/m365/exchange/distribution-lists'), data).then(r => r.data),
};

export default m365Service;
