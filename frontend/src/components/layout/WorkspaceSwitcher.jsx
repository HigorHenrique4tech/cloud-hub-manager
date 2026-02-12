import { useState, useRef, useEffect } from 'react';
import { Layers, ChevronDown, Plus, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import { hasAnyRole } from '../common/PermissionGate';

const WorkspaceSwitcher = () => {
  const { workspaces, currentWorkspace, currentOrg, switchWorkspace } = useOrgWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!currentWorkspace) return null;

  const canManage = hasAnyRole(currentOrg?.role, ['owner', 'admin']);

  return (
    <div className="relative px-2 mb-3" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                   bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300
                   hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Layers className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="flex-1 text-left truncate">{currentWorkspace.name}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-2 right-2 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl
                        border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Workspaces</p>
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <button
                  onClick={() => { switchWorkspace(ws.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
                    ${ws.id === currentWorkspace.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                >
                  <Layers className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left truncate">{ws.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {canManage && (
            <div className="border-t border-gray-100 dark:border-gray-700 flex">
              <button
                onClick={() => { setOpen(false); navigate('/settings/workspace'); }}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <Settings className="w-3.5 h-3.5" /> Gerenciar
              </button>
              <button
                onClick={() => { setOpen(false); navigate('/settings/workspace/new'); }}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs text-primary hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <Plus className="w-3.5 h-3.5" /> Novo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkspaceSwitcher;
