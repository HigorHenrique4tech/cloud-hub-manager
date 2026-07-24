import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import api, { setAccessToken, clearAccessToken } from '../services/api';
import authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        // C3 — restore session via HttpOnly refresh cookie (no localStorage read)
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        setAccessToken(data.access_token);
        api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
        setToken(data.access_token);
        const me = await authService.getMe();
        setUser(me);
      } catch {
        clearAccessToken();
        setToken(null);
      }
      setLoading(false);
    };
    init();
  }, []);

  // useCallback with [] — React guarantees state setters (setToken/setUser) are stable,
  // so these refs never change. Stable refs prevent spurious useEffect re-runs in
  // consumers (e.g. OAuthCallback) that list these functions as dependencies.
  const login = useCallback(async (email, password) => {
    const data = await authService.login(email, password);
    if (data.mfa_required) return data;
    setAccessToken(data.access_token);
    api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
    setToken(data.access_token);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await authService.register(name, email, password);
    setAccessToken(data.access_token);
    api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
    setToken(data.access_token);
    setUser(data.user);
    return data;
  }, []);

  /** Set auth state from a TokenResponse (used by OAuth callback and MFA verify) */
  const loginWithTokens = useCallback((data) => {
    setAccessToken(data.access_token);
    api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
    setToken(data.access_token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logoutServer();
    clearAccessToken();
    localStorage.removeItem('selectedOrg');
    localStorage.removeItem('selectedWorkspace');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, token, loading, login, register, loginWithTokens, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
