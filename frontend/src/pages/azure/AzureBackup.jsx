import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, HardDriveDownload, RefreshCw } from 'lucide-react';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import SkeletonTable from '../../components/common/SkeletonTable';
import EmptyState from '../../components/common/emptystate';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import azureService from '../../services/azureservices';

const STATUS_COLORS = {
  succeeded: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  creating: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  updating: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status?.toLowerCase()] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{status || '—'}</span>;
}

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleString('pt-BR'); } catch { return str; }
}

function formatSize(gb) {
  if (gb == null) return '—';
  return `${gb} GB`;
}

// ── Create Snapshot Modal ──────────────────────────────────────────────────────

function CreateSnapshotModal({ isOpen, onClose, onSubmit, loading, error }) {
  const [form, setForm] = useState({ resource_group: '', source_resource_id: '', snapshot_name: '', location: '' });

  if (!isOpen) return null;
  const submit = (e) => {
    e.preventDefault();
    if (form.resource_group.trim() && form.source_resource_id.trim() && form.snapshot_name.trim() && form.location.trim()) {
      onSubmit(form);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Criar Snapshot de Disco</h2>
        <form onSubmit={submit} className="space-y-4">
          {[
            { field: 'resource_group', label: 'Resource Group *', placeholder: 'meu-resource-group' },
            { field: 'snapshot_name', label: 'Nome do Snapshot *', placeholder: 'meu-disco-snapshot-01' },
            { field: 'location', label: 'Localização *', placeholder: 'eastus' },
            { field: 'source_resource_id', label: 'ID do Disco de Origem *', placeholder: '/subscriptions/.../disks/meu-disco' },
          ].map(({ field, label, placeholder }) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
              <input
                value={form[field]}
                onChange={e => setForm({ ...form, [field]: e.target.value })}
                placeholder={placeholder}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
                required
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-60">
              {loading ? 'Criando...' : 'Criar Snapshot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AzureBackup() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutError, setMutError] = useState('');

  const snapQ = useQuery({
    queryKey: ['azure-snapshots'],
    queryFn: () => azureService.listSnapshots(),
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: azureService.createSnapshot,
    onSuccess: () => { qc.invalidateQueries(['azure-snapshots']); setCreateOpen(false); setMutError(''); },
    onError: (e) => setMutError(e?.response?.data?.detail || 'Erro ao criar snapshot'),
  });

  const deleteMut = useMutation({
    mutationFn: (t) => azureService.deleteSnapshot(t.rg, t.name),
    onSuccess: () => { qc.invalidateQueries(['azure-snapshots']); setDeleteTarget(null); setMutError(''); },
    onError: (e) => setMutError(e?.response?.data?.detail || 'Erro ao excluir snapshot'),
  });

  if (snapQ.error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="azure" /></Layout>;
  }

  const snapshots = snapQ.data?.snapshots || [];

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Azure — Backup &amp; Snapshots</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gerencie snapshots de discos gerenciados na sua assinatura Azure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => snapQ.refetch()}
            disabled={snapQ.isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${snapQ.isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <PermissionGate permission="resources.create">
            <button
              onClick={() => { setMutError(''); setCreateOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar Snapshot
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {snapQ.isLoading ? (
          <SkeletonTable columns={7} rows={5} />
        ) : snapshots.length === 0 ? (
          <EmptyState
            icon={HardDriveDownload}
            title="Nenhum snapshot encontrado"
            description="Crie um snapshot de disco para fazer backup de uma VM Azure."
          />
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Resource Group</th>
                <th className="px-4 py-3">Localização</th>
                <th className="px-4 py-3">Disco Origem</th>
                <th className="px-4 py-3">Tamanho</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {snapshots.map(s => {
                const diskShort = s.source_resource_id
                  ? s.source_resource_id.split('/').pop()
                  : '—';
                return (
                  <tr key={s.snapshot_id || s.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{s.resource_group || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{s.location || '—'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-400 max-w-[160px] truncate" title={s.source_resource_id}>{diskShort}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatSize(s.disk_size_gb)}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.provisioning_state} /></td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(s.time_created)}</td>
                    <td className="px-4 py-3 text-right">
                      <PermissionGate permission="resources.delete">
                        <button
                          onClick={() => setDeleteTarget({ rg: s.resource_group, name: s.name })}
                          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          title="Excluir snapshot"
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
        )}
      </div>

      <CreateSnapshotModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={createMut.mutate}
        loading={createMut.isPending}
        error={mutError}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setMutError(''); }}
        onConfirm={() => deleteMut.mutate(deleteTarget)}
        title="Excluir Snapshot"
        description="O snapshot será excluído permanentemente. Esta ação não pode ser desfeita."
        confirmText={deleteTarget?.name}
        isLoading={deleteMut.isPending}
        error={mutError}
      />
    </Layout>
  );
}
