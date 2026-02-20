import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, ChevronDown, Trash2, LayoutTemplate } from 'lucide-react';
import templateService from '../../services/templateService';
import SaveTemplateModal from './SaveTemplateModal';
import PermissionGate from './PermissionGate';

/**
 * Bar shown at the top of a CreateResourceModal to load or save templates.
 *
 * Props:
 *   provider      — 'aws' | 'azure'
 *   resourceType  — 'ec2' | 's3' | 'rds' | etc.
 *   currentForm   — current form state (passed to SaveTemplateModal)
 *   onLoad        — (formConfig: object) => void — called when user picks a template
 */
const TemplateBar = ({ provider, resourceType, currentForm, onLoad }) => {
  const qc = useQueryClient();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadedName, setLoadedName] = useState(null);
  const dropdownRef = useRef(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', provider, resourceType],
    queryFn: () => templateService.getTemplates({ provider, resourceType }),
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: templateService.deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', provider, resourceType] }),
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLoad = (template) => {
    onLoad(template.form_config);
    setLoadedName(template.name);
    setDropdownOpen(false);
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (window.confirm('Excluir este template?')) {
      deleteMut.mutate(id);
      if (loadedName) setLoadedName(null);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      {/* Left: load dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
        >
          <LayoutTemplate size={13} />
          {loadedName ? (
            <span className="max-w-[160px] truncate text-indigo-300">{loadedName}</span>
          ) : (
            'Carregar template'
          )}
          <ChevronDown size={12} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
            {templates.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500">Nenhum template salvo para este tipo de recurso.</p>
            ) : (
              <ul>
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => handleLoad(t)}
                      className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-800 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{t.name}</p>
                        {t.description && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">{t.description}</p>
                        )}
                      </div>
                      <PermissionGate permission="templates.manage">
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, t.id)}
                          className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </PermissionGate>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Right: save button */}
      <PermissionGate permission="templates.manage">
        <button
          type="button"
          onClick={() => setSaveModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-indigo-500 hover:text-indigo-300 transition-colors"
        >
          <BookmarkPlus size={13} />
          Salvar como template
        </button>
      </PermissionGate>

      {saveModalOpen && (
        <SaveTemplateModal
          provider={provider}
          resourceType={resourceType}
          formConfig={currentForm}
          onClose={() => setSaveModalOpen(false)}
        />
      )}
    </div>
  );
};

export default TemplateBar;
