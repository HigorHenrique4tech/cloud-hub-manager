import { useEffect } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useDashboardConfig, WIDGET_META } from '../../contexts/DashboardConfigContext';

const DashboardCustomizer = ({ isOpen, onClose }) => {
  const { allWidgets, toggleWidget, resetConfig, isSaving } = useDashboardConfig();

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-72 bg-white dark:bg-gray-900 shadow-2xl flex flex-col border-l border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Personalizar Dashboard</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Ative ou desative widgets para personalizar o dashboard.
          </p>

          {allWidgets.map((w) => {
            const meta = WIDGET_META[w.id];
            return (
              <label
                key={w.id}
                className="flex items-center justify-between gap-3 px-3 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300 select-none">
                  {meta?.label || w.id}
                </span>

                {/* Toggle switch */}
                <button
                  type="button"
                  onClick={() => toggleWidget(w.id)}
                  disabled={isSaving}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                    w.visible
                      ? 'bg-primary'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                  aria-checked={w.visible}
                  role="switch"
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      w.visible ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => { resetConfig(); }}
            disabled={isSaving}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={14} />
            Restaurar padrão
          </button>
        </div>
      </div>
    </>
  );
};

export default DashboardCustomizer;
