import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, MonitorPlay, HardDrive, Database, Zap, Network, ShieldAlert, HardDriveDownload, ChevronLeft, ChevronRight } from 'lucide-react';

const gcpNavItems = [
  { to: '/gcp', label: 'Visão Geral', icon: LayoutGrid, end: true },
  { to: '/gcp/compute', label: 'Compute Engine', icon: MonitorPlay },
  { to: '/gcp/storage', label: 'Cloud Storage', icon: HardDrive },
  { to: '/gcp/sql', label: 'Cloud SQL', icon: Database },
  { to: '/gcp/functions', label: 'Cloud Functions', icon: Zap },
  { to: '/gcp/networks', label: 'VPC Networks', icon: Network },
  { to: '/gcp/backup', label: 'Backup', icon: HardDriveDownload },
  { to: '/gcp/security', label: 'Segurança', icon: ShieldAlert },
];

const GcpSecondarySidebar = () => {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-gcp-collapsed') === 'true'; } catch { return false; }
  });

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('sidebar-gcp-collapsed', String(next)); } catch {}
  };

  return (
    <aside
      className={`${collapsed ? 'w-12' : 'w-48'} min-h-screen bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0 relative transition-all duration-200`}
    >
      {/* Header */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            GCP
          </p>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 px-1.5 py-2 space-y-0.5">
        {gcpNavItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-green-500 text-white'
                  : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle button */}
      <button
        onClick={toggle}
        className="absolute -right-3 top-6 z-10 w-6 h-6 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        title={collapsed ? 'Expandir' : 'Recolher'}
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-gray-500 dark:text-gray-400" />
          : <ChevronLeft className="w-3 h-3 text-gray-500 dark:text-gray-400" />
        }
      </button>
    </aside>
  );
};

export default GcpSecondarySidebar;
