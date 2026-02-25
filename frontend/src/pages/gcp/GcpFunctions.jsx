import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, Trash2, AlertCircle, RefreshCw, Globe } from 'lucide-react';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import EmptyState from '../../components/common/emptystate';
import SkeletonTable from '../../components/common/SkeletonTable';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import gcpService from '../../services/gcpService';

const GCF_REGIONS = [
  'us-central1', 'us-east1', 'us-east4', 'us-west1', 'us-west2', 'us-west3', 'us-west4',
  'europe-west1', 'europe-west2', 'europe-west3', 'europe-west6',
  'asia-east1', 'asia-east2', 'asia-northeast1', 'asia-south1', 'asia-southeast1',
];

const STATUS_STYLES = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  OFFLINE: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  DEPLOYING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  DELETING: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const GcpFunctions = () => {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState(null);
  const [region, setRegion] = useState('us-central1');

  const { data: functions = [], isLoading, error, refetch } = useQuery({
    queryKey: ['gcp-functions', region],
    queryFn: () => gcpService.listFunctions(region),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ region: r, name }) => gcpService.deleteFunction(r, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gcp-functions', region] });
      setToDelete(null);
    },
  });

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="gcp" /></Layout>;
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cloud Functions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {!isLoading && `${functions.length} função(ões) em ${region}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          >
            {GCF_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {error && error?.response?.status !== 400 && (
        <div className="flex items-center gap-3 p-4 mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar funções'}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : functions.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="Nenhuma função encontrada"
            description={`Não há Cloud Functions na região ${region} deste projeto.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Nome</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Runtime</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Trigger</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Memória</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {functions.map((fn) => (
                  <tr key={fn.full_name} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{fn.name}</p>
                        {fn.trigger?.url && (
                          <a
                            href={fn.trigger.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                          >
                            <Globe className="w-3 h-3" /> URL
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{fn.runtime || '—'}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{fn.trigger?.type || '—'}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">
                      {fn.available_memory_mb ? `${fn.available_memory_mb} MB` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[fn.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                        {fn.status || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <PermissionGate permission="resources.delete">
                        <button
                          onClick={() => setToDelete(fn)}
                          className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="Deletar função"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => deleteMutation.mutate({ region, name: toDelete.name })}
        title="Deletar Cloud Function"
        description={`Deseja deletar permanentemente a função "${toDelete?.name}"?`}
        confirmLabel="Deletar"
        isLoading={deleteMutation.isPending}
      />
    </Layout>
  );
};

export default GcpFunctions;
