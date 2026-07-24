import api from './api';

const authService = {
  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },
  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },
  logoutServer: async (refreshToken) => {
    try {
      await api.post('/auth/logout', { refresh_token: refreshToken });
    } catch {
      // ignore
    }
  },
};

export default authService;
