import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, DollarSign, Settings, FileText,
  Building2, Layers, CreditCard, Zap, Clock, Network,
  ShieldCheck, Bell, PackageSearch, GitPullRequestArrow, ChevronDown,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AwsIcon, AzureIcon, GcpIcon, M365Icon } from '../common/CloudProviderIcons';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import PermissionGate from '../common/PermissionGate';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import approvalService from '../../services/approvalService';

// ── Prefetch map: route → lazy import for preloading on hover ─────────────────
const _prefetchMap = {
  '/': () => import('../../pages/dashboard'),
  '/aws': () => import('../../pages/aws/AwsOverview'),
  '/azure': () => import('../../pages/azure/AzureOverview'),
  '/gcp': () => import('../../pages/gcp/GcpOverview'),
  '/m365': () => import('../../pages/m365/M365Dashboard'),
  '/costs': () => import('../../pages/costs'),
  '/finops': () => import('../../pages/FinOps'),
  '/inventory': () => import('../../pages/Inventory'),
  '/schedules': () => import('../../pages/Schedules'),
  '/approvals': () => import('../../pages/ApprovalsPage'),
  '/notifications': () => import('../../pages/NotificationChannels'),
  '/logs': () => import('../../pages/logs'),
  '/security/automation': () => import('../../pages/security/SecurityAutomation'),
  '/billing': () => import('../../pages/Billing'),
  '/org/settings': () => import('../../pages/OrgSettings'),
  '/workspace/settings': () => import('../../pages/WorkspaceSettings'),
  '/org/managed': () => import('../../pages/ManagedOrgsPage'),
  '/admin': () => import('../../pages/AdminPanel'),
  '/settings': () => import('../../pages/settings'),
};
const _prefetched = new Set();
const prefetch = (to) => {
  if (_prefetched.has(to)) return;
  const loader = _prefetchMap[to];
  if (loader) { _prefetched.add(to); loader(); }
};

// ── Sub-components ────────────────────────────────────────────────────────────

const NavItem = ({ to, label, icon: Icon, end, activeColor, badge }) => (
  <NavLink
    to={to}
    end={end}
    onMouseEnter={() => prefetch(to)}
    className={({ isActive }) => {
      const base = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors';
      if (isActive) {
        return `${base} ${activeColor ?? 'bg-primary/10 text-primary dark:text-primary-light'}`;
      }
      return `${base} text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100`;
    }}
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    <span className="flex-1">{label}</span>
    {badge > 0 && (
      <span aria-label={`${badge} pendentes`} className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500 dark:bg-amber-600 text-white text-[10px] font-bold">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </NavLink>
);

/** Collapsible section group. Persists open/closed state in localStorage. */
const NavSection = ({ label, storageKey, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== 'false'; } catch { return defaultOpen; }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* ignore */ }
  };

  return (
    <div>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-500 select-none transition-colors"
      >
        {label}
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
};

// ── Cloud active-state colors ─────────────────────────────────────────────────

const CLOUD_ACTIVE = {
  aws:  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  azure: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  gcp:  'bg-green-500/10 text-green-600 dark:text-green-400',
  m365: 'bg-blue-600/10 text-blue-600 dark:text-blue-400',
};

// ── Sidebar ───────────────────────────────────────────────────────────────────

const Sidebar = ({ mobileOpen, onClose }) => {
  const { isMasterOrg, currentOrg } = useOrgWorkspace();
  const { user } = useAuth();
  const effectivePlan = currentOrg?.effective_plan || currentOrg?.plan_tier || 'free';
  const isEnterprise = effectivePlan === 'enterprise' || effectivePlan === 'enterprise_migration';

  const pendingCountQ = useQuery({
    queryKey: ['approvals-count'],
    queryFn: approvalService.getCount,
    refetchInterval: 60_000,
    select: (d) => d?.pending ?? 0,
  });

  const pendingCount = pendingCountQ.data ?? 0;

  return (
    <aside aria-label="Menu principal" className={`w-56 min-h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col pt-4 flex-shrink-0 transition-transform duration-200 ease-in-out fixed lg:static z-40 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      {/* Workspace switcher */}
      <WorkspaceSwitcher />

      {/* Main navigation — scrollable */}
      <nav className="flex-1 px-2 overflow-y-auto" aria-label="Navegação principal">

        {/* Dashboard */}
        <div className="mb-1">
          <NavItem to="/" label="Dashboard" icon={LayoutDashboard} end />
        </div>

        {/* ── Nuvem ── */}
        <NavSection label="Nuvem" storageKey="sidebar-section-cloud">
          <PermissionGate permission="resources.view">
            <NavItem to="/aws"   label="AWS"   icon={AwsIcon}   activeColor={CLOUD_ACTIVE.aws} />
          </PermissionGate>
          <PermissionGate permission="resources.view">
            <NavItem to="/azure" label="Azure" icon={AzureIcon} activeColor={CLOUD_ACTIVE.azure} />
          </PermissionGate>
          <PermissionGate permission="resources.view">
            <NavItem to="/gcp"   label="GCP"   icon={GcpIcon}   activeColor={CLOUD_ACTIVE.gcp} />
          </PermissionGate>
          {isEnterprise && (
            <NavItem to="/m365" label="Microsoft 365" icon={M365Icon} activeColor={CLOUD_ACTIVE.m365} />
          )}
        </NavSection>

        {/* ── Ferramentas ── */}
        <NavSection label="Ferramentas" storageKey="sidebar-section-tools">
          <PermissionGate permission="costs.view">
            <NavItem to="/costs" label="Custos" icon={DollarSign} />
          </PermissionGate>
          <PermissionGate permission="finops.view">
            <NavItem to="/finops" label="FinOps" icon={Zap} />
          </PermissionGate>
          <PermissionGate permission="resources.view">
            <NavItem to="/inventory" label="Inventário" icon={PackageSearch} />
          </PermissionGate>
          <PermissionGate permission="resources.view">
            <NavItem to="/schedules" label="Agendamentos" icon={Clock} />
          </PermissionGate>
          <PermissionGate permission="resources.manage">
            <NavItem to="/approvals" label="Aprovações" icon={GitPullRequestArrow} badge={pendingCount} />
          </PermissionGate>
          <PermissionGate permission="webhooks.view">
            <NavItem to="/notifications" label="Notificações" icon={Bell} />
          </PermissionGate>
          <PermissionGate permission="logs.view">
            <NavItem to="/logs" label="Logs" icon={FileText} />
          </PermissionGate>
          <PermissionGate permission="resources.manage">
            <NavItem to="/security/automation" label="Segurança" icon={ShieldCheck} />
          </PermissionGate>
        </NavSection>

        {/* ── Conta / Org ── */}
        <NavSection label="Conta" storageKey="sidebar-section-account" defaultOpen={false}>
          <PermissionGate permission="costs.view">
            <NavItem to="/billing" label="Faturamento" icon={CreditCard} />
          </PermissionGate>
          {['owner', 'admin', 'billing'].includes(currentOrg?.role) && (
            <NavItem to="/org/settings" label="Organização" icon={Building2} />
          )}
          {['owner', 'admin'].includes(currentOrg?.role) && (
            <NavItem to="/workspace/settings" label="Workspace" icon={Layers} />
          )}
          {isEnterprise && (isMasterOrg || currentOrg?.org_type === 'standalone') && (
            <NavItem to="/org/managed" label="Orgs Gerenciadas" icon={Network} />
          )}
          {user?.is_admin && (
            <NavItem to="/admin" label="Admin" icon={ShieldCheck} />
          )}
        </NavSection>
      </nav>

      {/* Configurações — pinned at the very bottom */}
      <div className="px-2 pt-1 border-t border-gray-200 dark:border-gray-700">
        <NavItem to="/settings" label="Configurações" icon={Settings} />
      </div>

      <div className="px-4 py-2">
        <p className="text-xs text-gray-400 dark:text-gray-500">v1.0.0</p>
      </div>
    </aside>
  );
};

export default Sidebar;
