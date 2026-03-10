import { Play, Square, Trash2, Loader2 } from 'lucide-react';
import StatusBadge from '../common/statusbadge';
import PermissionGate from '../common/PermissionGate';

const AzureVMTable = ({ vms = [], onStart, onStop, onDelete, onRowClick, loading = false, selectedIds, onToggleSelect, onToggleAll, pendingOps }) => {
  if (!vms || vms.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Nenhuma VM Azure encontrada
      </div>
    );
  }

  const allIds = vms.map(v => v.vm_id);
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
              Resource Group
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Tamanho
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Estado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Localização
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              SO
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {vms.map((vm) => (
            <tr
              key={vm.vm_id}
              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
              onClick={() => onRowClick?.(vm)}
            >
              <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds?.has(vm.vm_id) ?? false}
                  onChange={() => onToggleSelect?.(vm.vm_id)}
                  className="w-4 h-4 accent-primary"
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {vm.name}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {vm.resource_group}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  {vm.vm_size || 'N/A'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {pendingOps?.has(vm.vm_id) ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {pendingOps.get(vm.vm_id) === 'starting' ? 'Iniciando...' : 'Parando...'}
                  </span>
                ) : (
                  <StatusBadge state={vm.power_state} />
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {vm.location}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {vm.os_type || 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                <div className="flex space-x-2">
                  <PermissionGate permission="resources.start_stop">
                    {pendingOps?.has(vm.vm_id) ? (
                      <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                    ) : (
                      <>
                        {(vm.power_state === 'deallocated' || vm.power_state === 'stopped') && (
                          <button
                            onClick={() => onStart?.(vm.resource_group, vm.name, vm.vm_id)}
                            disabled={loading}
                            className="text-success hover:text-success-dark disabled:opacity-50"
                            title="Iniciar"
                          >
                            <Play className="w-5 h-5" />
                          </button>
                        )}
                        {vm.power_state === 'running' && (
                          <button
                            onClick={() => onStop?.(vm.resource_group, vm.name, vm)}
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
                      onClick={() => onDelete?.(vm)}
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

export default AzureVMTable;
