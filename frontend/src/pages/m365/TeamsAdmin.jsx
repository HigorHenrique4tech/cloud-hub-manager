import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MonitorPlay, Users, Hash, BarChart2, X, Plus, Archive,
  Edit2, Trash2, RefreshCw, UserMinus,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import m365Service from '../../services/m365Service';
import { useToast } from '../../contexts/ToastContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';

// ─ Helpers ──────────────────────────────────────────────────────────────────
// Backend get_teams() returns camelCase: displayName, isArchived, membersCount, visibility
// Backend get_team_members() returns camelCase: displayName, email, roles
// Backend get_channels() returns snake_case: display_name, membership_type
// Backend get_teams_activity() returns snake_case: display_name, channel_messages, private_messages, last_activity

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
const thCls = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider';
const tdCls = 'px-4 py-3 text-sm text-gray-700 dark:text-gray-300';
const btnPrimary = 'flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors';

const TABS = [
  { id: 'teams',    label: 'Times',     icon: MonitorPlay },
  { id: 'channels', label: 'Canais',    icon: Hash },
  { id: 'members',  label: 'Membros',   icon: Users },
  { id: 'activity', label: 'Atividade', icon: BarChart2 },
];

// ─ Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRow({ cols = 4 }) {
  return (
    <tr>{Array.from({ length: cols }).map((_, i) => (
      <td key={i} className={tdCls}><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
    ))}</tr>
  );
}

// ─ Visibility Badge ──────────────────────────────────────────────────────────
function VisibilityBadge({ visibility }) {
  const isPublic = visibility === 'Public';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isPublic ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
    }`}>
      {isPublic ? 'Público' : 'Privado'}
    </span>
  );
}

// ─ Create/Edit Team Modal ────────────────────────────────────────────────────
function TeamModal({ team, onClose }) {
  useEscapeKey(true, onClose);
  const qc = useQueryClient();
  const isEdit = !!team;
  const [form, setForm] = useState({
    display_name: team?.displayName || '',
    description: team?.description || '',
    visibility: team?.visibility || 'Private',
    owner_id: '',
  });

  const usersQ = useQuery({ queryKey: ['m365-users'], queryFn: m365Service.getUsers, staleTime: 300_000, retry: false, enabled: !isEdit });
  const users = usersQ.data?.users || [];

  const mut = useMutation({
    mutationFn: () => isEdit
      ? m365Service.updateTeam(team.id, form)
      : m365Service.createTeam(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-teams'] });
      onClose();
    },
  });

  const canSubmit = form.display_name.trim() && (isEdit || form.owner_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{isEdit ? 'Editar Time' : 'Criar Time'}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Nome *</label>
            <input className={inputCls} value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Nome do time" />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <textarea rows={3} className={inputCls} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" />
          </div>
          <div>
            <label className={labelCls}>Visibilidade</label>
            <select className={inputCls} value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}>
              <option value="Private">Privado</option>
              <option value="Public">Público</option>
            </select>
          </div>
          {!isEdit && (
            <div>
              <label className={labelCls}>Owner do Time *</label>
              <select className={inputCls} value={form.owner_id} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}>
                <option value="">Selecione o owner...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.displayName} ({u.userPrincipalName})</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Obrigatório: a API do Graph exige um owner ao criar um time.</p>
            </div>
          )}
        </div>
        <div className="px-5 pb-5">
          {mut.isError && <p className="text-xs text-red-500 mb-2">{typeof mut.error?.response?.data?.detail === 'string' ? mut.error.response.data.detail : 'Erro ao salvar.'}</p>}
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit} className={`${btnPrimary} w-full justify-center`}>
            {mut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : isEdit ? 'Salvar' : 'Criar Time'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─ Teams Tab ─────────────────────────────────────────────────────────────────
function TeamsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null); // null | 'create' | team object for edit
  const [archiveTarget, setArchiveTarget] = useState(null);

  const teamsQ = useQuery({ queryKey: ['m365-teams'], queryFn: m365Service.getTeams, staleTime: 120_000, retry: false });

  const archiveMut = useMutation({
    mutationFn: (teamId) => m365Service.archiveTeam(teamId),
    onSuccess: () => {
      toast.success(`Time "${archiveTarget?.displayName}" arquivado.`);
      setArchiveTarget(null);
      qc.invalidateQueries({ queryKey: ['m365-teams'] });
    },
    onError: (err) => {
      toast.error(`Erro ao arquivar: ${err.response?.data?.detail || err.message}`);
      setArchiveTarget(null);
    },
  });

  // get_teams() returns: {teams: [{id, displayName, visibility, description, isArchived, membersCount}]}
  const teams = teamsQ.data?.teams || [];

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={() => setModal('create')} className={btnPrimary}>
            <Plus className="w-4 h-4" /> Criar Time
          </button>
        </div>

        <div className="card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={thCls}>Nome</th>
                <th className={thCls}>Visibilidade</th>
                <th className={thCls}>Membros</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {teamsQ.isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                : teams.length === 0
                ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum time encontrado.</td></tr>
                : teams.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className={tdCls}>
                      <div>
                        {/* camelCase: displayName */}
                        <p className="font-medium text-gray-900 dark:text-gray-100">{t.displayName || '—'}</p>
                        {t.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{t.description}</p>}
                      </div>
                    </td>
                    <td className={tdCls}><VisibilityBadge visibility={t.visibility} /></td>
                    <td className={tdCls}>{t.membersCount ?? '—'}</td>
                    <td className={tdCls}>
                      {/* camelCase: isArchived */}
                      {t.isArchived
                        ? <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Arquivado</span>
                        : <span className="text-xs text-green-600 dark:text-green-400 font-medium">Ativo</span>
                      }
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setModal(t)} title="Editar" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!t.isArchived && (
                          <button
                            onClick={() => setArchiveTarget(t)}
                            title="Arquivar"
                            className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <TeamModal team={modal === 'create' ? null : modal} onClose={() => setModal(null)} />
      )}

      <ConfirmDeleteModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveMut.mutate(archiveTarget.id)}
        title="Arquivar Time"
        description={`Deseja arquivar o time "${archiveTarget?.displayName}"? Ele ficará somente leitura.`}
        confirmLabel="Arquivar"
        variant="warning"
        isLoading={archiveMut.isPending}
      />
    </>
  );
}

// ─ Create Channel Modal ──────────────────────────────────────────────────────
function ChannelModal({ teamId, onClose }) {
  useEscapeKey(true, onClose);
  const qc = useQueryClient();
  const [form, setForm] = useState({ display_name: '', description: '', channel_type: 'standard' });

  const mut = useMutation({
    mutationFn: () => m365Service.createChannel(teamId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-channels', teamId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Criar Canal</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Nome *</label>
            <input className={inputCls} value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Nome do canal" />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <input className={inputCls} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" />
          </div>
          <div>
            <label className={labelCls}>Tipo</label>
            <select className={inputCls} value={form.channel_type} onChange={e => setForm(f => ({ ...f, channel_type: e.target.value }))}>
              <option value="standard">Standard</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
        <div className="px-5 pb-5">
          {mut.isError && <p className="text-xs text-red-500 mb-2">{mut.error?.response?.data?.detail || 'Erro ao criar canal.'}</p>}
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !form.display_name.trim()} className={`${btnPrimary} w-full justify-center`}>
            {mut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Criar Canal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─ Channels Tab ──────────────────────────────────────────────────────────────
function ChannelsTab({ teams }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteChannelTarget, setDeleteChannelTarget] = useState(null);

  const channelsQ = useQuery({
    queryKey: ['m365-channels', selectedTeamId],
    queryFn: () => m365Service.getChannels(selectedTeamId),
    enabled: !!selectedTeamId,
    staleTime: 60_000,
    retry: false,
  });

  const deleteMut = useMutation({
    mutationFn: (channelId) => m365Service.deleteChannel(selectedTeamId, channelId),
    onSuccess: () => {
      toast.success(`Canal "${deleteChannelTarget?.display_name}" excluído.`);
      setDeleteChannelTarget(null);
      qc.invalidateQueries({ queryKey: ['m365-channels', selectedTeamId] });
    },
    onError: (err) => {
      toast.error(`Erro ao excluir canal: ${err.response?.data?.detail || err.message}`);
      setDeleteChannelTarget(null);
    },
  });

  // get_channels() returns snake_case: display_name, membership_type
  const channels = channelsQ.data?.channels || [];

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className={labelCls}>Time</label>
            <select className={inputCls} value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)}>
              <option value="">Selecione um time...</option>
              {/* teams use camelCase: displayName */}
              {teams.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            </select>
          </div>
          {selectedTeamId && (
            <button onClick={() => setShowCreateModal(true)} className={btnPrimary}>
              <Plus className="w-4 h-4" /> Criar Canal
            </button>
          )}
        </div>

        {selectedTeamId && (
          <div className="card rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className={thCls}>Nome</th>
                  <th className={thCls}>Tipo</th>
                  <th className={thCls}>Descrição</th>
                  <th className={thCls}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {channelsQ.isLoading
                  ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
                  : channels.length === 0
                  ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum canal encontrado.</td></tr>
                  : channels.map(ch => (
                    <tr key={ch.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className={tdCls}>
                        <div className="flex items-center gap-2">
                          <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          {/* snake_case: display_name */}
                          <span className="font-medium text-gray-900 dark:text-gray-100">{ch.display_name}</span>
                        </div>
                      </td>
                      <td className={tdCls}>
                        {/* snake_case: membership_type (not channel_type) */}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          ch.membership_type === 'private'
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {ch.membership_type === 'private' ? 'Privado' : 'Standard'}
                        </span>
                      </td>
                      <td className={`${tdCls} max-w-xs`}>
                        <span className="truncate block text-xs text-gray-500 dark:text-gray-400">{ch.description || '—'}</span>
                      </td>
                      <td className={tdCls}>
                        {ch.display_name !== 'General' && (
                          <button
                            onClick={() => setDeleteChannelTarget(ch)}
                            title="Deletar canal"
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}

        {!selectedTeamId && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Hash className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Selecione um time para ver os canais</p>
          </div>
        )}
      </div>

      {showCreateModal && <ChannelModal teamId={selectedTeamId} onClose={() => setShowCreateModal(false)} />}

      <ConfirmDeleteModal
        isOpen={!!deleteChannelTarget}
        onClose={() => setDeleteChannelTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteChannelTarget.id)}
        title="Excluir Canal"
        description={`Excluir "${deleteChannelTarget?.display_name}" permanentemente?`}
        confirmLabel="Excluir"
        isLoading={deleteMut.isPending}
      />
    </>
  );
}

// ─ Add Member Modal ──────────────────────────────────────────────────────────
function AddMemberModal({ teamId, onClose }) {
  useEscapeKey(true, onClose);
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('member');

  const usersQ = useQuery({ queryKey: ['m365-users'], queryFn: m365Service.getUsers, staleTime: 300_000, retry: false });
  // get_users() endpoint returns {users: [...]}
  const users = usersQ.data?.users || [];

  const mut = useMutation({
    mutationFn: () => m365Service.addTeamMember(teamId, userId, role === 'owner' ? ['owner'] : []),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-team-members', teamId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Adicionar Membro</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Usuário *</label>
            <select className={inputCls} value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Selecione um usuário...</option>
              {/* get_users() returns camelCase: displayName, userPrincipalName */}
              {users.map(u => <option key={u.id} value={u.id}>{u.displayName} ({u.userPrincipalName})</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Função</label>
            <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
              <option value="member">Membro</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </div>
        <div className="px-5 pb-5">
          {mut.isError && <p className="text-xs text-red-500 mb-2">{mut.error?.response?.data?.detail || 'Erro ao adicionar membro.'}</p>}
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !userId} className={`${btnPrimary} w-full justify-center`}>
            {mut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─ Members Tab ───────────────────────────────────────────────────────────────
function MembersTab({ teams }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState(null);

  const membersQ = useQuery({
    queryKey: ['m365-team-members', selectedTeamId],
    queryFn: () => m365Service.getTeamMembers(selectedTeamId),
    enabled: !!selectedTeamId,
    staleTime: 60_000,
    retry: false,
  });

  const roleMut = useMutation({
    mutationFn: ({ memberId, roles }) => m365Service.updateMemberRole(selectedTeamId, memberId, roles),
    onSuccess: () => {
      toast.success('Função do membro atualizada.');
      qc.invalidateQueries({ queryKey: ['m365-team-members', selectedTeamId] });
    },
    onError: (err) => toast.error(`Erro: ${err.response?.data?.detail || err.message}`),
  });

  const removeMut = useMutation({
    mutationFn: (memberId) => m365Service.removeTeamMember(selectedTeamId, memberId),
    onSuccess: () => {
      toast.success(`"${removeMemberTarget?.displayName}" removido do time.`);
      setRemoveMemberTarget(null);
      qc.invalidateQueries({ queryKey: ['m365-team-members', selectedTeamId] });
    },
    onError: (err) => {
      toast.error(`Erro ao remover: ${err.response?.data?.detail || err.message}`);
      setRemoveMemberTarget(null);
    },
  });

  // get_team_members() returns camelCase: displayName, email, roles
  const members = membersQ.data?.members || [];

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className={labelCls}>Time</label>
            <select className={inputCls} value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)}>
              <option value="">Selecione um time...</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            </select>
          </div>
          {selectedTeamId && (
            <button onClick={() => setShowAddModal(true)} className={btnPrimary}>
              <Plus className="w-4 h-4" /> Adicionar Membro
            </button>
          )}
        </div>

        {selectedTeamId && (
          <div className="card rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className={thCls}>Membro</th>
                  <th className={thCls}>E-mail</th>
                  <th className={thCls}>Função</th>
                  <th className={thCls}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {membersQ.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
                  : members.length === 0
                  ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum membro encontrado.</td></tr>
                  : members.map(m => {
                    const isOwner = (m.roles || []).includes('owner');
                    return (
                      <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className={tdCls}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">
                              {/* camelCase: displayName */}
                              {(m.displayName || '?')[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-900 dark:text-gray-100">{m.displayName || '—'}</span>
                          </div>
                        </td>
                        {/* camelCase: email (from mail/userPrincipalName) */}
                        <td className={tdCls}><span className="text-xs text-gray-500">{m.email || '—'}</span></td>
                        <td className={tdCls}>
                          <select
                            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={isOwner ? 'owner' : 'member'}
                            onChange={e => roleMut.mutate({ memberId: m.id, roles: e.target.value === 'owner' ? ['owner'] : [] })}
                          >
                            <option value="member">Membro</option>
                            <option value="owner">Owner</option>
                          </select>
                        </td>
                        <td className={tdCls}>
                          <button
                            onClick={() => setRemoveMemberTarget(m)}
                            title="Remover membro"
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        )}

        {!selectedTeamId && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Selecione um time para ver os membros</p>
          </div>
        )}
      </div>

      {showAddModal && <AddMemberModal teamId={selectedTeamId} onClose={() => setShowAddModal(false)} />}

      <ConfirmDeleteModal
        isOpen={!!removeMemberTarget}
        onClose={() => setRemoveMemberTarget(null)}
        onConfirm={() => removeMut.mutate(removeMemberTarget.id)}
        title="Remover Membro"
        description={`Remover "${removeMemberTarget?.displayName}" do time?`}
        confirmLabel="Remover"
        isLoading={removeMut.isPending}
      />
    </>
  );
}

// ─ Activity Tab ──────────────────────────────────────────────────────────────
function ActivityTab() {
  const actQ = useQuery({
    queryKey: ['m365-teams-activity'],
    queryFn: m365Service.getTeamsActivity,
    staleTime: 300_000,
    retry: false,
  });

  // snake_case: channel_messages, private_messages, calls, meetings, last_activity
  const rows = actQ.data?.activity || [];

  const totals = rows.reduce((acc, r) => ({
    channel: acc.channel + (r.channel_messages || 0),
    chat: acc.chat + (r.private_messages || 0),
    calls: acc.calls + (r.calls || 0),
    meetings: acc.meetings + (r.meetings || 0),
  }), { channel: 0, chat: 0, calls: 0, meetings: 0 });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Msgs de Canal (D30)', value: totals.channel.toLocaleString(), color: 'text-blue-500' },
          { label: 'Chat Msgs (D30)',      value: totals.chat.toLocaleString(),    color: 'text-purple-500' },
          { label: 'Chamadas (D30)',        value: totals.calls.toLocaleString(),   color: 'text-green-500' },
          { label: 'Reuniões (D30)',        value: totals.meetings.toLocaleString(), color: 'text-amber-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Activity table */}
      <div className="card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className={thCls}>Usuário</th>
              <th className={thCls}>Msgs Canal</th>
              <th className={thCls}>Chat</th>
              <th className={thCls}>Chamadas</th>
              <th className={thCls}>Reuniões</th>
              <th className={thCls}>Tela Compart.</th>
              <th className={thCls}>Última Atividade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {actQ.isLoading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
              : rows.length === 0
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  {actQ.data?.error === 'permission_denied'
                    ? <>Sem permissão para relatórios. No Azure Portal, adicione <code>Reports.Read.All</code> como <strong>Application</strong> e clique em "Grant admin consent".</>
                    : 'Sem dados de atividade nos últimos 30 dias.'}
                </td></tr>
              : rows.map((r, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className={tdCls}>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.display_name || '—'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.upn || ''}</p>
                    </div>
                  </td>
                  <td className={tdCls}>{(r.channel_messages || 0).toLocaleString()}</td>
                  <td className={tdCls}>{(r.private_messages || 0).toLocaleString()}</td>
                  <td className={tdCls}>{(r.calls || 0).toLocaleString()}</td>
                  <td className={tdCls}>{(r.meetings || 0).toLocaleString()}</td>
                  <td className={tdCls}>{(r.screen_share_duration || 0).toLocaleString()}s</td>
                  {/* snake_case: last_activity (not last_activity_date) */}
                  <td className={tdCls}>{fmtDate(r.last_activity)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─ Main Page ─────────────────────────────────────────────────────────────────
export default function TeamsAdmin() {
  const [activeTab, setActiveTab] = useState('teams');

  const teamsQ = useQuery({ queryKey: ['m365-teams'], queryFn: m365Service.getTeams, staleTime: 120_000, retry: false });
  const teams = teamsQ.data?.teams || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <MonitorPlay className="w-6 h-6 text-blue-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Teams Admin</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie times, canais, membros e monitore atividade</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'teams'    && <TeamsTab />}
        {activeTab === 'channels' && <ChannelsTab teams={teams} />}
        {activeTab === 'members'  && <MembersTab teams={teams} />}
        {activeTab === 'activity' && <ActivityTab />}
      </div>
    </Layout>
  );
}
