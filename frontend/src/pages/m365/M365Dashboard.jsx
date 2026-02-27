import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Shield, Grid3x3, Key, Plug, Trash2, X,
  CheckCircle, XCircle, AlertTriangle, RefreshCw, Pencil,
  MessageSquare, ChevronDown, ChevronRight, UserPlus, Search,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import PlanGate from '../../components/common/PlanGate';
import m365Service from '../../services/m365Service';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'visao-geral', label: 'Visão Geral',  icon: Grid3x3 },
  { id: 'usuarios',    label: 'Usuários',       icon: Users },
  { id: 'licencas',    label: 'Licenças',       icon: Key },
  { id: 'equipes',     label: 'Equipes',        icon: MessageSquare },
  { id: 'seguranca',   label: 'Segurança',      icon: Shield },
];

const REQUIRED_PERMISSIONS = [
  'User.Read.All',
  'Organization.Read.All',
  'Reports.Read.All',
  'Team.ReadBasic.All',
  'TeamMember.ReadWrite.All',
  'Directory.Read.All',
  'IdentityRiskyUser.Read.All',
  'SubscribedSku.Read.All',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const pctColor = (pct) => {
  if (pct >= 0.95) return 'bg-red-500';
  if (pct >= 0.8)  return 'bg-yellow-500';
  return 'bg-green-500';
};

const mfaColor = (pct) => {
  if (pct >= 0.9) return 'bg-green-500';
  if (pct >= 0.7) return 'bg-yellow-500';
  return 'bg-red-500';
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ── Credentials Modal ─────────────────────────────────────────────────────────

const CredentialsModal = ({ existing, onClose, onSaved, onDeleted }) => {
  const [form, setForm] = useState({
    tenant_id:     existing?.tenant_id     || '',
    client_id:     existing?.client_id     || '',
    client_secret: '',
    tenant_domain: existing?.tenant_domain || '',
    label:         existing?.label         || 'M365 Tenant',
  });
  const [showDelete, setShowDelete] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: () => m365Service.saveCredentials(form),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['m365-credentials'] });
      onSaved(data);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => m365Service.deleteCredentials(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-credentials'] });
      qc.removeQueries({ queryKey: ['m365-overview'] });
      qc.removeQueries({ queryKey: ['m365-users'] });
      qc.removeQueries({ queryKey: ['m365-licenses'] });
      qc.removeQueries({ queryKey: ['m365-teams'] });
      qc.removeQueries({ queryKey: ['m365-security'] });
      onDeleted();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.tenant_id || !form.client_id || !form.client_secret) return;
    saveMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">
            {existing ? 'Reconfigurar Microsoft 365' : 'Conectar Microsoft 365'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Tenant ID <span className="text-red-400">*</span></label>
            <input
              value={form.tenant_id}
              onChange={(e) => set('tenant_id', e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Client ID (Application ID) <span className="text-red-400">*</span></label>
            <input
              value={form.client_id}
              onChange={(e) => set('client_id', e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Client Secret <span className="text-red-400">*</span>
              {existing && <span className="ml-1 text-slate-500">(deixe em branco para manter o atual)</span>}
            </label>
            <input
              type="password"
              value={form.client_secret}
              onChange={(e) => set('client_secret', e.target.value)}
              placeholder={existing ? '••••••••••••' : 'Novo segredo do App Registration'}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Domínio do Tenant</label>
              <input
                value={form.tenant_domain}
                onChange={(e) => set('tenant_domain', e.target.value)}
                placeholder="contoso.onmicrosoft.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Rótulo</label>
              <input
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
                placeholder="M365 Tenant"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Required permissions info */}
          <div className="rounded-lg border border-blue-800/40 bg-blue-900/20 p-3">
            <p className="text-xs font-semibold text-blue-300 mb-1">Permissões necessárias no Azure AD App Registration:</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {REQUIRED_PERMISSIONS.map((p) => (
                <span key={p} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">
                  {p}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Tipo: <strong className="text-slate-300">Application</strong> (não delegado) • Admin consent obrigatório
            </p>
          </div>

          {saveMut.isError && (
            <p className="text-xs text-red-400">{saveMut.error?.response?.data?.detail || 'Erro ao salvar credenciais'}</p>
          )}

          <div className="flex justify-between pt-1">
            {existing && (
              <button
                type="button"
                onClick={() => setShowDelete(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-900/30"
              >
                <Trash2 size={14} /> Remover conexão
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {saveMut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Plug size={14} />}
                {existing ? 'Salvar' : 'Conectar'}
              </button>
            </div>
          </div>
        </form>

        {showDelete && (
          <div className="border-t border-slate-700 px-5 py-4 bg-slate-800/50 rounded-b-2xl">
            <p className="text-sm text-slate-300 mb-3">Tem certeza? As credenciais M365 serão removidas permanentemente.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDelete(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancelar</button>
              <button
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleteMut.isPending ? 'Removendo...' : 'Confirmar remoção'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Setup Screen (not connected) ──────────────────────────────────────────────

const SetupScreen = ({ onConnect }) => (
  <div className="flex flex-col items-center justify-center py-24 text-center">
    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-900/30 border border-blue-700/40">
      <Grid3x3 size={36} className="text-blue-400" />
    </div>
    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-2">Conectar Microsoft 365</h2>
    <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md mb-6">
      Integre seu tenant Microsoft 365 para visualizar usuários, licenças, equipes e relatórios de segurança diretamente no Cloud Hub Manager.
    </p>
    <button
      onClick={onConnect}
      className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
    >
      <Plug size={16} /> Conectar agora
    </button>
  </div>
);

// ── KPI Card ──────────────────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, color = 'text-blue-400' }) => (
  <div className="card rounded-2xl p-5">
    <p className="text-xs font-medium text-gray-500 dark:text-slate-400">{label}</p>
    <p className={`mt-1 text-3xl font-bold ${color}`}>{value ?? '—'}</p>
    {sub && <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{sub}</p>}
  </div>
);

// ── Tab: Visão Geral ──────────────────────────────────────────────────────────

const OverviewTab = ({ overview, isLoading }) => {
  if (isLoading) return <LoadingSpinner />;
  if (!overview) return null;

  const usagePct = overview.total_licenses > 0
    ? overview.assigned_licenses / overview.total_licenses
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Usuários licenciados"  value={overview.licensed_users}   color="text-blue-400" />
        <KpiCard label="Licenças disponíveis"  value={overview.available_licenses} color="text-green-400"
                 sub={`de ${overview.total_licenses} total`} />
        <KpiCard label="Equipes ativas"        value={overview.total_teams}      color="text-purple-400" />
        <KpiCard label="Usuários desativados"  value={overview.disabled_users}   color="text-slate-400" />
      </div>

      {/* License utilization bar */}
      <div className="card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Utilização de Licenças</p>
          <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            {overview.assigned_licenses} / {overview.total_licenses} ({Math.round(usagePct * 100)}%)
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-slate-700">
          <div
            className={`h-3 rounded-full transition-all ${pctColor(usagePct)}`}
            style={{ width: `${Math.min(usagePct * 100, 100)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-400 dark:text-slate-500">
          <span>{overview.sku_count} plano(s) de licença</span>
          <span>{overview.available_licenses} disponíveis</span>
        </div>
      </div>
    </div>
  );
};

// ── Tab: Usuários ─────────────────────────────────────────────────────────────

const UsersTab = ({ data, isLoading }) => {
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');

  if (isLoading) return <LoadingSpinner />;

  const users = (data?.users || []).filter((u) => {
    const matchSearch = !search || (
      u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      u.userPrincipalName?.toLowerCase().includes(search.toLowerCase())
    );
    const matchActive = filterActive === 'all' || (filterActive === 'active' ? u.accountEnabled : !u.accountEnabled);
    return matchSearch && matchActive;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail..."
          className="flex-1 min-w-48 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
        />
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Desativados</option>
        </select>
      </div>

      <div className="card rounded-2xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
          <thead className="bg-gray-50 dark:bg-slate-800/60">
            <tr>
              {['Nome', 'E-mail', 'Departamento', 'Licenças', 'MFA', 'Último acesso', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {users.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-slate-500">Nenhum usuário encontrado</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-100">{u.displayName || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400 font-mono">{u.userPrincipalName || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{u.department || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{u.licensedCount ?? '—'}</td>
                <td className="px-4 py-3">
                  {u.mfaRegistered === true  && <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle size={12} /> Sim</span>}
                  {u.mfaRegistered === false && <span className="flex items-center gap-1 text-xs text-red-500"><XCircle size={12} /> Não</span>}
                  {u.mfaRegistered == null   && <span className="text-xs text-gray-400 dark:text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 dark:text-slate-500">{fmtDate(u.lastSignIn)}</td>
                <td className="px-4 py-3">
                  {u.accountEnabled
                    ? <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">Ativo</span>
                    : <span className="rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-xs text-gray-500 dark:text-slate-400">Desativado</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-500">{users.length} usuário(s) exibido(s)</p>
    </div>
  );
};

// ── Tab: Licenças ─────────────────────────────────────────────────────────────

const LicensesTab = ({ data, isLoading }) => {
  if (isLoading) return <LoadingSpinner />;

  const licenses = data?.licenses || [];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {licenses.length === 0 && (
        <p className="col-span-full text-center text-sm text-gray-400 dark:text-slate-500 py-12">Nenhuma licença encontrada</p>
      )}
      {licenses.map((sku) => {
        const pct = sku.prepaid > 0 ? sku.consumed / sku.prepaid : 0;
        const low = sku.available < sku.prepaid * 0.1;
        return (
          <div key={sku.skuId} className="card rounded-2xl p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 leading-tight">{sku.skuPartNumber}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 font-mono">{sku.skuId.slice(0, 8)}…</p>
              </div>
              {low && <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">Baixo</span>}
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1 text-gray-500 dark:text-slate-400">
                <span>{sku.consumed} usadas</span>
                <span>{sku.prepaid} total</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700">
                <div className={`h-2 rounded-full ${pctColor(pct)}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
              <span className="text-green-600 dark:text-green-400 font-medium">{sku.available} disponíveis</span>
              {sku.suspended > 0 && <span className="text-yellow-500">{sku.suspended} suspensas</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Add Member Modal ──────────────────────────────────────────────────────────

const AddMemberModal = ({ team, onClose }) => {
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [asOwner, setAsOwner] = useState(false);
  const qc = useQueryClient();

  const usersQ = useQuery({
    queryKey: ['m365-users-picker'],
    queryFn: m365Service.getUsers,
    staleTime: 60_000,
  });

  const addMut = useMutation({
    mutationFn: () =>
      m365Service.addTeamMember(team.id, selectedUserId, asOwner ? ['owner'] : []),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-team-members', team.id] });
      onClose();
    },
  });

  const allUsers = usersQ.data?.users || [];
  const filtered = allUsers.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.displayName?.toLowerCase().includes(q) ||
      u.userPrincipalName?.toLowerCase().includes(q)
    );
  });

  const selected = allUsers.find((u) => u.id === selectedUserId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Adicionar membro</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{team.displayName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuário por nome ou e-mail..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1 min-h-0">
          {usersQ.isLoading && (
            <p className="text-center text-sm text-slate-400 py-6">Carregando usuários...</p>
          )}
          {!usersQ.isLoading && filtered.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-6">Nenhum usuário encontrado</p>
          )}
          {filtered.slice(0, 50).map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedUserId(u.id === selectedUserId ? null : u.id)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                u.id === selectedUserId
                  ? 'bg-blue-600/20 border border-blue-600/40'
                  : 'hover:bg-slate-800 border border-transparent'
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-300">
                {(u.displayName || u.userPrincipalName || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{u.displayName || '—'}</p>
                <p className="text-xs text-slate-400 truncate font-mono">{u.userPrincipalName}</p>
              </div>
              {u.id === selectedUserId && (
                <CheckCircle size={16} className="ml-auto shrink-0 text-blue-400" />
              )}
            </button>
          ))}
          {filtered.length > 50 && (
            <p className="text-center text-xs text-slate-500 pt-2">
              Mostrando 50 de {filtered.length} — refine a busca
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 px-5 py-4 shrink-0 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={asOwner}
              onChange={(e) => setAsOwner(e.target.checked)}
              className="rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">Adicionar como <strong>proprietário</strong> (owner)</span>
          </label>

          {addMut.isError && (
            <p className="text-xs text-red-400">
              {addMut.error?.response?.data?.detail || 'Erro ao adicionar membro'}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              onClick={() => addMut.mutate()}
              disabled={!selectedUserId || addMut.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {addMut.isPending
                ? <RefreshCw size={14} className="animate-spin" />
                : <UserPlus size={14} />}
              {selected ? `Adicionar ${selected.displayName?.split(' ')[0] || ''}` : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Team Card (expandable) ────────────────────────────────────────────────────

const TeamCard = ({ team }) => {
  const [expanded, setExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const membersQ = useQuery({
    queryKey: ['m365-team-members', team.id],
    queryFn: () => m365Service.getTeamMembers(team.id),
    enabled: expanded,
  });

  const members = membersQ.data?.members || [];

  return (
    <>
      <div className="card rounded-2xl overflow-hidden">
        {/* Header row */}
        <button
          onClick={() => setExpanded((p) => !p)}
          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors text-left"
        >
          {/* Team avatar */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-600/30 text-sm font-bold text-blue-400 select-none">
            {(team.displayName || '?')[0].toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{team.displayName}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                team.visibility === 'public'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
              }`}>
                {team.visibility === 'public' ? 'Pública' : 'Privada'}
              </span>
              {team.isArchived && (
                <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                  Arquivada
                </span>
              )}
            </div>
            {team.description && (
              <p className="text-xs text-gray-400 dark:text-slate-500 truncate mt-0.5">{team.description}</p>
            )}
          </div>

          {/* Members count + chevron */}
          <div className="shrink-0 flex items-center gap-3">
            {team.membersCount != null && (
              <span className="text-xs text-gray-500 dark:text-slate-400">
                <Users size={12} className="inline mr-1" />{team.membersCount}
              </span>
            )}
            {expanded
              ? <ChevronDown size={16} className="text-gray-400 dark:text-slate-400" />
              : <ChevronRight size={16} className="text-gray-400 dark:text-slate-400" />}
          </div>
        </button>

        {/* Expanded panel */}
        {expanded && (
          <div className="border-t border-gray-200 dark:border-slate-700 px-5 py-4 space-y-4 bg-gray-50/50 dark:bg-slate-800/30">
            {/* Members section */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Membros
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600/10 border border-blue-600/30 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-600/20 transition-colors"
              >
                <UserPlus size={12} /> Adicionar membro
              </button>
            </div>

            {membersQ.isLoading && (
              <div className="flex justify-center py-4">
                <RefreshCw size={16} className="animate-spin text-slate-400" />
              </div>
            )}

            {membersQ.isError && (
              <p className="text-xs text-red-400 text-center py-2">
                Falha ao carregar membros — verifique a permissão TeamMember.Read.All
              </p>
            )}

            {!membersQ.isLoading && !membersQ.isError && members.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-2">
                Nenhum membro encontrado
              </p>
            )}

            {members.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-2"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {(m.displayName || m.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                        {m.displayName || '—'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 truncate font-mono">
                        {m.email || '—'}
                      </p>
                    </div>
                    {m.roles?.includes('owner') && (
                      <span className="rounded-full bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-400 shrink-0">
                        owner
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddMemberModal team={team} onClose={() => setShowAddModal(false)} />
      )}
    </>
  );
};

// ── Tab: Equipes ──────────────────────────────────────────────────────────────

const TeamsTab = ({ data, isLoading }) => {
  const [search, setSearch] = useState('');

  if (isLoading) return <LoadingSpinner />;

  const teams = (data?.teams || []).filter((t) =>
    !search || t.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar equipe..."
          className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {teams.length === 0 && (
        <div className="card rounded-2xl py-16 text-center">
          <MessageSquare size={32} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-sm text-gray-400 dark:text-slate-500">
            {search ? 'Nenhuma equipe encontrada para a busca' : 'Nenhuma equipe encontrada'}
          </p>
          {!search && (
            <p className="text-xs text-gray-400 dark:text-slate-600 mt-1">
              Verifique se a permissão Team.ReadBasic.All foi concedida no Azure AD
            </p>
          )}
        </div>
      )}

      {teams.map((team) => (
        <TeamCard key={team.id} team={team} />
      ))}

      {teams.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-slate-500">{teams.length} equipe(s)</p>
      )}
    </div>
  );
};

// ── Tab: Segurança ────────────────────────────────────────────────────────────

const SecurityTab = ({ data, isLoading }) => {
  if (isLoading) return <LoadingSpinner />;
  if (!data) return null;

  const mfaPct = data.mfa_coverage_pct ?? 0;

  return (
    <div className="space-y-6">
      {/* MFA coverage */}
      <div className="card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Cobertura MFA</p>
          <span className="text-2xl font-bold text-gray-900 dark:text-slate-100">{Math.round(mfaPct * 100)}%</span>
        </div>
        <div className="h-4 w-full rounded-full bg-gray-200 dark:bg-slate-700">
          <div className={`h-4 rounded-full transition-all ${mfaColor(mfaPct)}`} style={{ width: `${Math.min(mfaPct * 100, 100)}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-400 dark:text-slate-500">
          <span>{data.mfa_enabled} com MFA ativado</span>
          <span>{data.total_users_checked} verificados</span>
        </div>
      </div>

      {/* Users without MFA */}
      {data.users_without_mfa?.length > 0 && (
        <div className="card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-yellow-500" />
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              Usuários sem MFA ({data.users_without_mfa.length})
            </p>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.users_without_mfa.map((u, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-slate-800/50 px-3 py-2">
                <span className="text-sm text-gray-900 dark:text-slate-100">{u.displayName || u.userPrincipalName}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500 font-mono">{u.userPrincipalName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risky users */}
      {data.risky_users_count > 0 && (
        <div className="card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-red-500" />
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              Usuários de risco ({data.risky_users_count})
            </p>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.risky_users.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-slate-800/50 px-3 py-2">
                <span className="text-sm text-gray-900 dark:text-slate-100 font-mono">{u.userPrincipalName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  u.riskLevel === 'high'   ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'   :
                  u.riskLevel === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400' :
                                             'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'
                }`}>
                  {u.riskLevel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.risky_users_count === 0 && data.users_without_mfa?.length === 0 && (
        <div className="card rounded-2xl p-8 text-center">
          <CheckCircle size={36} className="text-green-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Nenhum problema de segurança detectado</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Todos os usuários verificados têm MFA ativado e nenhum risco foi identificado.</p>
        </div>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function M365Dashboard() {
  const { currentOrg } = useOrgWorkspace();
  const planTier = (currentOrg?.plan_tier || 'free').toLowerCase();
  const isEnterprise = planTier === 'enterprise';

  const [activeTab, setActiveTab] = useState('visao-geral');
  const [showCredModal, setShowCredModal] = useState(false);

  const qc = useQueryClient();

  const credsQ = useQuery({
    queryKey: ['m365-credentials'],
    queryFn: m365Service.getCredentials,
    retry: false,
  });

  const connected = credsQ.data?.connected === true;

  const overviewQ = useQuery({
    queryKey: ['m365-overview'],
    queryFn: m365Service.getOverview,
    enabled: connected && isEnterprise && activeTab === 'visao-geral',
  });

  const usersQ = useQuery({
    queryKey: ['m365-users'],
    queryFn: m365Service.getUsers,
    enabled: connected && isEnterprise && activeTab === 'usuarios',
  });

  const licensesQ = useQuery({
    queryKey: ['m365-licenses'],
    queryFn: m365Service.getLicenses,
    enabled: connected && isEnterprise && activeTab === 'licencas',
  });

  const teamsQ = useQuery({
    queryKey: ['m365-teams'],
    queryFn: m365Service.getTeams,
    enabled: connected && isEnterprise && activeTab === 'equipes',
  });

  const securityQ = useQuery({
    queryKey: ['m365-security'],
    queryFn: m365Service.getSecurity,
    enabled: connected && isEnterprise && activeTab === 'seguranca',
  });

  const handleCredSaved = () => {
    setShowCredModal(false);
    qc.invalidateQueries({ queryKey: ['m365-credentials'] });
  };

  const handleCredDeleted = () => {
    setShowCredModal(false);
    setActiveTab('visao-geral');
  };

  return (
    <Layout>
      <PlanGate requiredPlan="enterprise">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-600/30">
                <Grid3x3 size={20} className="text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Microsoft 365</h1>
                {credsQ.data?.tenant_domain && (
                  <p className="text-xs text-gray-500 dark:text-slate-400">{credsQ.data.tenant_domain}</p>
                )}
              </div>
            </div>
            {connected && (
              <button
                onClick={() => setShowCredModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <Pencil size={13} /> Reconfigurar
              </button>
            )}
          </div>

          {/* Not connected */}
          {credsQ.isSuccess && !connected && (
            <SetupScreen onConnect={() => setShowCredModal(true)} />
          )}

          {/* Connected — tabs */}
          {connected && (
            <>
              {/* Tab bar */}
              <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === id
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === 'visao-geral' && (
                <OverviewTab overview={overviewQ.data} isLoading={overviewQ.isLoading} />
              )}
              {activeTab === 'usuarios' && (
                <UsersTab data={usersQ.data} isLoading={usersQ.isLoading} />
              )}
              {activeTab === 'licencas' && (
                <LicensesTab data={licensesQ.data} isLoading={licensesQ.isLoading} />
              )}
              {activeTab === 'equipes' && (
                <TeamsTab data={teamsQ.data} isLoading={teamsQ.isLoading} />
              )}
              {activeTab === 'seguranca' && (
                <SecurityTab data={securityQ.data} isLoading={securityQ.isLoading} />
              )}
            </>
          )}
        </div>
      </PlanGate>

      {showCredModal && (
        <CredentialsModal
          existing={connected ? credsQ.data : null}
          onClose={() => setShowCredModal(false)}
          onSaved={handleCredSaved}
          onDeleted={handleCredDeleted}
        />
      )}
    </Layout>
  );
}
