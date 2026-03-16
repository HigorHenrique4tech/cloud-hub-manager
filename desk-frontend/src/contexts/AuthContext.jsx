import { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('desk_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (token) {
        try {
          const me = await authService.getMe();
          setUser(me);
          // Persist org slug from hub if not set
          if (!localStorage.getItem('selectedOrg') && me.organizations?.length) {
            localStorage.setItem('selectedOrg', me.organizations[0].slug);
          }
        } catch {
          localStorage.removeItem('desk_token');
          localStorage.removeItem('desk_refreshToken');
          setToken(null);
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (email, password) => {
    const data = await authService.login(email, password);
    if (data.mfa_required) return data;
    localStorage.setItem('desk_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('desk_refreshToken', data.refresh_token);
    // Also set selectedOrg from first org if available
    if (data.user?.organizations?.length && !localStorage.getItem('selectedOrg')) {
      localStorage.setItem('selectedOrg', data.user.organizations[0].slug);
    }
    setToken(data.access_token);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    const rt = localStorage.getItem('desk_refreshToken');
    if (rt) await authService.logoutServer(rt);
    localStorage.removeItem('desk_token');
    localStorage.removeItem('desk_refreshToken');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
