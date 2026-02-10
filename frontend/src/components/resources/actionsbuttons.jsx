import { Play, Square, Trash2, Settings } from 'lucide-react';

const ActionButtons = ({ resource, onStart, onStop, onDelete, onConfigure, loading = false }) => {
  const isRunning = resource.state === 'running' || resource.power_state === 'running';

  return (
    <div className="flex space-x-2">
      {!isRunning && (
        <button
          onClick={() => onStart?.(resource.instance_id || resource.vm_id)}
          disabled={loading}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-success hover:bg-success-dark disabled:opacity-50 transition-colors"
          title="Iniciar"
        >
          <Play className="w-4 h-4 mr-1" />
          Iniciar
        </button>
      )}

      {isRunning && (
        <button
          onClick={() => onStop?.(resource.instance_id || resource.vm_id)}
          disabled={loading}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-danger hover:bg-danger-dark disabled:opacity-50 transition-colors"
          title="Parar"
        >
          <Square className="w-4 h-4 mr-1" />
          Parar
        </button>
      )}

      <button
        onClick={() => onConfigure?.(resource.instance_id || resource.vm_id)}
        disabled={loading}
        className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
        title="Configurar"
      >
        <Settings className="w-4 h-4 mr-1" />
        Configurar
      </button>

      <button
        onClick={() => onDelete?.(resource.instance_id || resource.vm_id)}
        disabled={loading}
        className="inline-flex items-center px-3 py-2 border border-red-300 text-sm leading-4 font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
        title="Deletar"
      >
        <Trash2 className="w-4 h-4 mr-1" />
        Deletar
      </button>
    </div>
  );
};

export default ActionButtons;
