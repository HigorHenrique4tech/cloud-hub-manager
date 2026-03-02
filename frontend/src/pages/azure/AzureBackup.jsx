import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, HardDriveDownload, RefreshCw, HardDrive,
  Archive, Shield, Play, Clock, CheckCircle,
  XCircle, AlertCircle, Database,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import SkeletonTable from '../../components/common/SkeletonTable';
import EmptyState from '../../components/common/emptystate';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import azureService from '../../services/azureservices';

// ── Shared helpers ─────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-400';
const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleString('pt-BR'); } catch { return str; }
}
function formatDateShort(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleDateString('pt-BR'); } catch { return str; }
}
function formatSize(gb) {
  if (gb == null) return '—';
  return `${gb} GB`;
}

// ── Snapshot tab ───────────────────────────────────────────────────────────────

const SNAP_STATUS_COLORS = {
  succeeded: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  creating:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  updating:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  failed:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function SnapStatusBadge({ status }) {
  const cls = SNAP_STATUS_COLORS[status?.toLowerCase()] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{status || '—'}</span>;
}

function CreateSnapshotModal({ isOpen, onClose, onSubmit, loading, error }) {
  const [form, setForm] = useState({ resource_group: '', source_resource_id: '', snapshot_name: '', location: '' });

  const disksQ = useQuery({
    queryKey: ['azure-disks-picker'],
    queryFn: () => azureService.listDisks(),
    enabled: isOpen,
    staleTime: 120_000,
    retry: false,
  });
  const rgsQ = useQuery({
    queryKey: ['azure-rgs-picker'],
    queryFn: () => azureService.listResourceGroups(),
    enabled: isOpen,
    staleTime: 120_000,
    retry: false,
  });

  const disks = disksQ.data?.disks || [];
  const resourceGroups = useMemo(() => {
    const fromRGs = (rgsQ.data?.resource_groups || rgsQ.data || []).map(rg =>
      typeof rg === 'string' ? rg : rg.name
    );
    const fromDisks = disks.map(d => d.resource_group).filter(Boolean);
    const seen = new Map();
    [...fromRGs, ...fromDisks].forEach(rg => {
      const key = rg.toLowerCase();
      if (!seen.has(key)) seen.set(key, rg);
    });
    return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [rgsQ.data, disks]);

  const filteredDisks = form.resource_group
    ? disks.filter(d => d.resource_group?.toLowerCase() === form.resource_group.toLowerCase())
    : disks;

  const handleRGChange = (rg) => setForm(f => ({ ...f, resource_group: rg, source_resource_id: '', location: '' }));

  const handleDiskChange = (diskId) => {
    const disk = disks.find(d => d.id === diskId);
    const diskRg = disk?.resource_group;
    const canonicalRg = diskRg
      ? resourceGroups.find(rg => rg.toLowerCase() === diskRg.toLowerCase()) || diskRg
      : null;
    setForm(f => ({ ...f, source_resource_id: diskId, location: disk?.location || f.location, resource_group: canonicalRg || f.resource_group }));
  };

  if (!isOpen) return null;
  const canSubmit = form.resource_group.trim() && form.source_resource_id.trim() && form.snapshot_name.trim() && form.location.trim();
  const loadingPickers = disksQ.isLoading || rgsQ.isLoading;
  const disksError = disksQ.isError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-sky-500" /> Criar Snapshot de Disco
        </h2>
        <form onSubmit={e => { e.preventDefault(); if (canSubmit) onSubmit(form); }} className="space-y-4">
          <div>
            <label className={labelCls}>Resource Group *</label>
            {loadingPickers ? <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" /> : (
              <select value={form.resource_group} onChange={e => handleRGChange(e.target.value)} className={inputCls} required>
                <option value="">Selecione um Resource Group...</option>
                {resourceGroups.map(rg => <option key={rg} value={rg}>{rg}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className={labelCls}>Disco de Origem *</label>
            {loadingPickers ? <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" /> :
             disksError ? (
              <input value={form.source_resource_id} onChange={e => setForm(f => ({ ...f, source_resource_id: e.target.value }))} placeholder="/subscriptions/.../disks/nome-do-disco" className={inputCls} required />
             ) : (
              <select value={form.source_resource_id} onChange={e => handleDiskChange(e.target.value)} className={inputCls} required disabled={!form.resource_group && filteredDisks.length === 0}>
                <option value="">{form.resource_group ? (filteredDisks.length === 0 ? 'Nenhum disco neste Resource Group' : 'Selecione um disco...') : 'Selecione um disco...'}</option>
                {filteredDisks.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.disk_size_gb ? ` (${d.disk_size_gb} GB` : ''}{d.os_type ? ` · ${d.os_type}` : ''}{d.disk_size_gb ? ')' : ''}
                  </option>
                ))}
              </select>
             )}
            {disksError && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Não foi possível carregar a lista de discos. Informe o ID manualmente.</p>}
            {!disksError && form.source_resource_id && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 truncate font-mono">{form.source_resource_id}</p>}
          </div>
          <div>
            <label className={labelCls}>Localização *</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Preenchido automaticamente ao selecionar o disco" className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Nome do Snapshot *</label>
            <input value={form.snapshot_name} onChange={e => setForm(f => ({ ...f, snapshot_name: e.target.value }))} placeholder="meu-disco-snapshot-01" className={inputCls} required />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
            <button type="submit" disabled={loading || !canSubmit} className="px-4 py-2 text-sm rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-60">
              {loading ? 'Criando...' : 'Criar Snapshot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SnapshotsTab() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutError, setMutError] = useState('');

  const snapQ = useQuery({ queryKey: ['azure-snapshots'], queryFn: () => azureService.listSnapshots(), retry: false });
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

  const snapshots = snapQ.data?.snapshots || [];

  return (
    <>
      <div className="mb-4 flex justify-end gap-2">
        <button onClick={() => snapQ.refetch()} disabled={snapQ.isFetching} className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${snapQ.isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </button>
        <PermissionGate permission="resources.create">
          <button onClick={() => { setMutError(''); setCreateOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600">
            <Plus className="w-4 h-4" /> Criar Snapshot
          </button>
        </PermissionGate>
      </div>

      <div className="card overflow-x-auto">
        {snapQ.isLoading ? <SkeletonTable columns={7} rows={5} /> :
         snapshots.length === 0 ? (
          <EmptyState icon={HardDriveDownload} title="Nenhum snapshot encontrado" description="Crie um snapshot de disco para fazer backup de uma VM Azure." />
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
                const diskShort = s.source_resource_id ? s.source_resource_id.split('/').pop() : '—';
                return (
                  <tr key={s.snapshot_id || s.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{s.resource_group || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{s.location || '—'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-400 max-w-[160px] truncate" title={s.source_resource_id}>{diskShort}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatSize(s.disk_size_gb)}</td>
                    <td className="px-4 py-3"><SnapStatusBadge status={s.provisioning_state} /></td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(s.time_created)}</td>
                    <td className="px-4 py-3 text-right">
                      <PermissionGate permission="resources.delete">
                        <button onClick={() => setDeleteTarget({ rg: s.resource_group, name: s.name })} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400" title="Excluir snapshot">
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

      <CreateSnapshotModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onSubmit={createMut.mutate} loading={createMut.isPending} error={mutError} />
      <ConfirmDeleteModal
        isOpen={!!deleteTarget} onClose={() => { setDeleteTarget(null); setMutError(''); }}
        onConfirm={() => deleteMut.mutate(deleteTarget)}
        title="Excluir Snapshot" description="O snapshot será excluído permanentemente. Esta ação não pode ser desfeita."
        confirmText={deleteTarget?.name} isLoading={deleteMut.isPending} error={mutError}
      />
    </>
  );
}

// ── Azure Backup (Recovery Services Archive) tab ────────────────────────────────

const JOB_STATUS = {
  completed:        { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  irpcompleted:     { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  inprogress:       { cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: Clock },
  failed:           { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: XCircle },
  partiallyfailed:  { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: XCircle },
};

function JobStatusBadge({ status }) {
  const key = status?.toLowerCase().replace(/\s/g, '') || '';
  const { cls, icon: Icon } = JOB_STATUS[key] || { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', icon: AlertCircle };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      <Icon className="w-3 h-3" /> {status || '—'}
    </span>
  );
}

function ProtectionBadge({ state }) {
  const s = state?.toLowerCase() || '';
  if (s.includes('protected') || s === 'irpcompleted') return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium">Protegida</span>;
  if (s.includes('progress') || s.includes('configuring')) return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 font-medium animate-pulse">Configurando</span>;
  if (s.includes('notprotected') || s.includes('none')) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 font-medium">Não protegida</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 font-medium">{state || '—'}</span>;
}

// ─ Create Archive Modal
function CreateArchiveModal({ isOpen, onClose, onSubmit, loading, error }) {
  const [form, setForm] = useState({ vault_name: '', resource_group: '', location: '' });

  const rgsQ = useQuery({ queryKey: ['azure-rgs-picker'], queryFn: () => azureService.listResourceGroups(), enabled: isOpen, staleTime: 120_000, retry: false });
  const locsQ = useQuery({ queryKey: ['azure-locations-picker'], queryFn: () => azureService.listLocations(), enabled: isOpen, staleTime: 300_000, retry: false });

  const rgs = useMemo(() => {
    const raw = rgsQ.data?.resource_groups || rgsQ.data || [];
    return raw.map(rg => typeof rg === 'string' ? rg : rg.name).sort();
  }, [rgsQ.data]);

  const locs = useMemo(() => {
    const raw = locsQ.data?.locations || locsQ.data || [];
    return raw.map(l => typeof l === 'string' ? l : (l.name || l.display_name)).filter(Boolean).sort();
  }, [locsQ.data]);

  if (!isOpen) return null;
  const canSubmit = form.vault_name.trim() && form.resource_group.trim() && form.location.trim();
  const busy = rgsQ.isLoading || locsQ.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Archive className="w-5 h-5 text-sky-500" /> Criar Cofre de Recuperação
        </h2>
        <form onSubmit={e => { e.preventDefault(); if (canSubmit) onSubmit(form); }} className="space-y-4">
          <div>
            <label className={labelCls}>Nome do Cofre *</label>
            <input value={form.vault_name} onChange={e => setForm(f => ({ ...f, vault_name: e.target.value }))} placeholder="meu-cofre-backup" className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Resource Group *</label>
            {busy ? <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" /> : (
              <select value={form.resource_group} onChange={e => setForm(f => ({ ...f, resource_group: e.target.value }))} className={inputCls} required>
                <option value="">Selecione...</option>
                {rgs.map(rg => <option key={rg} value={rg}>{rg}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className={labelCls}>Localização *</label>
            {busy ? <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" /> : (
              <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className={inputCls} required>
                <option value="">Selecione...</option>
                {locs.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
            <button type="submit" disabled={loading || !canSubmit} className="px-4 py-2 text-sm rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-60">
              {loading ? 'Criando...' : 'Criar Cofre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─ Enable VM Backup Modal
function EnableBackupModal({ isOpen, onClose, onSubmit, loading, error, vaultRg, vaultName }) {
  const [form, setForm] = useState({ vm_id: '', vm_rg: '', vm_name: '', policy_name: '' });

  const vmsQ = useQuery({ queryKey: ['azure-vms'], queryFn: () => azureService.listVMs(), enabled: isOpen, staleTime: 120_000, retry: false });
  const policiesQ = useQuery({
    queryKey: ['azure-backup-policies', vaultRg, vaultName],
    queryFn: () => azureService.listBackupPolicies(vaultRg, vaultName),
    enabled: isOpen && !!vaultRg && !!vaultName,
    staleTime: 60_000,
    retry: false,
  });

  const vms = vmsQ.data?.vms || vmsQ.data || [];
  const policies = policiesQ.data?.policies || [];

  const handleVMChange = (vmId) => {
    const vm = vms.find(v => v.id === vmId || v.vm_id === vmId);
    setForm(f => ({
      ...f,
      vm_id: vmId,
      vm_rg: vm?.resource_group || '',
      vm_name: vm?.name || '',
    }));
  };

  if (!isOpen) return null;
  const canSubmit = form.vm_id.trim() && form.vm_rg.trim() && form.vm_name.trim() && form.policy_name.trim();
  const busy = vmsQ.isLoading || policiesQ.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-sky-500" /> Habilitar Backup de VM
        </h2>
        <form onSubmit={e => { e.preventDefault(); if (canSubmit) onSubmit(form); }} className="space-y-4">
          <div>
            <label className={labelCls}>Máquina Virtual *</label>
            {busy ? <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" /> : (
              <select value={form.vm_id} onChange={e => handleVMChange(e.target.value)} className={inputCls} required>
                <option value="">Selecione uma VM...</option>
                {vms.map(vm => (
                  <option key={vm.id || vm.vm_id} value={vm.id || vm.vm_id}>
                    {vm.name} {vm.resource_group ? `(${vm.resource_group})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className={labelCls}>Política de Backup *</label>
            {busy ? <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" /> : (
              <select value={form.policy_name} onChange={e => setForm(f => ({ ...f, policy_name: e.target.value }))} className={inputCls} required>
                <option value="">Selecione uma política...</option>
                {policies.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name}{p.schedule_frequency ? ` — ${p.schedule_frequency}` : ''}{p.retention_daily_count ? `, ${p.retention_daily_count}d` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
            <button type="submit" disabled={loading || !canSubmit} className="px-4 py-2 text-sm rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-60">
              {loading ? 'Habilitando...' : 'Habilitar Backup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─ Create Policy Modal
function CreatePolicyModal({ isOpen, onClose, onSubmit, loading, error }) {
  const [form, setForm] = useState({
    policy_name: '',
    schedule_run_frequency: 'Daily',
    schedule_time: '02:00',
    instant_rp_retention_range_in_days: 2,
    daily_retention_duration: 30,
  });

  if (!isOpen) return null;
  const canSubmit = form.policy_name.trim() && form.schedule_time;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const [h, m] = form.schedule_time.split(':');
    const runTime = `2024-01-01T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00Z`;
    onSubmit({
      policy_name: form.policy_name,
      schedule_run_frequency: form.schedule_run_frequency,
      schedule_run_times: [runTime],
      instant_rp_retention_range_in_days: Number(form.instant_rp_retention_range_in_days),
      daily_retention_duration: Number(form.daily_retention_duration),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-sky-500" /> Criar Política de Backup
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Nome da Política *</label>
            <input value={form.policy_name} onChange={e => setForm(f => ({ ...f, policy_name: e.target.value }))} placeholder="minha-politica-diaria" className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Frequência *</label>
            <select value={form.schedule_run_frequency} onChange={e => setForm(f => ({ ...f, schedule_run_frequency: e.target.value }))} className={inputCls}>
              <option value="Daily">Diário</option>
              <option value="Weekly">Semanal</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Horário do Backup *</label>
            <input type="time" value={form.schedule_time} onChange={e => setForm(f => ({ ...f, schedule_time: e.target.value }))} className={inputCls} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Retenção de snapshot instantâneo (dias)</label>
              <input type="number" min={1} max={5} value={form.instant_rp_retention_range_in_days} onChange={e => setForm(f => ({ ...f, instant_rp_retention_range_in_days: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Retenção diária (dias)</label>
              <input type="number" min={7} max={9999} value={form.daily_retention_duration} onChange={e => setForm(f => ({ ...f, daily_retention_duration: e.target.value }))} className={inputCls} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
            <button type="submit" disabled={loading || !canSubmit} className="px-4 py-2 text-sm rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-60">
              {loading ? 'Criando...' : 'Criar Política'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─ Main BackupArchiveTab
function BackupArchiveTab() {
  const qc = useQueryClient();
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [subTab, setSubTab] = useState('items');
  const [createArchiveOpen, setCreateArchiveOpen] = useState(false);
  const [enableModalOpen, setEnableModalOpen] = useState(false);
  const [createPolicyOpen, setCreatePolicyOpen] = useState(false);
  const [mutError, setMutError] = useState('');
  const [backupNowTarget, setBackupNowTarget] = useState(null);

  const vaultRg = selectedArchive?.resource_group;
  const vaultName = selectedArchive?.name;

  const vaultsQ = useQuery({ queryKey: ['azure-backup-vaults'], queryFn: () => azureService.listArchives(), retry: false });
  const itemsQ = useQuery({
    queryKey: ['azure-backup-items', vaultRg, vaultName],
    queryFn: () => azureService.listProtectedItems(vaultRg, vaultName),
    enabled: !!selectedArchive && subTab === 'items',
    staleTime: 30_000, retry: false,
  });
  const jobsQ = useQuery({
    queryKey: ['azure-backup-jobs', vaultRg, vaultName],
    queryFn: () => azureService.listBackupJobs(vaultRg, vaultName),
    enabled: !!selectedArchive && subTab === 'jobs',
    staleTime: 30_000, retry: false,
  });
  const policiesQ = useQuery({
    queryKey: ['azure-backup-policies', vaultRg, vaultName],
    queryFn: () => azureService.listBackupPolicies(vaultRg, vaultName),
    enabled: !!selectedArchive && subTab === 'policies',
    staleTime: 60_000, retry: false,
  });

  const createArchiveMut = useMutation({
    mutationFn: azureService.createArchive,
    onSuccess: () => { qc.invalidateQueries(['azure-backup-vaults']); setCreateArchiveOpen(false); setMutError(''); },
    onError: (e) => setMutError(e?.response?.data?.detail || 'Erro ao criar cofre'),
  });
  const enableMut = useMutation({
    mutationFn: (data) => azureService.enableVMBackup(vaultRg, vaultName, data),
    onSuccess: () => { qc.invalidateQueries(['azure-backup-items', vaultRg, vaultName]); setEnableModalOpen(false); setMutError(''); },
    onError: (e) => setMutError(e?.response?.data?.detail || 'Erro ao habilitar backup'),
  });
  const policyMut = useMutation({
    mutationFn: (data) => azureService.createBackupPolicy(vaultRg, vaultName, data),
    onSuccess: () => { qc.invalidateQueries(['azure-backup-policies', vaultRg, vaultName]); setCreatePolicyOpen(false); setMutError(''); },
    onError: (e) => setMutError(e?.response?.data?.detail || 'Erro ao criar política'),
  });
  const backupNowMut = useMutation({
    mutationFn: (data) => azureService.triggerBackupNow(vaultRg, vaultName, data),
    onSuccess: () => { qc.invalidateQueries(['azure-backup-jobs', vaultRg, vaultName]); setBackupNowTarget(null); setSubTab('jobs'); setMutError(''); },
    onError: (e) => setMutError(e?.response?.data?.detail || 'Erro ao iniciar backup'),
  });

  const vaults = vaultsQ.data?.vaults || [];
  const items = itemsQ.data?.items || [];
  const jobs = jobsQ.data?.jobs || [];
  const policies = policiesQ.data?.policies || [];

  const SUB_TABS = [
    { key: 'items', label: 'VMs Protegidas' },
    { key: 'jobs', label: 'Jobs' },
    { key: 'policies', label: 'Políticas' },
  ];

  return (
    <>
      {/* Archive selector */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Archive className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-400 flex-shrink-0">Cofre:</span>
          {vaultsQ.isLoading ? (
            <div className="h-9 w-64 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ) : vaults.length === 0 ? (
            <span className="text-sm text-gray-400 dark:text-gray-500 italic">Nenhum cofre encontrado</span>
          ) : (
            <select
              value={selectedArchive?.name || ''}
              onChange={e => {
                const v = vaults.find(v => v.name === e.target.value) || null;
                setSelectedArchive(v);
                setSubTab('items');
              }}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-400 min-w-[220px]"
            >
              <option value="">Selecione um cofre...</option>
              {vaults.map(v => <option key={v.name} value={v.name}>{v.name} ({v.resource_group})</option>)}
            </select>
          )}
          <button onClick={() => vaultsQ.refetch()} disabled={vaultsQ.isFetching} className="p-2 text-gray-400 hover:text-sky-500" title="Atualizar lista de cofres">
            <RefreshCw className={`w-4 h-4 ${vaultsQ.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <PermissionGate permission="resources.create">
          <button onClick={() => { setMutError(''); setCreateArchiveOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 flex-shrink-0">
            <Plus className="w-4 h-4" /> Criar Cofre
          </button>
        </PermissionGate>
      </div>

      {!selectedArchive ? (
        <div className="card">
          <EmptyState icon={Archive} title="Selecione um cofre" description="Escolha um cofre de recuperação para gerenciar backups de VMs." />
        </div>
      ) : (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
            {SUB_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setSubTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${subTab === t.key
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 pb-1">
              {subTab === 'items' && (
                <PermissionGate permission="resources.create">
                  <button onClick={() => { setMutError(''); setEnableModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-xs font-medium rounded-lg hover:bg-sky-600">
                    <Shield className="w-3.5 h-3.5" /> Habilitar Backup
                  </button>
                </PermissionGate>
              )}
              {subTab === 'policies' && (
                <PermissionGate permission="resources.create">
                  <button onClick={() => { setMutError(''); setCreatePolicyOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-xs font-medium rounded-lg hover:bg-sky-600">
                    <Plus className="w-3.5 h-3.5" /> Criar Política
                  </button>
                </PermissionGate>
              )}
              <button
                onClick={() => {
                  if (subTab === 'items') qc.invalidateQueries(['azure-backup-items', vaultRg, vaultName]);
                  if (subTab === 'jobs') qc.invalidateQueries(['azure-backup-jobs', vaultRg, vaultName]);
                  if (subTab === 'policies') qc.invalidateQueries(['azure-backup-policies', vaultRg, vaultName]);
                }}
                className="p-1.5 text-gray-400 hover:text-sky-500" title="Atualizar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* VMs Protegidas */}
          {subTab === 'items' && (
            <div className="card overflow-x-auto">
              {itemsQ.isLoading ? <SkeletonTable columns={6} rows={4} /> :
               items.length === 0 ? (
                <EmptyState icon={Shield} title="Nenhuma VM protegida" description="Habilite o backup de uma VM para protegê-la com este cofre." />
               ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-3">VM</th>
                      <th className="px-4 py-3">Resource Group</th>
                      <th className="px-4 py-3">Política</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Último Backup</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {items.map(item => (
                      <tr key={item.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{item.vm_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.resource_group || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.policy_name || '—'}</td>
                        <td className="px-4 py-3"><ProtectionBadge state={item.protection_state} /></td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDateShort(item.last_backup_time)}</td>
                        <td className="px-4 py-3 text-right">
                          <PermissionGate permission="resources.create">
                            <button
                              onClick={() => setBackupNowTarget(item)}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded"
                              title="Backup agora"
                            >
                              <Play className="w-3 h-3" /> Backup Agora
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

          {/* Jobs */}
          {subTab === 'jobs' && (
            <div className="card overflow-x-auto">
              {jobsQ.isLoading ? <SkeletonTable columns={5} rows={5} /> :
               jobs.length === 0 ? (
                <EmptyState icon={Clock} title="Nenhum job encontrado" description="Os jobs de backup aparecerão aqui após o primeiro backup." />
               ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-3">VM</th>
                      <th className="px-4 py-3">Operação</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Início</th>
                      <th className="px-4 py-3">Duração</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {jobs.map(job => (
                      <tr key={job.job_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{job.vm_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{job.operation || '—'}</td>
                        <td className="px-4 py-3"><JobStatusBadge status={job.status} /></td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(job.start_time)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{job.duration || (job.end_time ? '—' : <span className="text-yellow-500">Em andamento</span>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
               )}
            </div>
          )}

          {/* Políticas */}
          {subTab === 'policies' && (
            <div className="card overflow-x-auto">
              {policiesQ.isLoading ? <SkeletonTable columns={4} rows={4} /> :
               policies.length === 0 ? (
                <EmptyState icon={Database} title="Nenhuma política encontrada" description="Crie uma política de backup para definir agendamento e retenção." />
               ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Frequência</th>
                      <th className="px-4 py-3">Horário</th>
                      <th className="px-4 py-3">Retenção Diária</th>
                      <th className="px-4 py-3">Snapshot Instantâneo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {policies.map(p => (
                      <tr key={p.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{p.schedule_frequency || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{p.schedule_time ? new Date(p.schedule_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{p.retention_daily_count != null ? `${p.retention_daily_count} dias` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{p.instant_rp_days != null ? `${p.instant_rp_days} dias` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
               )}
            </div>
          )}
        </>
      )}

      {/* Confirm Backup Now */}
      <ConfirmDeleteModal
        isOpen={!!backupNowTarget}
        onClose={() => { setBackupNowTarget(null); setMutError(''); }}
        onConfirm={() => backupNowMut.mutate({ vm_rg: backupNowTarget.resource_group, vm_name: backupNowTarget.vm_name })}
        title="Backup Agora"
        description={`Iniciar um backup imediato para a VM "${backupNowTarget?.vm_name}"? O ponto de recuperação será retido por 30 dias.`}
        confirmLabel="Iniciar Backup"
        isLoading={backupNowMut.isPending}
        error={mutError}
      />

      <CreateArchiveModal isOpen={createArchiveOpen} onClose={() => setCreateArchiveOpen(false)} onSubmit={createArchiveMut.mutate} loading={createArchiveMut.isPending} error={mutError} />
      <EnableBackupModal isOpen={enableModalOpen} onClose={() => setEnableModalOpen(false)} onSubmit={enableMut.mutate} loading={enableMut.isPending} error={mutError} vaultRg={vaultRg} vaultName={vaultName} />
      <CreatePolicyModal isOpen={createPolicyOpen} onClose={() => setCreatePolicyOpen(false)} onSubmit={policyMut.mutate} loading={policyMut.isPending} error={mutError} />
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const MAIN_TABS = [
  { key: 'snapshots', label: 'Snapshots de Disco', icon: HardDrive },
  { key: 'backup',    label: 'Backup de VMs',      icon: Shield },
];

export default function AzureBackup() {
  const [activeTab, setActiveTab] = useState('snapshots');

  // Check credentials from the snapshots query (fast, no-credential returns 400)
  const credQ = useQuery({
    queryKey: ['azure-snapshots-cred-check'],
    queryFn: () => azureService.listSnapshots(),
    retry: false,
    staleTime: 300_000,
  });

  if (credQ.error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="azure" /></Layout>;
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">Azure — Backup &amp; Snapshots</h1>
        <p className="text-gray-600 dark:text-gray-400">Gerencie snapshots de disco e backups completos de VMs na sua assinatura Azure.</p>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {MAIN_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'snapshots' && <SnapshotsTab />}
      {activeTab === 'backup'    && <BackupArchiveTab />}
    </Layout>
  );
}
