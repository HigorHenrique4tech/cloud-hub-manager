import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Network, Plus, Trash2, AlertCircle, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import EmptyState from '../../components/common/emptystate';
import SkeletonTable from '../../components/common/SkeletonTable';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import gcpService from '../../services/gcpService';

const GcpVPC = () => {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', auto_create_subnetworks: true });
  const [formError, setFormError] = useState('');

  const { data: networks = [], isLoading, error, refetch } = useQuery({
    queryKey: ['gcp-networks'],
    queryFn: () => gcpService.listNetworks(),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () => gcpService.createNetwork(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gcp-networks'] });
      setShowForm(false);
      setForm({ name: '', auto_create_subnetworks: true });
      setFormError('');
    },
    onError: (err) => setFormError(err.response?.data?.detail || 'Erro ao criar rede VPC'),
  });

  const deleteMutation = useMutation({
    mutationFn: (name) => gcpService.deleteNetwork(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gcp-networks'] });
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">VPC Networks</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {!isLoading && `${networks.length} rede(s)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <PermissionGate permission="resources.create">
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> Nova Rede
            </button>
          </PermissionGate>
        </div>
      </div>

      {error && error?.response?.status !== 400 && (
        <div className="flex items-center gap-3 p-4 mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar redes VPC'}</span>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Nova Rede VPC</h3>
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome da rede *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="minha-vpc"
                className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="auto-subnets"
                checked={form.auto_create_subnetworks}
                onChange={(e) => setForm({ ...form, auto_create_subnetworks: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-600 text-primary"
              />
              <label htmlFor="auto-subnets" className="text-sm text-gray-700 dark:text-gray-300">
                Criar sub-redes automaticamente por região
              </label>
            </div>
          </div>
          {formError && <p className="text-sm text-red-500 mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || createMutation.isPending}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Criando...' : 'Criar Rede'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(''); }}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <SkeletonTable rows={4} cols={4} />
        ) : networks.length === 0 ? (
          <EmptyState
            icon={Network}
            title="Nenhuma rede VPC encontrada"
            description="Crie uma rede VPC para organizar seus recursos GCP."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Nome</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Modo de roteamento</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Sub-redes automáticas</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Sub-redes</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Criada em</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {networks.map((net) => (
                  <tr key={net.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{net.name}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{net.routing_mode}</td>
                    <td className="py-3 px-4">
                      {net.auto_create_subnetworks
                        ? <CheckCircle className="w-4 h-4 text-green-500" />
                        : <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                      }
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">
                      {net.subnetworks?.length ?? 0}
                    </td>
                    <td className="py-3 px-4 text-gray-400 dark:text-gray-500 text-xs">
                      {net.creation_timestamp ? new Date(net.creation_timestamp).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <PermissionGate permission="resources.delete">
                        <button
                          onClick={() => setToDelete(net)}
                          className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="Deletar rede"
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
        onConfirm={() => deleteMutation.mutate(toDelete.name)}
        title="Deletar rede VPC"
        description={`Deseja deletar permanentemente a rede "${toDelete?.name}"? Todas as sub-redes associadas também serão removidas.`}
        confirmLabel="Deletar"
        isLoading={deleteMutation.isPending}
      />
    </Layout>
  );
};

export default GcpVPC;
