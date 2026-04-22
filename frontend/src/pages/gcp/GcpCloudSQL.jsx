import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Trash2, AlertCircle, RefreshCw, Search, X } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import EmptyState from '../../components/common/emptystate';
import SkeletonTable from '../../components/common/SkeletonTable';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import gcpService from '../../services/gcpService';

const SQL_STATUS_STYLES = {
  RUNNABLE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  SUSPENDED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  PENDING_CREATE: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  MAINTENANCE: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  UNKNOWN_STATE: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const GcpCloudSQL = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();
  const [searchValue, setSearchValue] = useState(q);
  const [toDelete, setToDelete] = useState(null);

  const { data: instances = [], isLoading, error, refetch } = useQuery({
    queryKey: ['gcp-sql-instances'],
    queryFn: () => gcpService.listSqlInstances(),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (name) => gcpService.deleteSqlInstance(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gcp-sql-instances'] });
      setToDelete(null);
    },
  });

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="gcp" /></Layout>;
  }
  if (error?.response?.status === 403) {
    return (
      <Layout>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">API não habilitada</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
            {error.response?.data?.detail || 'A API necessária não está habilitada no projeto GCP.'}
          </p>
          <button onClick={() => refetch()} className="mt-2 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-primary border border-primary/30 hover:bg-primary/5 transition-colors">
            Tentar novamente
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
    !q || i.name?.toLowerCase().includes(q) || i.database_version?.toLowerCase().includes(q) || i.region?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cloud SQL</h1>
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
          <span>{error.message || 'Erro ao carregar instâncias Cloud SQL'}</span>
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
            placeholder="Buscar por nome, versão ou região..."
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
          <SkeletonTable rows={4} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Database}
            title="Nenhuma instância Cloud SQL encontrada"
            description={q ? `Nenhuma instância corresponde a "${q}".` : "Não há instâncias de banco de dados neste projeto GCP."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Nome</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Versão</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Região</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Tier</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">IP</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inst) => {
                  const publicIp = inst.ip_addresses?.find(ip => ip.type === 'PRIMARY')?.ip || '—';
                  return (
                    <tr key={inst.name} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{inst.name}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{inst.database_version || '—'}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs font-mono">{inst.region || '—'}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{inst.tier || '—'}</td>
                      <td className="py-3 px-4 text-gray-400 dark:text-gray-500 font-mono text-xs">{publicIp}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SQL_STATUS_STYLES[inst.state] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {inst.state || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <PermissionGate permission="resources.delete">
                          <button
                            onClick={() => setToDelete(inst)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                            title="Deletar instância"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </PermissionGate>
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
        onConfirm={() => deleteMutation.mutate(toDelete.name)}
        title="Deletar instância Cloud SQL"
        description={`Deseja deletar permanentemente a instância "${toDelete?.name}"? Todos os dados serão perdidos.`}
        confirmLabel="Deletar"
        isLoading={deleteMutation.isPending}
      />
    </Layout>
  );
};

export default GcpCloudSQL;
