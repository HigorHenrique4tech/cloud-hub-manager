import { Play, Square } from 'lucide-react';
import StatusBadge from '../common/statusbadge';
import { formatDate } from '../../utils/formatters';

const EC2Table = ({ instances, onStart, onStop, loading }) => {
  if (!instances || instances.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Nenhuma instância EC2 encontrada
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
              Instance ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tipo
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Estado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              IP Público
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Zona
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Iniciada em
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {instances.map((instance) => (
            <tr key={instance.instance_id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {instance.name || 'N/A'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500 font-mono">
                  {instance.instance_id}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {instance.instance_type}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge state={instance.state} />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500 font-mono">
                  {instance.public_ip || '-'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {instance.availability_zone || 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(instance.launch_time)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-2">
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