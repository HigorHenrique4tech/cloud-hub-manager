import { Sun, Moon, LogOut, Bell, Mail, CheckCircle2, Crown, TrendingDown, Clock, Zap, Headphones, Shield, Hourglass, CloudCog, Users, CreditCard, Wallet, Menu } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import SearchBar from '../common/SearchBar';
import CommandPalette from '../common/CommandPalette';
import OrgSwitcher from './OrgSwitcher';
import NewTicketModal from '../support/NewTicketModal';
import Logo from '../common/Logo';
import alertService from '../../services/alertService';
import authService from '../../services/authService';

const Header = ({ onMenuToggle }) => {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { currentOrg, refreshOrgs } = useOrgWorkspace();
  const navigate = useNavigate();
  const [bellOpen, setBellOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const bellRef = useRef(null);
  const inviteRef = useRef(null);
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

  // Pending invitations for current user
  const { data: myInvitesData } = useQuery({
    queryKey: ['my-invitations'],
    queryFn: () => authService.getMyInvitations(),
    refetchInterval: 120000,
    retry: false,
    enabled: !!user,
  });
  const myInvites = myInvitesData?.invitations || [];

  const acceptMutation = useMutation({
    mutationFn: (token) => authService.acceptInvitation(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-invitations'] });
      refreshOrgs();
    },
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (inviteRef.current && !inviteRef.current.contains(e.target)) setInviteOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Ctrl+K → toggle command palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="header-bar z-40 relative">
      <div className="px-5 sm:px-8 py-3.5">
        <div className="flex items-center gap-4">
          {/* Mobile menu toggle */}
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <Logo size="md" />

          {/* Org switcher */}
          <OrgSwitcher />

          {/* Search bar — opens command palette */}
          <div className="flex-1 flex justify-center">
            <SearchBar onClick={() => setPaletteOpen(true)} />
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Invitation indicator */}
            {myInvites.length > 0 && (
              <div className="relative" ref={inviteRef}>
                <button
                  onClick={() => setInviteOpen((o) => !o)}
                  title="Convites pendentes"
                  className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100
                             dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700
                             transition-colors"
                >
                  <Mail className="w-5 h-5" />
                  <span className="absolute top-1 right-1 flex items-center justify-center
                                   w-4 h-4 text-[10px] font-bold text-white bg-primary rounded-full">
                    {myInvites.length > 9 ? '9+' : myInvites.length}
                  </span>
                </button>

                {inviteOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl
                                  border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Convites ({myInvites.length})
                      </span>
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-72 overflow-y-auto">
                      {myInvites.map((inv) => (
                        <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                              {inv.organization_name}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              Role: {inv.role}
                            </p>
                          </div>
                          <button
                            onClick={() => acceptMutation.mutate(inv.token)}
                            disabled={acceptMutation.isPending}
                            className="flex items-center gap-1 px-2.5 py-1 bg-primary text-white text-xs rounded-lg
                                       hover:bg-primary/90 disabled:opacity-50 flex-shrink-0"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Aceitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Support shortcut */}
            <button
              onClick={() => setTicketOpen(true)}
              title="Abrir chamado de suporte"
              className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100
                         dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700
                         transition-colors"
            >
              <Headphones className="w-5 h-5" />
            </button>

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
                <div role="menu" aria-label="Alertas" className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl
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
                      {unreadEvents.map((ev) => {
                        const TYPE_META = {
                          anomaly:     { Icon: TrendingDown, color: 'text-red-500',    label: 'Anomalia' },
                          budget:      { Icon: Wallet,       color: 'text-yellow-500', label: 'Orçamento' },
                          schedule:    { Icon: Clock,        color: 'text-blue-500',   label: 'Agendamento' },
                          finops_scan: { Icon: Zap,          color: 'text-indigo-500', label: 'FinOps' },
                          cost_alert:  { Icon: Bell,         color: 'text-orange-500', label: 'Alerta' },
                          trial:       { Icon: Hourglass,    color: 'text-purple-500', label: 'Trial' },
                          approval:    { Icon: CheckCircle2, color: 'text-green-500',  label: 'Aprovação' },
                          policy:      { Icon: Shield,       color: 'text-slate-500',  label: 'Política' },
                          security:    { Icon: Shield,       color: 'text-red-500',    label: 'Segurança' },
                          cloud_account: { Icon: CloudCog,   color: 'text-cyan-500',   label: 'Conta Cloud' },
                          workspace:   { Icon: Users,        color: 'text-teal-500',   label: 'Workspace' },
                          billing:     { Icon: CreditCard,   color: 'text-green-500',  label: 'Cobrança' },
                          member:      { Icon: Users,        color: 'text-blue-500',   label: 'Membro' },
                          plan:        { Icon: Crown,        color: 'text-amber-500',  label: 'Plano' },
                        };
                        const meta = TYPE_META[ev.notification_type] || TYPE_META.cost_alert;
                        const { Icon, color, label } = meta;
                        return (
                          <li
                            key={ev.id}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                            onClick={() => { setBellOpen(false); navigate(ev.link_to || '/costs'); }}
                          >
                            <Icon className={`w-4 h-4 ${color} mt-0.5 flex-shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
                              <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">{ev.message}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {new Date(ev.triggered_at).toLocaleString('pt-BR')}
                              </p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); markReadMutation.mutate(ev.id); }}
                              className="flex-shrink-0 text-gray-300 hover:text-green-500 dark:hover:text-green-400 transition-colors"
                              title="Marcar como lido"
                            >
                              ✓
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Plan badge */}
            {currentOrg && (
              <button
                onClick={() => navigate('/billing')}
                title="Gerenciar plano"
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  (currentOrg.effective_plan || currentOrg.plan_tier) === 'pro'
                    ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary hover:bg-primary/20 dark:hover:bg-primary/30'
                    : ['enterprise', 'enterprise_migration'].includes(currentOrg.effective_plan || currentOrg.plan_tier)
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <Crown className={`w-3.5 h-3.5 ${
                  (currentOrg.effective_plan || currentOrg.plan_tier) === 'pro'
                    ? 'text-primary'
                    : ['enterprise', 'enterprise_migration'].includes(currentOrg.effective_plan || currentOrg.plan_tier)
                      ? 'text-amber-500'
                      : 'text-gray-400 dark:text-gray-500'
                }`} />
                {(() => {
                  const ep = currentOrg.effective_plan || currentOrg.plan_tier;
                  const isTrial = currentOrg.trial?.trial_active && currentOrg.plan_tier === 'free';
                  if (ep === 'enterprise_migration') return 'Enterprise + Migration';
                  if (ep === 'enterprise') return 'Enterprise';
                  if (ep === 'pro') return isTrial ? 'Trial Pro' : 'Pro';
                  return 'Free';
                })()}
              </button>
            )}

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

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {ticketOpen && <NewTicketModal onClose={() => setTicketOpen(false)} />}
    </header>
  );
};

export default Header;
