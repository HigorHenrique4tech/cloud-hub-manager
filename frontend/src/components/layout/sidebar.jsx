import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Server, Cloud, DollarSign, Settings, FileText, Building2, Layers, CreditCard } from 'lucide-react';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import PermissionGate from '../common/PermissionGate';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/aws', label: 'AWS', icon: Server, permission: 'resources.view' },
  { to: '/azure', label: 'Azure', icon: Cloud, permission: 'resources.view' },
  { to: '/costs', label: 'Custos', icon: DollarSign, permission: 'costs.view' },
  { to: '/logs', label: 'Logs', icon: FileText, permission: 'logs.view' },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

const bottomItems = [
  { to: '/billing', label: 'Faturamento', icon: CreditCard, permission: 'costs.view' },
  { to: '/org/settings', label: 'Organização', icon: Building2 },
  { to: '/workspace/settings', label: 'Workspace', icon: Layers },
];

const NavItem = ({ to, label, icon: Icon, end }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-primary text-white'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      }`
    }
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    {label}
  </NavLink>
);

const Sidebar = () => {
  return (
    <aside className="w-56 min-h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col pt-4 flex-shrink-0">
      {/* Workspace switcher */}
      <WorkspaceSwitcher />

      {/* Main navigation */}
      <nav className="flex-1 px-2 space-y-1">
        {navItems.map(({ to, label, icon, end, permission }) => {
          const item = <NavItem key={to} to={to} label={label} icon={icon} end={end} />;
          if (permission) {
            return (
              <PermissionGate key={to} permission={permission}>
                {item}
              </PermissionGate>
            );
          }
          return item;
        })}

        {/* Separator + settings links */}
        <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 space-y-1">
          {bottomItems.map(({ to, label, icon, permission }) => {
            const item = <NavItem key={to} to={to} label={label} icon={icon} />;
            if (permission) {
              return (
                <PermissionGate key={to} permission={permission}>
                  {item}
                </PermissionGate>
              );
            }
            return item;
          })}
        </div>
      </nav>

      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-400 dark:text-gray-500">v0.3.0</p>
      </div>
    </aside>
  );
};

export default Sidebar;
