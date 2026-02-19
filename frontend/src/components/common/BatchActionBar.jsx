import { Play, Square, Trash2, X } from 'lucide-react';
import PermissionGate from './PermissionGate';

const BatchActionBar = ({
  count,
  onClear,
  onStart,
  onStop,
  onDelete,
  canStart,
  canStop,
  isLoading,
  progress,
}) => {
  if (count === 0) return null;

  const showProgress = isLoading && progress?.total > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-700 px-6 py-3 flex items-center justify-between gap-4 shadow-2xl">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-white font-medium">
          {count} recurso(s) selecionado(s)
        </span>
        {showProgress && (
          <span className="text-gray-400">
            Processando {progress.done}/{progress.total}...
          </span>
        )}
        <button
          onClick={onClear}
          disabled={isLoading}
          className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          Limpar
        </button>
      </div>

      <div className="flex items-center gap-2">
        <PermissionGate permission="resources.start_stop">
          {canStart && (
            <button
              onClick={onStart}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              Iniciar
            </button>
          )}
          {canStop && (
            <button
              onClick={onStop}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              Parar
            </button>
          )}
        </PermissionGate>
        <PermissionGate permission="resources.delete">
          <button
            onClick={onDelete}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir {count}
          </button>
        </PermissionGate>
      </div>
    </div>
  );
};

export default BatchActionBar;
