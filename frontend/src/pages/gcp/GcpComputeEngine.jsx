import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MonitorPlay, Play, Square, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import EmptyState from '../../components/common/emptystate';
import SkeletonTable from '../../components/common/SkeletonTable';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import gcpService from '../../services/gcpService';

const STATUS_STYLES = {
  RUNNING: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  TERMINATED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  STOPPED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  STAGING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  PROVISIONING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  STOPPING: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  SUSPENDED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const StatusBadge = ({ status }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
    {status}
  </span>
);

const GcpComputeEngine = () => {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState({});

  const { data: instances = [], isLoading, error, refetch } = useQuery({
    queryKey: ['gcp-instances'],
    queryFn: () => gcpService.listInstances(),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ zone, name }) => gcpService.deleteInstance(zone, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gcp-instances'] });
      setToDelete(null);
    },
  });

  const handleAction = async (action, zone, name) => {
    const key = `${zone}/${name}`;
    setActionLoading(prev => ({ ...prev, [key]: action }));
    try {
      if (action === 'start') await gcpService.startInstance(zone, name);
      else if (action === 'stop') await gcpService.stopInstance(zone, name);
      qc.invalidateQueries({ queryKey: ['gcp-instances'] });
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="gcp" /></Layout>;
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Compute Engine</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {!isLoading && `${instances.length} instância(s)`}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {error && error?.response?.status !== 400 && (
        <div className="flex items-center gap-3 p-4 mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar instâncias'}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : instances.length === 0 ? (
          <EmptyState
            icon={MonitorPlay}
            title="Nenhuma instância encontrada"
            description="Não há instâncias Compute Engine neste projeto GCP."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Nome</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Zona</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">IP Externo</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => {
                  const key = `${inst.zone}/${inst.name}`;
                  const loading = actionLoading[key];
                  const externalIp = inst.network_interfaces?.[0]?.external_ip || '—';
                  return (
                    <tr key={inst.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{inst.name}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs font-mono">{inst.zone}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{inst.machine_type}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 font-mono text-xs">{externalIp}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={inst.status} />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <PermissionGate permission="resources.manage">
                            {inst.status !== 'RUNNING' && inst.status !== 'STAGING' && (
                              <button
                                onClick={() => handleAction('start', inst.zone, inst.name)}
                                disabled={!!loading}
                                className="p-1.5 rounded text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
                                title="Iniciar"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                            {inst.status === 'RUNNING' && (
                              <button
                                onClick={() => handleAction('stop', inst.zone, inst.name)}
                                disabled={!!loading}
                                className="p-1.5 rounded text-gray-400 hover:text-orange-500 transition-colors disabled:opacity-50"
                                title="Parar"
                              >
                                <Square className="w-4 h-4" />
                              </button>
                            )}
                          </PermissionGate>
                          <PermissionGate permission="resources.delete">
                            <button
                              onClick={() => setToDelete(inst)}
                              className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                              title="Deletar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => deleteMutation.mutate({ zone: toDelete.zone, name: toDelete.name })}
        title="Deletar instância"
        description={`Deseja deletar permanentemente a instância "${toDelete?.name}" na zona ${toDelete?.zone}?`}
        confirmLabel="Deletar"
        isLoading={deleteMutation.isPending}
      />
    </Layout>
  );
};

export default GcpComputeEngine;
