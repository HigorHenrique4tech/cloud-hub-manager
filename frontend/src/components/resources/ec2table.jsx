import { Play, Square, Trash2 } from 'lucide-react';
import StatusBadge from '../common/statusbadge';
import { formatDate } from '../../utils/formatters';
import PermissionGate from '../common/PermissionGate';

const EC2Table = ({ instances = [], onStart, onStop, onDelete, loading = false, selectedIds, onToggleSelect, onToggleAll }) => {
  if (!instances || instances.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Nenhuma instância EC2 encontrada
      </div>
    );
  }

  const allIds = instances.map(i => i.instance_id);
  const hasAll = allIds.length > 0 && allIds.every(id => selectedIds?.has(id));
  const hasSome = allIds.some(id => selectedIds?.has(id));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-900/50">
          <tr>
            <th className="w-10 px-3 py-3">
              <input
                type="checkbox"
                ref={el => el && (el.indeterminate = hasSome && !hasAll)}
                checked={hasAll}
                onChange={() => onToggleAll?.(allIds)}
                className="w-4 h-4 accent-primary"
              />
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Nome
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Instance ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Tipo
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Estado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              IP Público
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Zona
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Iniciada em
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {instances.map((instance) => (
            <tr key={instance.instance_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td className="px-3 py-4">
                <input
                  type="checkbox"
                  checked={selectedIds?.has(instance.instance_id) ?? false}
                  onChange={() => onToggleSelect?.(instance.instance_id)}
                  className="w-4 h-4 accent-primary"
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {instance.name || 'N/A'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  {instance.instance_id}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  {instance.instance_type}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge state={instance.state} />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  {instance.public_ip || '-'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {instance.availability_zone || 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {formatDate(instance.launch_time)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-2">
                  <PermissionGate permission="resources.start_stop">
                    {instance.state === 'stopped' && (
                      <button
                        onClick={() => onStart?.(instance.instance_id)}
                        disabled={loading}
                        className="text-success hover:text-success-dark disabled:opacity-50"
                        title="Iniciar"
                      >
                        <Play className="w-5 h-5" />
                      </button>
                    )}
                    {instance.state === 'running' && (
                      <button
                        onClick={() => onStop?.(instance.instance_id)}
                        disabled={loading}
                        className="text-danger hover:text-danger-dark disabled:opacity-50"
                        title="Parar"
                      >
                        <Square className="w-5 h-5" />
                      </button>
                    )}
                  </PermissionGate>
                  <PermissionGate permission="resources.delete">
                    <button
                      onClick={() => onDelete?.(instance)}
                      disabled={loading}
                      className="text-red-400 hover:text-red-600 disabled:opacity-50"
                      title="Excluir"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </PermissionGate>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default EC2Table;
