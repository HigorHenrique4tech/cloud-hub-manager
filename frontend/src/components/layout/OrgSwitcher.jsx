import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';

const OrgSwitcher = () => {
  const { orgs, currentOrg, switchOrg } = useOrgWorkspace();
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

  if (!currentOrg) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                   text-gray-700 dark:text-gray-300
                   hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Building2 className="w-4 h-4 text-primary" />
        <span className="max-w-[140px] truncate">{currentOrg.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 uppercase">
          {currentOrg.role}
        </span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl
                        border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Organizações</p>
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {orgs.map((org) => (
              <li key={org.id}>
                <button
                  onClick={() => { switchOrg(org.slug); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
                    ${org.slug === currentOrg.slug
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                >
                  <Building2 className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left truncate">{org.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 uppercase">
                    {org.role}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={() => { setOpen(false); navigate('/orgs/new'); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <Plus className="w-4 h-4" />
              Criar organização
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgSwitcher;
