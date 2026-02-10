import { Play, Square } from 'lucide-react';
import StatusBadge from '../common/statusbadge';

const AzureVMTable = ({ vms = [], onStart, onStop, loading = false }) => {
  if (!vms || vms.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Nenhuma VM Azure encontrada
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nome
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Resource Group
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tamanho
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Estado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Localização
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              SO
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {vms.map((vm) => (
            <tr key={vm.vm_id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {vm.name}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500">
                  {vm.resource_group}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {vm.vm_size || 'N/A'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge state={vm.power_state} />
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {vm.location}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {vm.os_type || 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-2">
                  {(vm.power_state === 'deallocated' || vm.power_state === 'stopped') && (
                    <button
                      onClick={() => onStart?.(vm.resource_group, vm.name)}
                      disabled={loading}
                      className="text-success hover:text-success-dark disabled:opacity-50"
                      title="Iniciar"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                  )}
                  {vm.power_state === 'running' && (
                    <button
                      onClick={() => onStop?.(vm.resource_group, vm.name)}
                      disabled={loading}
                      className="text-danger hover:text-danger-dark disabled:opacity-50"
                      title="Parar"
                    >
                      <Square className="w-5 h-5" />
                    </button>
                  )}
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
