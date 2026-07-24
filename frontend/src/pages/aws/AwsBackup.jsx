import { useState, useMemo } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, HardDriveDownload, RefreshCw, Camera, Image, Loader2 } from 'lucide-react';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import SkeletonTable from '../../components/common/SkeletonTable';
import EmptyState from '../../components/common/emptystate';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import awsService from '../../services/awsservices';

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  available: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  deregistered: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status?.toLowerCase()] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{status || '—'}</span>;
}

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleString('pt-BR'); } catch { return str; }
}

const SEL = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50';
const INP = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400';

// ── Snapshot Create Modal ──────────────────────────────────────────────────────

function CreateSnapshotModal({ isOpen, onClose, onSubmit, loading, error, instances, instancesLoading }) {
  useEscapeKey(isOpen, onClose);
  const [selectedInstance, setSelectedInstance] = useState('');
  const [selectedVolume, setSelectedVolume] = useState('');
  const [description, setDescription] = useState('');

  // Build flat list of volumes from all instances — must be before early return
  const volumeOptions = useMemo(() => {
    if (!instances?.length) return [];
    const opts = [];
    instances.forEach(inst => {
      const label = inst.name || inst.instance_id;
      (inst.volumes || []).forEach(v => {
        if (v.volume_id) opts.push({ volume_id: v.volume_id, instance_label: label, instance_id: inst.instance_id });
      });
    });
    return opts;
  }, [instances]);

  if (!isOpen) return null;

  // When an instance is selected, filter its volumes
  const filteredVolumes = selectedInstance
    ? volumeOptions.filter(v => v.instance_id === selectedInstance)
    : volumeOptions;

  const handleInstanceChange = (e) => {
    setSelectedInstance(e.target.value);
    setSelectedVolume('');
  };

  const submit = (e) => {
    e.preventDefault();
    const vol = selectedVolume || '';
    if (vol.trim()) onSubmit({ volume_id: vol, description });
  };

  const reset = () => {
    setSelectedInstance('');
    setSelectedVolume('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Criar EBS Snapshot</h2>
        <form onSubmit={submit} className="space-y-4">

          {/* Instance filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Instância EC2 (filtrar por)
            </label>
            {instancesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando instâncias...
              </div>
            ) : (
              <select value={selectedInstance} onChange={handleInstanceChange} className={SEL}>
                <option value="">— Todas as instâncias —</option>
                {instances?.map(inst => (
                  <option key={inst.instance_id} value={inst.instance_id}>
                    {inst.name || inst.instance_id} ({inst.instance_id})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Volume selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Volume EBS *
            </label>
            {instancesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando volumes...
              </div>
            ) : filteredVolumes.length > 0 ? (
              <select
                value={selectedVolume}
                onChange={e => setSelectedVolume(e.target.value)}
                className={SEL}
                required
              >
                <option value="">— Selecione um volume —</option>
                {filteredVolumes.map(v => (
                  <option key={v.volume_id} value={v.volume_id}>
                    {v.volume_id} — {v.instance_label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={selectedVolume}
                onChange={e => setSelectedVolume(e.target.value)}
                placeholder="vol-0123456789abcdef0"
                className={INP}
                required
              />
            )}
            {filteredVolumes.length === 0 && !instancesLoading && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Nenhum volume encontrado. Digite o ID manualmente.
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descrição</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Backup manual..."
              className={INP}
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={reset} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-60">
              {loading ? 'Criando...' : 'Criar Snapshot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── AMI Create Modal ───────────────────────────────────────────────────────────

function CreateAMIModal({ isOpen, onClose, onSubmit, loading, error, instances, instancesLoading }) {
  useEscapeKey(isOpen, onClose);
  const [selectedInstance, setSelectedInstance] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const submit = (e) => {
    e.preventDefault();
    if (selectedInstance && name.trim()) onSubmit({ instance_id: selectedInstance, name, description });
  };

  const reset = () => {
    setSelectedInstance('');
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Criar AMI (Backup da Instância)</h2>
        <form onSubmit={submit} className="space-y-4">

          {/* Instance selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Instância EC2 *
            </label>
            {instancesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando instâncias...
              </div>
            ) : instances?.length > 0 ? (
              <select
                value={selectedInstance}
                onChange={e => setSelectedInstance(e.target.value)}
                className={SEL}
                required
              >
                <option value="">— Selecione uma instância —</option>
                {instances.map(inst => (
                  <option key={inst.instance_id} value={inst.instance_id}>
                    {inst.name || inst.instance_id} — {inst.state} ({inst.instance_type || ''})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={selectedInstance}
                onChange={e => setSelectedInstance(e.target.value)}
                placeholder="i-0123456789abcdef0"
                className={INP}
                required
              />
            )}
          </div>

          {/* AMI Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="meu-servidor-backup-2024"
              className={INP}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descrição</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Backup manual..."
              className={INP}
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={reset} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-60">
              {loading ? 'Criando...' : 'Criar AMI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AwsBackup() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('snapshots');
  const [createSnapOpen, setCreateSnapOpen] = useState(false);
  const [createAMIOpen, setCreateAMIOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutError, setMutError] = useState('');

  const snapQ = useQuery({
    queryKey: ['aws-snapshots'],
    queryFn: () => awsService.listSnapshots(),
    retry: false,
  });

  const amiQ = useQuery({
    queryKey: ['aws-owned-amis'],
    queryFn: () => awsService.listOwnedAMIs(),
    retry: false,
  });

  // Load instances for modals (enabled only when a modal is open)
  const instancesQ = useQuery({
    queryKey: ['aws-ec2-instances-backup'],
    queryFn: () => awsService.listEC2Instances(),
    retry: false,
    enabled: createSnapOpen || createAMIOpen,
    staleTime: 60_000,
  });

  const instances = instancesQ.data?.instances || [];

  const snapMut = useMutation({
    mutationFn: awsService.createSnapshot,
    onSuccess: () => { qc.invalidateQueries(['aws-snapshots']); setCreateSnapOpen(false); setMutError(''); },
    onError: (e) => setMutError(e?.response?.data?.detail || 'Erro ao criar snapshot'),
  });

  const amiMut = useMutation({
    mutationFn: awsService.createOwnedAMI,
    onSuccess: () => { qc.invalidateQueries(['aws-owned-amis']); setCreateAMIOpen(false); setMutError(''); },
    onError: (e) => setMutError(e?.response?.data?.detail || 'Erro ao criar AMI'),
  });

  const deleteMut = useMutation({
    mutationFn: (target) =>
      target.type === 'snapshot'
        ? awsService.deleteSnapshot(target.id)
        : Promise.reject(new Error('AMI deletion not supported')),
    onSuccess: () => {
      qc.invalidateQueries(['aws-snapshots']);
      setDeleteTarget(null);
    },
    onError: (e) => setMutError(e?.response?.data?.detail || e.message || 'Erro ao excluir'),
  });

  const noCredentials =
    snapQ.error?.response?.status === 400 || amiQ.error?.response?.status === 400;

  if (noCredentials) return <Layout><NoCredentialsMessage provider="aws" /></Layout>;

  const snapshots = snapQ.data?.snapshots || [];
  const amis = amiQ.data?.amis || [];

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">AWS — Backup &amp; Snapshots</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gerencie EBS Snapshots e AMIs (machine images) da sua conta AWS.
          </p>
        </div>
        <PermissionGate permission="resources.create">
          {tab === 'snapshots' ? (
            <button
              onClick={() => { setMutError(''); setCreateSnapOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar Snapshot
            </button>
          ) : (
            <button
              onClick={() => { setMutError(''); setCreateAMIOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar AMI
            </button>
          )}
        </PermissionGate>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'snapshots', label: 'EBS Snapshots', icon: Camera },
          { key: 'amis', label: 'AMIs', icon: Image },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-orange-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
        <button
          onClick={() => { snapQ.refetch(); amiQ.refetch(); }}
          disabled={snapQ.isFetching || amiQ.isFetching}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${(snapQ.isFetching || amiQ.isFetching) ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Snapshots Tab */}
      {tab === 'snapshots' && (
        <div className="card overflow-x-auto">
          {snapQ.isLoading ? (
            <SkeletonTable columns={6} rows={5} />
          ) : snapshots.length === 0 ? (
            <EmptyState
              icon={HardDriveDownload}
              title="Nenhum EBS Snapshot encontrado"
              description="Crie um snapshot para fazer backup de um volume EBS."
            />
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3">Snapshot ID</th>
                  <th className="px-4 py-3">Volume</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Tamanho</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Criado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {snapshots.map(s => (
                  <tr key={s.snapshot_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">{s.snapshot_id}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">{s.volume_id || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">{s.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{s.size_gb != null ? `${s.size_gb} GB` : '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.state} /></td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(s.start_time)}</td>
                    <td className="px-4 py-3 text-right">
                      <PermissionGate permission="resources.delete">
                        <button
                          onClick={() => setDeleteTarget({ id: s.snapshot_id, name: s.snapshot_id, type: 'snapshot' })}
                          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          title="Excluir snapshot"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* AMIs Tab */}
      {tab === 'amis' && (
        <div className="card overflow-x-auto">
          {amiQ.isLoading ? (
            <SkeletonTable columns={5} rows={5} />
          ) : amis.length === 0 ? (
            <EmptyState
              icon={HardDriveDownload}
              title="Nenhuma AMI encontrada"
              description="Crie uma AMI para fazer backup completo de uma instância EC2."
            />
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3">Image ID</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Arquitetura</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {amis.map(a => (
                  <tr key={a.image_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">{a.image_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">{a.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{a.architecture || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.state} /></td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(a.creation_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <CreateSnapshotModal
        isOpen={createSnapOpen}
        onClose={() => setCreateSnapOpen(false)}
        onSubmit={snapMut.mutate}
        loading={snapMut.isPending}
        error={mutError}
        instances={instances}
        instancesLoading={instancesQ.isLoading}
      />

      <CreateAMIModal
        isOpen={createAMIOpen}
        onClose={() => setCreateAMIOpen(false)}
        onSubmit={amiMut.mutate}
        loading={amiMut.isPending}
        error={mutError}
        instances={instances}
        instancesLoading={instancesQ.isLoading}
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
