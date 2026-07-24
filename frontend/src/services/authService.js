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

  refreshToken: async () => {
    const { data } = await api.post('/auth/refresh', {});
    return data;
  },

  logoutServer: async () => {
    try {
      await api.post('/auth/logout', {});
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

  // MFA
  verifyMFA: async (mfaToken, otp) => {
    const { data } = await api.post('/auth/mfa/verify', { mfa_token: mfaToken, otp });
    return data;
  },

  resendMFA: async (mfaToken) => {
    const { data } = await api.post('/auth/mfa/resend', { mfa_token: mfaToken });
    return data;
  },

  toggleMFA: async (enabled, password) => {
    const { data } = await api.put('/auth/me/mfa', { enabled, password });
    return data;
  },

  markOnboardingComplete: async () => {
    const { data } = await api.put('/auth/me', { onboarding_completed: true });
    return data;
  },

  updateCompanyInfo: async (payload) => {
    const { data } = await api.put('/auth/me/company-info', payload);
    return data;
  },

  validateCnpj: async (cnpj) => {
    const digits = cnpj.replace(/\D/g, '');
    const { data } = await api.get(`/auth/cnpj/${digits}`);
    return data;
  },

  // Password reset
  forgotPassword: async (email) => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  },

  resetPassword: async (token, newPassword) => {
    const { data } = await api.post('/auth/reset-password', { token, new_password: newPassword });
    return data;
  },

  // Termos de uso
  acceptTerms: async () => {
    const { data } = await api.post('/auth/terms/accept');
    return data;
  },

  // OAuth
  createOAuthState: async (provider) => {
    const { data } = await api.post('/auth/oauth/state', { provider });
    return data.state;
  },

  googleCallback: async (code, redirectUri, state) => {
    const { data } = await api.post('/auth/google/callback', { code, redirect_uri: redirectUri, state });
    return data;
  },

  githubCallback: async (code, state) => {
    const { data } = await api.post('/auth/github/callback', { code, state });
    return data;
  },

  microsoftCallback: async (code, redirectUri, state) => {
    const { data } = await api.post('/auth/microsoft/callback', { code, redirect_uri: redirectUri, state });
    return data;
  },

  // LGPD
  exportMyData: async () => {
    const { data } = await api.get('/auth/me/export');
    return data;
  },

  deleteAccount: async (password) => {
    const { data } = await api.delete('/auth/me/account', { data: { password } });
    return data;
  },
};

export default authService;
