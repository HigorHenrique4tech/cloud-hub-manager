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

  getTeams: async () => {
    const { data } = await api.get(wsUrl('/m365/teams'));
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
