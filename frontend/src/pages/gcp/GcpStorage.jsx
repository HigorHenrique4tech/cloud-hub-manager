import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Plus, Trash2, AlertCircle, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import EmptyState from '../../components/common/emptystate';
import SkeletonTable from '../../components/common/SkeletonTable';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import gcpService from '../../services/gcpService';

const GCS_LOCATIONS = ['US', 'EU', 'ASIA', 'US-CENTRAL1', 'US-EAST1', 'US-WEST1', 'EU-WEST1', 'ASIA-EAST1', 'ASIA-SOUTHEAST1'];
const GCS_CLASSES = ['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE'];

const GcpStorage = () => {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', location: 'US', storage_class: 'STANDARD' });
  const [formError, setFormError] = useState('');

  const { data: buckets = [], isLoading, error, refetch } = useQuery({
    queryKey: ['gcp-buckets'],
    queryFn: () => gcpService.listBuckets(),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () => gcpService.createBucket(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gcp-buckets'] });
      setShowForm(false);
      setForm({ name: '', location: 'US', storage_class: 'STANDARD' });
      setFormError('');
    },
    onError: (err) => setFormError(err.response?.data?.detail || 'Erro ao criar bucket'),
  });

  const deleteMutation = useMutation({
    mutationFn: (name) => gcpService.deleteBucket(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gcp-buckets'] });
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cloud Storage</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {!isLoading && `${buckets.length} bucket(s)`}
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
              <Plus className="w-4 h-4" /> Novo Bucket
            </button>
          </PermissionGate>
        </div>
      </div>

      {error && error?.response?.status !== 400 && (
        <div className="flex items-center gap-3 p-4 mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar buckets'}</span>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Novo Bucket</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome do bucket *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="meu-bucket-gcp"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Localização</label>
              <select
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                {GCS_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Classe de armazenamento</label>
              <select
                value={form.storage_class}
                onChange={(e) => setForm({ ...form, storage_class: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                {GCS_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {formError && <p className="text-sm text-red-500 mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || createMutation.isPending}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Criando...' : 'Criar Bucket'}
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
          <SkeletonTable rows={5} cols={5} />
        ) : buckets.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title="Nenhum bucket encontrado"
            description="Crie um bucket para começar a usar o Cloud Storage."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Nome</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Localização</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Classe</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Versionamento</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Criado em</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.name} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{b.name}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs font-mono">{b.location}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{b.storage_class}</td>
                    <td className="py-3 px-4">
                      {b.versioning_enabled
                        ? <CheckCircle className="w-4 h-4 text-green-500" />
                        : <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                      }
                    </td>
                    <td className="py-3 px-4 text-gray-400 dark:text-gray-500 text-xs">
                      {b.created ? new Date(b.created).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <PermissionGate permission="resources.delete">
                        <button
                          onClick={() => setToDelete(b)}
                          className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="Deletar bucket"
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
        title="Deletar bucket"
        description={`Deseja deletar permanentemente o bucket "${toDelete?.name}"? Todo o conteúdo será perdido.`}
        confirmLabel="Deletar"
        isLoading={deleteMutation.isPending}
      />
    </Layout>
  );
};

export default GcpStorage;
