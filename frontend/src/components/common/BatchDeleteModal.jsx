import { AlertTriangle, X } from 'lucide-react';

const BatchDeleteModal = ({ isOpen, onClose, onConfirm, resources = [], isLoading, errors = [] }) => {
  if (!isOpen) return null;

  const hasErrors = errors.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={!isLoading ? onClose : undefined} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Excluir {resources.length} recurso(s)
            </h2>
          </div>
          {!isLoading && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Os seguintes recursos serão excluídos permanentemente:
          </p>

          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {resources.map(r => (
              <div key={r.id} className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 font-mono">
                {r.name}
              </div>
            ))}
          </div>

          {hasErrors && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                {errors.length} erro(s) durante a exclusão:
              </p>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-red-200 dark:border-red-800 divide-y divide-red-100 dark:divide-red-900 bg-red-50 dark:bg-red-900/20">
                {errors.map(e => (
                  <div key={e.id} className="px-3 py-2">
                    <span className="text-xs font-medium text-red-700 dark:text-red-300 font-mono">{e.name}</span>
                    <span className="text-xs text-red-500 dark:text-red-400 ml-2">{e.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          {!hasErrors && (
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Excluindo...
                </>
              ) : (
                `Excluir ${resources.length} recurso(s)`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchDeleteModal;
