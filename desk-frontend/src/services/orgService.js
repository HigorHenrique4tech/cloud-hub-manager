import api from './api';

const orgService = {
  listWorkspaces: (orgSlug) =>
    api.get(`/orgs/${orgSlug}/workspaces`).then((r) => r.data),

  listMyOrgs: () =>
    api.get('/auth/my-orgs').then((r) => r.data),
};

export default orgService;
