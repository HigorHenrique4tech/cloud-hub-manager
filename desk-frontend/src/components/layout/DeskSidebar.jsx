import { NavLink, useNavigate } from 'react-router-dom';
import { LifeBuoy, ShieldCheck, ExternalLink, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const HUB_URL = 'https://hub.cloudatlas.app.br';

const NavItem = ({ to, label, icon: Icon, end }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) => {
      const base = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors';
      return isActive
        ? `${base} bg-primary text-white`
        : `${base} text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100`;
    }}
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    <span>{label}</span>
  </NavLink>
);

export default function DeskSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isStaff = user?.is_admin || user?.is_helpdesk;

  return (
    <aside className="w-56 min-h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col pt-4 flex-shrink-0">
      {/* Logo */}
      <div className="px-4 pb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <LifeBuoy className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">CloudAtlas</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 -mt-0.5">Desk</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-1">
        <NavItem to="/" label="Meus Tickets" icon={LifeBuoy} end />
        {isStaff && (
          <NavItem to="/painel" label="Painel Helpdesk" icon={ShieldCheck} />
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1 pb-4">
        <a
          href={HUB_URL}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500
                     hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700
                     dark:hover:text-gray-100 transition-colors"
        >
          <ExternalLink className="w-5 h-5 flex-shrink-0" />
          Ir para o Hub
        </a>
        {user && (
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                {user.name || user.email}
              </p>
              <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-danger hover:bg-red-50
                         dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
