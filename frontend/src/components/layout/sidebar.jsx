import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Server, Cloud, DollarSign, Settings, FileText } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/aws', label: 'AWS', icon: Server },
  { to: '/azure', label: 'Azure', icon: Cloud },
  { to: '/costs', label: 'Custos', icon: DollarSign },
  { to: '/logs', label: 'Logs', icon: FileText },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

const Sidebar = () => {
  return (
    <aside className="w-56 min-h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col pt-4 flex-shrink-0">
      <nav className="flex-1 px-2 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
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
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-400 dark:text-gray-500">v0.2.0</p>
      </div>
    </aside>
  );
};

export default Sidebar;
