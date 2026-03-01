import { RefreshCw, AlertCircle, Activity } from 'lucide-react';
import SkeletonTable from '../common/SkeletonTable';

const TYPE_LABELS = {
  ec2: 'EC2',
  vm: 'VM',
  compute: 'GCE',
};

function fmtBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function CpuBar({ value }) {
  if (value == null) return <span className="text-gray-400 dark:text-gray-500">—</span>;

  const color =
    value > 80
      ? 'bg-red-500'
      : value > 50
      ? 'bg-yellow-400'
      : 'bg-green-500';

  const textColor =
    value > 80
      ? 'text-red-600 dark:text-red-400'
      : value > 50
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-green-600 dark:text-green-400';

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums w-10 text-right ${textColor}`}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

const ResourceMetricsPanel = ({ resources, isLoading, isError, onRefresh }) => {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Monitoramento de Instâncias
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Métricas da última hora · até 15 instâncias em execução
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="btn-secondary flex items-center gap-1.5 text-sm"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <SkeletonTable columns={4} rows={5} />
        ) : isError ? (
          <div className="flex items-center gap-3 p-4 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">Erro ao carregar métricas. Verifique as permissões da conta.</span>
          </div>
        ) : !resources || resources.length === 0 ? (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
            Nenhuma instância em execução encontrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Recurso
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    CPU (1h média)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Rede (1h)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {resources.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px]">
                        {r.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]">
                        {r.region}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                        {TYPE_LABELS[r.type] || r.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <CpuBar value={r.cpu_pct} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {r.net_in_bytes != null || r.net_out_bytes != null ? (
                        <span className="tabular-nums">
                          <span className="text-blue-600 dark:text-blue-400">↑{fmtBytes(r.net_out_bytes)}</span>
                          {' '}
                          <span className="text-green-600 dark:text-green-400">↓{fmtBytes(r.net_in_bytes)}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ℹ Memória requer agente instalado na instância (CloudWatch Agent / Ops Agent)
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResourceMetricsPanel;
