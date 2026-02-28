import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, DollarSign, Settings, FileText,
  Building2, Layers, CreditCard, Zap, Clock, Network,
  ShieldCheck, Webhook, Grid3x3, PackageSearch,
} from 'lucide-react';
import { AwsIcon, AzureIcon, GcpIcon } from '../common/CloudProviderIcons';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import PermissionGate from '../common/PermissionGate';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Nav item with optional per-cloud active color.
 * activeColor: Tailwind classes applied when the route is active.
 * Falls back to the global bg-primary style when not specified.
 */
const NavItem = ({ to, label, icon: Icon, end, activeColor }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) => {
      const base = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors';
      if (isActive) {
        return `${base} ${activeColor ?? 'bg-primary text-white'}`;
      }
      return `${base} text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100`;
    }}
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    {label}
  </NavLink>
);

/** Subtle uppercase section label between nav groups. */
const SectionLabel = ({ children }) => (
  <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-600 select-none">
    {children}
  </p>
);

// ── Cloud active-state colors ─────────────────────────────────────────────────

const CLOUD_ACTIVE = {
  aws:  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  azure: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  gcp:  'bg-green-500/10 text-green-600 dark:text-green-400',
  m365: 'bg-blue-600/10 text-blue-600 dark:text-blue-400',
};

// ── Sidebar ───────────────────────────────────────────────────────────────────

const Sidebar = () => {
  const { isMasterOrg, currentOrg } = useOrgWorkspace();
  const { user } = useAuth();
  const isEnterprise = currentOrg?.plan_tier === 'enterprise';

  return (
    <aside className="w-56 min-h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col pt-4 flex-shrink-0">
      {/* Workspace switcher */}
      <WorkspaceSwitcher />

      {/* Main navigation — scrollable */}
      <nav className="flex-1 px-2 overflow-y-auto">

        {/* Dashboard */}
        <NavItem to="/" label="Dashboard" icon={LayoutDashboard} end />

        {/* ── Nuvem ── */}
        <SectionLabel>Nuvem</SectionLabel>

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
          <NavItem to="/m365" label="Microsoft 365" icon={Grid3x3} activeColor={CLOUD_ACTIVE.m365} />
        )}

        {/* ── Ferramentas ── */}
        <SectionLabel>Ferramentas</SectionLabel>

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
        <PermissionGate permission="webhooks.view">
          <NavItem to="/webhooks" label="Webhooks" icon={Webhook} />
        </PermissionGate>
        <PermissionGate permission="logs.view">
          <NavItem to="/logs" label="Logs" icon={FileText} />
        </PermissionGate>

        {/* ── Conta / Org ── */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1">
          <PermissionGate permission="costs.view">
            <NavItem to="/billing" label="Faturamento" icon={CreditCard} />
          </PermissionGate>
          <NavItem to="/org/settings" label="Organização" icon={Building2} />
          <NavItem to="/workspace/settings" label="Workspace" icon={Layers} />
          {isEnterprise && (isMasterOrg || currentOrg?.org_type === 'standalone') && (
            <NavItem to="/org/managed" label="Orgs Gerenciadas" icon={Network} />
          )}
          {user?.is_admin && (
            <NavItem to="/admin" label="Admin" icon={ShieldCheck} />
          )}
        </div>
      </nav>

      {/* Configurações — pinned at the very bottom */}
      <div className="px-2 pt-1 border-t border-gray-200 dark:border-gray-700">
        <NavItem to="/settings" label="Configurações" icon={Settings} />
      </div>

      <div className="px-4 py-2">
        <p className="text-xs text-gray-400 dark:text-gray-500">v0.3.0</p>
      </div>
    </aside>
  );
};

export default Sidebar;
