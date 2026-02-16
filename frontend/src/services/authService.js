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

  updateProfile: async (data) => {
    const { data: result } = await api.put('/auth/me', data);
    return result;
  },

  changePassword: async (currentPassword, newPassword) => {
    const { data: result } = await api.put('/auth/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return result;
  },

  verifyEmail: async (token) => {
    const { data } = await api.get(`/auth/verify/${token}`);
    return data;
  },

  resendVerification: async (email) => {
    const { data } = await api.post('/auth/resend-verification', { email });
    return data;
  },

  getMyInvitations: async () => {
    const { data } = await api.get('/auth/invitations');
    return data;
  },

  acceptInvitation: async (token) => {
    const { data } = await api.post(`/auth/invitations/${token}/accept`);
    return data;
  },
};

export default authService;
