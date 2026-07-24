import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MonitorPlay, Play, Square, Trash2, AlertCircle, RefreshCw, Loader2, Search, X } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import EmptyState from '../../components/common/emptystate';
import SkeletonTable from '../../components/common/SkeletonTable';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';
import VMBackupSection from '../../components/backup/VMBackupSection';
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
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();
  const [searchValue, setSearchValue] = useState(q);
  const [toDelete, setToDelete] = useState(null);
  const [toStop, setToStop] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [detailTarget, setDetailTarget] = useState(null);

  const hasPending = Object.keys(actionLoading).length > 0;

  const { data: instances = [], isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['gcp-instances'],
    queryFn: () => gcpService.listInstances(),
    retry: false,
    refetchInterval: hasPending ? 5000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ zone, name }) => gcpService.deleteInstance(zone, name),
    onSuccess: () => {
      toast.success(`Instância "${toDelete?.name}" deletada.`);
      qc.invalidateQueries({ queryKey: ['gcp-instances'] });
      setToDelete(null);
    },
    onError: (err) => {
      toast.error(`Erro ao deletar: ${err.response?.data?.detail || err.message}`);
    },
  });

  const handleStart = async (zone, name) => {
    const key = `${zone}/${name}`;
    setActionLoading(prev => ({ ...prev, [key]: 'starting' }));
    try {
      await gcpService.startInstance(zone, name);
      toast.success(`Instância "${name}" iniciada.`);
      qc.invalidateQueries({ queryKey: ['gcp-instances'] });
    } catch (err) {
      toast.error(`Erro ao iniciar "${name}": ${err.response?.data?.detail || err.message}`);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  const confirmStop = async () => {
    if (!toStop) return;
    const { zone, name } = toStop;
    const key = `${zone}/${name}`;
    setToStop(null);
    setActionLoading(prev => ({ ...prev, [key]: 'stopping' }));
    try {
      await gcpService.stopInstance(zone, name);
      toast.success(`Instância "${name}" parada.`);
      qc.invalidateQueries({ queryKey: ['gcp-instances'] });
    } catch (err) {
      toast.error(`Erro ao parar "${name}": ${err.response?.data?.detail || err.message}`);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="gcp" /></Layout>;
  }
  if (error?.response?.status === 403) {
    const detail = error.response?.data?.detail || '';
    return (
      <Layout>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">API não habilitada</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
            {detail || 'A API necessária não está habilitada no projeto GCP. Ative-a no Google Cloud Console e aguarde alguns minutos.'}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-2 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-primary border border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </button>
        </div>
      </Layout>
    );
  }
  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.response?.data?.detail || error.message || 'Erro ao carregar dados'}</span>
        </div>
      </Layout>
    );
  }

  const filtered = isLoading ? [] : instances.filter(i =>
    !q || i.name?.toLowerCase().includes(q) || i.zone?.toLowerCase().includes(q) || i.machine_type?.toLowerCase().includes(q)
  );

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
          disabled={isRefetching || isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {error && error?.response?.status !== 400 && (
        <div className="flex items-center gap-3 p-4 mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar instâncias'}</span>
        </div>
      )}

      {!isLoading && instances.length > 0 && (
        <div className="mb-6 relative w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                navigate(searchValue ? `?q=${encodeURIComponent(searchValue)}` : '');
              }
              if (e.key === 'Escape') {
                setSearchValue('');
                navigate('');
              }
            }}
            placeholder="Buscar por nome, zona ou tipo..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {searchValue && (
            <button
              onClick={() => {
                setSearchValue('');
                navigate('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <SkeletonTable rows={5} columns={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MonitorPlay}
            title="Nenhuma instância encontrada"
            description={q ? `Nenhuma instância corresponde a "${q}".` : "Não há instâncias Compute Engine neste projeto GCP."}
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
                {filtered.map((inst) => {
                  const key = `${inst.zone}/${inst.name}`;
                  const loading = actionLoading[key];
                  const externalIp = inst.network_interfaces?.[0]?.external_ip || '—';
                  return (
                    <tr key={inst.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" tabIndex={0} role="button" onClick={() => setDetailTarget(inst)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailTarget(inst); } }}>
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{inst.name}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs font-mono">{inst.zone}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{inst.machine_type}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 font-mono text-xs">{externalIp}</td>
                      <td className="py-3 px-4">
                        {loading ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {loading === 'starting' ? 'Iniciando...' : 'Parando...'}
                          </span>
                        ) : (
                          <StatusBadge status={inst.status} />
                        )}
                      </td>
                      <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <PermissionGate permission="resources.manage">
                            {loading ? (
                              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                            ) : (
                              <>
                                {inst.status !== 'RUNNING' && inst.status !== 'STAGING' && (
                                  <button
                                    onClick={() => handleStart(inst.zone, inst.name)}
                                    className="p-1.5 rounded text-gray-400 hover:text-green-600 transition-colors"
                                    title="Iniciar"
                                  >
                                    <Play className="w-4 h-4" />
                                  </button>
                                )}
                                {inst.status === 'RUNNING' && (
                                  <button
                                    onClick={() => setToStop(inst)}
                                    className="p-1.5 rounded text-gray-400 hover:text-orange-500 transition-colors"
                                    title="Parar"
                                  >
                                    <Square className="w-4 h-4" />
                                  </button>
                                )}
                              </>
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
        isOpen={!!toStop}
        onClose={() => setToStop(null)}
        onConfirm={confirmStop}
        title="Parar instância"
        description={`Tem certeza que deseja parar "${toStop?.name}"?`}
        confirmLabel="Parar"
        variant="warning"
      />

      <ConfirmDeleteModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => deleteMutation.mutate({ zone: toDelete.zone, name: toDelete.name })}
        title="Deletar instância"
        description={`Deseja deletar permanentemente a instância "${toDelete?.name}" na zona ${toDelete?.zone}?`}
        confirmLabel="Deletar"
        isLoading={deleteMutation.isPending}
      />

      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name}
        subtitle="GCP Compute Engine"
        statusText={detailTarget?.status}
        statusColor={detailTarget?.status === 'RUNNING' ? 'green' : detailTarget?.status === 'TERMINATED' || detailTarget?.status === 'STOPPED' ? 'red' : 'yellow'}
        queryKey={['gcp-instance-detail', detailTarget?.zone, detailTarget?.name]}
        queryFn={detailTarget ? () => Promise.resolve(detailTarget) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'Nome', value: detailTarget?.name },
            { label: 'Zona', value: detailTarget?.zone },
            { label: 'Tipo de Máquina', value: detailTarget?.machine_type },
            { label: 'Status', value: detailTarget?.status },
          ]},
          { title: 'Rede', fields: [
            { label: 'IP Externo', value: detailTarget?.network_interfaces?.[0]?.external_ip || '—' },
            { label: 'IP Interno', value: detailTarget?.network_interfaces?.[0]?.internal_ip || '—' },
          ]},
        ]}
        extraContent={detailTarget && (
          <VMBackupSection
            provider="gcp"
            vmName={detailTarget.name}
            zone={detailTarget.zone}
          />
        )}
      />
    </Layout>
  );
};

export default GcpComputeEngine;
