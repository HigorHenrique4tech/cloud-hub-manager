import { Play, Square, Trash2, Loader2, MapPin } from 'lucide-react';
import StatusBadge from '../common/statusbadge';
import { formatDate } from '../../utils/formatters';
import PermissionGate from '../common/PermissionGate';

// ── Região colors ──────────────────────────────────────────────────────────
const REGION_COLORS = {
  'us-east-1': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'us-west-1': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'us-west-2': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'eu-west-1': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'eu-central-1': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'ap-southeast-1': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'ap-northeast-1': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'sa-east-1': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

function getRegionColor(az) {
  if (!az) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
  const region = az.slice(0, -1);
  return REGION_COLORS[region] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
}

const EC2Table = ({ instances = [], onStart, onStop, onDelete, onRowClick, loading = false, selectedIds, onToggleSelect, onToggleAll, pendingOps }) => {
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
            <tr
              key={instance.instance_id}
              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
              onClick={() => onRowClick?.(instance)}
            >
              <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
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
                {pendingOps?.has(instance.instance_id) ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {pendingOps.get(instance.instance_id) === 'starting' ? 'Iniciando...' : 'Parando...'}
                  </span>
                ) : (
                  <StatusBadge state={instance.state} />
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  {instance.public_ip || '-'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {instance.availability_zone ? (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getRegionColor(instance.availability_zone)}`}>
                    <MapPin size={10} />
                    {instance.availability_zone}
                  </span>
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">N/A</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {formatDate(instance.launch_time)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                <div className="flex space-x-2">
                  <PermissionGate permission="resources.start_stop">
                    {pendingOps?.has(instance.instance_id) ? (
                      <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                    ) : (
                      <>
                        {instance.state === 'stopped' && (
                          <button
                            onClick={() => onStart?.(instance.instance_id, instance.name)}
                            disabled={loading}
                            className="text-success hover:text-success-dark disabled:opacity-50"
                            title="Iniciar"
                          >
                            <Play className="w-5 h-5" />
                          </button>
                        )}
                        {instance.state === 'running' && (
                          <button
                            onClick={() => onStop?.(instance.instance_id, instance)}
                            disabled={loading}
                            className="text-danger hover:text-danger-dark disabled:opacity-50"
                            title="Parar"
                          >
                            <Square className="w-5 h-5" />
                          </button>
                        )}
                      </>
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
