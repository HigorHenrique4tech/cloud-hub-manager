import { Cloud, Sun, Moon, LogOut, Bell } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import SearchBar from '../common/SearchBar';
import OrgSwitcher from './OrgSwitcher';
import alertService from '../../services/alertService';

const Header = () => {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);
  const qc = useQueryClient();

  const { data: eventsData } = useQuery({
    queryKey: ['alert-events-unread'],
    queryFn: () => alertService.getEvents({ unread_only: true, limit: 5 }),
    refetchInterval: 60000,
    retry: false,
  });
  const unreadEvents = eventsData?.events || eventsData || [];
  const unreadCount = unreadEvents.length;

  const markReadMutation = useMutation({
    mutationFn: (id) => alertService.markEventRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-events-unread'] });
      qc.invalidateQueries({ queryKey: ['alert-events'] });
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm z-10">
      <div className="px-4 sm:px-6 py-3">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Cloud className="w-7 h-7 text-primary" />
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100 hidden sm:block">
              Cloud Hub Manager
            </span>
          </div>

          {/* Org switcher */}
          <OrgSwitcher />

          {/* Search bar — fills available space */}
          <div className="flex-1 flex justify-center">
            <SearchBar />
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Bell notification */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setBellOpen((o) => !o)}
                title="Alertas de custo"
                className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100
                           dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700
                           transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex items-center justify-center
                                   w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl
                                border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Alertas não lidos {unreadCount > 0 && `(${unreadCount})`}
                    </span>
                    <button
                      onClick={() => { setBellOpen(false); navigate('/costs'); }}
                      className="text-xs text-primary hover:underline"
                    >
                      Ver todos
                    </button>
                  </div>
                  {unreadEvents.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 px-4 py-4 text-center">
                      Nenhum alerta não lido
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-72 overflow-y-auto">
                      {unreadEvents.map((ev) => (
                        <li key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <Bell className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">{ev.message}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(ev.triggered_at).toLocaleString('pt-BR')}
                            </p>
                          </div>
                          <button
                            onClick={() => markReadMutation.mutate(ev.id)}
                            className="flex-shrink-0 text-gray-300 hover:text-green-500 dark:hover:text-green-400 transition-colors"
                            title="Marcar como lido"
                          >
                            ✓
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100
                         dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700
                         transition-colors"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* User info + logout */}
            {user && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-300 hidden md:block">
                  {user.name || user.email}
                </span>
                <button
                  onClick={handleLogout}
                  title="Sair"
                  className="p-2 rounded-lg text-gray-500 hover:text-danger hover:bg-red-50
                             dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20
                             transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
