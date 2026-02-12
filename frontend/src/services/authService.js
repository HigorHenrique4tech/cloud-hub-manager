import api from './api';

const authService = {
  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },

  register: async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    return data;
  },

  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },

  refreshToken: async (refreshToken) => {
    const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken });
    return data;
  },

  logoutServer: async (refreshToken) => {
    try {
      await api.post('/auth/logout', { refresh_token: refreshToken });
    } catch {
      // Ignore — token may already be expired/revoked
    }
  },

  listCredentials: async () => {
    const { data } = await api.get('/users/credentials');
    return data;
  },

  addCredential: async (provider, label, credData) => {
    const { data } = await api.post('/users/credentials', {
      provider,
      label,
      data: credData,
    });
    return data;
  },

  deleteCredential: async (id) => {
    await api.delete(`/users/credentials/${id}`);
  },
};

export default authService;
