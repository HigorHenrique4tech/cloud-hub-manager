import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Shield, Grid3x3, Key, Plug, Trash2, X,
  CheckCircle, XCircle, AlertTriangle, RefreshCw, Pencil,
  MessageSquare, ChevronDown, ChevronRight, UserPlus, Search, Plus,
  Smartphone, Phone, Mail, Fingerprint, Monitor, Clock, Lock, LogOut,
  Download, Activity,
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
  { id: 'equipes',     label: 'Grupos',         icon: MessageSquare },
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
  'User.ReadWrite.All',
  'Group.ReadWrite.All',
  'UserAuthenticationMethod.ReadWrite.All',
  'ServiceHealth.Read.All',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

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

// ── User Detail Drawer ────────────────────────────────────────────────────────

const METHOD_ICON = {
  microsoftAuthenticator: Smartphone,
  phone:                  Phone,
  email:                  Mail,
  fido2:                  Fingerprint,
  windowsHello:           Monitor,
  tap:                    Clock,
  oath:                   Lock,
  password:               Lock,
};

const initials = (name) =>
  (name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-purple-600', 'bg-green-600',
  'bg-rose-600', 'bg-amber-600', 'bg-teal-600',
];
const avatarColor = (name) =>
  AVATAR_COLORS[(name || '').charCodeAt(0) % AVATAR_COLORS.length];

const UserDetailDrawer = ({ user, onClose }) => {
  const isOpen = !!user;
  const qc = useQueryClient();
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [showTap, setShowTap]           = useState(false);
  const [tapResult, setTapResult]       = useState(null);
  const [newPwd, setNewPwd]             = useState('');
  const [forceChange, setForceChange]   = useState(true);
  const [tapMinutes, setTapMinutes]     = useState(60);
  const [tapOnce, setTapOnce]           = useState(true);
  const [localEnabled, setLocalEnabled] = useState(null); // optimistic

  // Sync localEnabled when user changes
  useEffect(() => { setLocalEnabled(null); }, [user?.id]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const methodsQ = useQuery({
    queryKey: ['m365-user-auth-methods', user?.id],
    queryFn: () => m365Service.getUserAuthMethods(user.id),
    enabled: isOpen && !!user?.id,
    staleTime: 30_000,
    retry: false,
  });

  const groupsQ = useQuery({
    queryKey: ['m365-user-groups', user?.id],
    queryFn: () => m365Service.getUserGroups(user.id),
    enabled: isOpen && !!user?.id,
    staleTime: 60_000,
    retry: false,
  });

  const revokeMut = useMutation({
    mutationFn: () => m365Service.revokeUserSessions(user.id),
  });

  const deleteMut = useMutation({
    mutationFn: ({ methodType, methodId }) =>
      m365Service.deleteAuthMethod(user.id, methodType, methodId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m365-user-auth-methods', user?.id] }),
  });

  const toggleMut = useMutation({
    mutationFn: (enabled) => m365Service.toggleUserAccount(user.id, enabled),
    onSuccess: (_, enabled) => {
      setLocalEnabled(enabled);
      qc.invalidateQueries({ queryKey: ['m365-users'] });
    },
  });

  const resetPwdMut = useMutation({
    mutationFn: () => m365Service.resetUserPassword(user.id, newPwd, forceChange),
    onSuccess: () => { setShowResetPwd(false); setNewPwd(''); },
  });

  const tapMut = useMutation({
    mutationFn: () => m365Service.createTap(user.id, tapMinutes, tapOnce),
    onSuccess: (data) => setTapResult(data),
  });

  const methods    = methodsQ.data?.methods || [];
  const mfaMethods = methods.filter((m) => m.methodType !== 'password');
  const hasPassword = methods.some((m) => m.methodType === 'password');
  const groups     = groupsQ.data?.groups || [];
  const isEnabled  = localEnabled !== null ? localEnabled : (user?.accountEnabled ?? true);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[500px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${user ? avatarColor(user.displayName) : 'bg-gray-400'}`}>
              {initials(user?.displayName)}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{user?.displayName || '—'}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{user?.userPrincipalName}</p>
              <div className="mt-1.5 flex items-center gap-2">
                {isEnabled
                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium">Ativo</span>
                  : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 font-medium">Desativado</span>}
                <button
                  onClick={() => {
                    const action = isEnabled ? 'desativar' : 'ativar';
                    if (window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} a conta de ${user?.displayName}?`)) {
                      toggleMut.mutate(!isEnabled);
                    }
                  }}
                  disabled={toggleMut.isPending}
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors disabled:opacity-50 ${
                    isEnabled
                      ? 'border-red-300 dark:border-red-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'border-green-400 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                  }`}
                >
                  {toggleMut.isPending ? '...' : isEnabled ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Info section */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Informações</h3>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {[
                { label: 'Cargo',        value: user?.jobTitle },
                { label: 'Departamento', value: user?.department },
                { label: 'Licenças',     value: user?.licensedCount != null ? `${user.licensedCount} atribuída(s)` : null },
                { label: 'Último acesso',value: fmtDate(user?.lastSignIn) },
                { label: 'Senha local',  value: hasPassword ? 'Sim' : null },
              ].filter((f) => f.value).map((f) => (
                <div key={f.label} className="flex items-center justify-between py-2.5 gap-4">
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0 w-32">{f.label}</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100 text-right">{f.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Grupos */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
              Grupos ({groupsQ.isLoading ? '…' : groups.length})
            </h3>
            {groupsQ.isLoading && <div className="h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />}
            {!groupsQ.isLoading && groups.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-slate-500">Nenhum grupo encontrado</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <span
                  key={g.id}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                    g.isM365Group
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400'
                  }`}
                >
                  {g.isM365Group ? <MessageSquare size={10} /> : <Shield size={10} />}
                  {g.displayName}
                </span>
              ))}
            </div>
          </div>

          {/* Reset de senha */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => { setShowResetPwd((p) => !p); setShowTap(false); setTapResult(null); }}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="flex items-center gap-2"><Key size={14} className="text-gray-400" /> Resetar senha</span>
              {showResetPwd ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showResetPwd && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="Nova senha..."
                    className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setNewPwd(genPassword())}
                    className="rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-2 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    Gerar
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={forceChange} onChange={(e) => setForceChange(e.target.checked)} className="rounded" />
                  Forçar troca no próximo login
                </label>
                {resetPwdMut.isError && (
                  <p className="text-xs text-red-400">{resetPwdMut.error?.response?.data?.detail || 'Erro ao resetar senha'}</p>
                )}
                {resetPwdMut.isSuccess && (
                  <p className="text-xs text-green-500">Senha alterada com sucesso!</p>
                )}
                <button
                  onClick={() => resetPwdMut.mutate()}
                  disabled={!newPwd || resetPwdMut.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {resetPwdMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Key size={13} />}
                  Confirmar reset
                </button>
              </div>
            )}
          </div>

          {/* Acesso Temporário (TAP) */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => { setShowTap((p) => !p); setShowResetPwd(false); setTapResult(null); }}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="flex items-center gap-2"><Clock size={14} className="text-gray-400" /> Criar Acesso Temporário (TAP)</span>
              {showTap ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showTap && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                {tapResult ? (
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-400/40 p-4 space-y-2">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400">TAP criado! Compartilhe com o usuário:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-lg font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded px-3 py-2 tracking-widest">
                        {tapResult.temporaryAccessPass}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(tapResult.temporaryAccessPass)}
                        className="rounded-lg border border-green-400/40 px-2 py-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/40"
                        title="Copiar"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Válido por {tapResult.lifetimeInMinutes} min · {tapResult.isUsableOnce ? 'Uso único' : 'Múltiplos usos'}
                    </p>
                    <button onClick={() => { setTapResult(null); }} className="text-xs text-gray-400 hover:underline">Criar outro</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-600 dark:text-slate-400 flex-shrink-0">Validade (min)</label>
                      <input
                        type="number"
                        min={10} max={480}
                        value={tapMinutes}
                        onChange={(e) => setTapMinutes(Number(e.target.value))}
                        className="w-24 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={tapOnce} onChange={(e) => setTapOnce(e.target.checked)} className="rounded" />
                      Uso único (recomendado)
                    </label>
                    {tapMut.isError && (
                      <p className="text-xs text-red-400">{tapMut.error?.response?.data?.detail || 'Erro ao criar TAP'}</p>
                    )}
                    <button
                      onClick={() => tapMut.mutate()}
                      disabled={tapMut.isPending}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {tapMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Clock size={13} />}
                      Gerar acesso temporário
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* MFA Methods section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Métodos de Autenticação (MFA)
              </h3>
              {user?.mfaRegistered === true  && <span className="flex items-center gap-1 text-xs text-green-500"><CheckCircle size={12} /> Registrado</span>}
              {user?.mfaRegistered === false && <span className="flex items-center gap-1 text-xs text-red-400"><XCircle size={12} /> Não registrado</span>}
            </div>

            {methodsQ.isLoading && (
              <div className="space-y-3">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                ))}
              </div>
            )}

            {methodsQ.isError && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  Não foi possível carregar os métodos.
                  Verifique a permissão <span className="font-mono">UserAuthenticationMethod.Read.All</span>.
                </p>
                <button onClick={() => qc.invalidateQueries({ queryKey: ['m365-user-auth-methods', user?.id] })} className="mt-2 text-xs text-blue-500 hover:underline">
                  Tentar novamente
                </button>
              </div>
            )}

            {!methodsQ.isLoading && !methodsQ.isError && mfaMethods.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-5 text-center">
                <Shield size={24} className="text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-slate-500">Nenhum método MFA registrado</p>
              </div>
            )}

            <div className="space-y-2">
              {mfaMethods.map((m) => {
                const Icon = METHOD_ICON[m.methodType] || Shield;
                const isDeleting = deleteMut.isPending && deleteMut.variables?.methodId === m.id;
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-600/15 flex items-center justify-center">
                      <Icon size={15} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.label}</p>
                      {m.detail && <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{m.detail}</p>}
                      {m.createdDateTime && <p className="text-xs text-gray-400 dark:text-slate-500">Registrado em {fmtDate(m.createdDateTime)}</p>}
                    </div>
                    {m.deletable && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remover ${m.label}? O usuário precisará recadastrar este método.`)) {
                            deleteMut.mutate({ methodType: m.methodType, methodId: m.id });
                          }
                        }}
                        disabled={isDeleting}
                        className="flex-shrink-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40"
                        title={`Remover ${m.label}`}
                      >
                        {isDeleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-2">
          {revokeMut.isSuccess && (
            <p className="text-xs text-green-500 text-center">Sessões revogadas com sucesso.</p>
          )}
          {revokeMut.isError && (
            <p className="text-xs text-red-400 text-center">{revokeMut.error?.response?.data?.detail || 'Erro ao revogar sessões'}</p>
          )}
          <button
            onClick={() => {
              if (window.confirm('Revogar todas as sessões ativas? O usuário será desconectado imediatamente de todos os dispositivos.')) {
                revokeMut.mutate();
              }
            }}
            disabled={revokeMut.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-orange-400/50 bg-orange-50 dark:bg-orange-900/20 px-4 py-2.5 text-sm font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 disabled:opacity-50 transition-colors"
          >
            {revokeMut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <LogOut size={14} />}
            Revogar todas as sessões
          </button>
        </div>
      </div>
    </>
  );
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

const ApiErrorCard = ({ error, onRefresh }) => (
  <div className="card rounded-2xl p-8 text-center space-y-3">
    <XCircle size={36} className="text-red-400 mx-auto" />
    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Falha ao carregar dados</p>
    <p className="text-xs text-gray-400 dark:text-slate-500 max-w-md mx-auto">
      {error?.response?.data?.detail || 'Verifique as permissões do App Registration no Azure AD.'}
    </p>
    {onRefresh && (
      <button
        onClick={onRefresh}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
      >
        <RefreshCw size={13} /> Tentar novamente
      </button>
    )}
  </div>
);

// ── Tab: Visão Geral ──────────────────────────────────────────────────────────

const OverviewTab = ({ overview, isLoading, isError, error, onRefresh }) => {
  if (isLoading) return <LoadingSpinner />;

  if (isError) {
    return (
      <div className="card rounded-2xl p-8 text-center space-y-3">
        <XCircle size={36} className="text-red-400 mx-auto" />
        <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Falha ao carregar dados do tenant</p>
        <p className="text-xs text-gray-400 dark:text-slate-500 max-w-md mx-auto">
          {error?.response?.data?.detail || 'Verifique se as credenciais estão corretas e se todas as permissões do App Registration foram concedidas com admin consent.'}
        </p>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
        >
          <RefreshCw size={13} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!overview) return null;

  const usagePct = overview.total_licenses > 0
    ? overview.assigned_licenses / overview.total_licenses
    : 0;

  const noData = overview.total_users === 0 && overview.total_licenses === 0;

  return (
    <div className="space-y-6">
      {noData && (
        <div className="rounded-xl border border-yellow-300 dark:border-yellow-700/50 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Nenhum dado encontrado</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
              Verifique se as permissões <code className="bg-yellow-100 dark:bg-yellow-800/40 px-1 rounded">User.Read.All</code> e <code className="bg-yellow-100 dark:bg-yellow-800/40 px-1 rounded">SubscribedSku.Read.All</code> foram concedidas com <strong>admin consent</strong> no App Registration.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Usuários ativos"       value={overview.active_users}     color="text-blue-400" />
        <KpiCard label="Licenças disponíveis"  value={overview.available_licenses} color="text-green-400"
                 sub={`de ${overview.total_licenses} total`} />
        <KpiCard label="Grupos ativos"         value={overview.total_teams}      color="text-purple-400" />
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

// ── Create User Panel (inline expandable) ─────────────────────────────────────

const CreateUserPanel = () => {
  const [open, setOpen] = useState(false);
  const emptyForm = () => ({
    display_name: '', first_name: '', last_name: '',
    upn: '', password: genPassword(),
    job_title: '', department: '', usage_location: 'BR',
    mail_nickname: '', account_enabled: true, force_change_password: true,
  });
  const [form, setForm] = useState(emptyForm);
  const [showPwd, setShowPwd] = useState(false);
  const qc = useQueryClient();

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const createMut = useMutation({
    mutationFn: () => m365Service.createUser(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-users'] });
      setOpen(false);
      setForm(emptyForm());
    },
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 shrink-0"
      >
        <Plus size={14} /> Criar usuário
      </button>
    );
  }

  return (
    <div className="card rounded-2xl p-5 space-y-4 border-l-4 border-l-blue-500">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Novo usuário</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Nome</label>
          <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} placeholder="João"
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Sobrenome</label>
          <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} placeholder="Silva"
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
          Nome de exibição <span className="text-red-400">*</span>
        </label>
        <input value={form.display_name} onChange={(e) => set('display_name', e.target.value)} placeholder="João Silva"
          className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
          UserPrincipalName (e-mail) <span className="text-red-400">*</span>
        </label>
        <input value={form.upn} onChange={(e) => set('upn', e.target.value)}
          placeholder="joao.silva@contoso.onmicrosoft.com"
          className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none font-mono" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
          Senha inicial <span className="text-red-400">*</span>
        </label>
        <div className="flex gap-2">
          <input
            type={showPwd ? 'text' : 'password'}
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none font-mono"
          />
          <button type="button" onClick={() => setShowPwd((p) => !p)}
            className="rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-2 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 whitespace-nowrap">
            {showPwd ? 'Ocultar' : 'Mostrar'}
          </button>
          <button type="button" onClick={() => set('password', genPassword())}
            className="rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-2 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700">
            Gerar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Cargo</label>
          <input value={form.job_title} onChange={(e) => set('job_title', e.target.value)} placeholder="Analista de TI"
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Departamento</label>
          <input value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="TI"
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Local de uso</label>
          <select value={form.usage_location} onChange={(e) => set('usage_location', e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100">
            <option value="BR">BR — Brasil</option>
            <option value="US">US — Estados Unidos</option>
            <option value="PT">PT — Portugal</option>
            <option value="GB">GB — Reino Unido</option>
            <option value="DE">DE — Alemanha</option>
            <option value="FR">FR — França</option>
            <option value="ES">ES — Espanha</option>
            <option value="AR">AR — Argentina</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Apelido de e-mail</label>
          <input value={form.mail_nickname} onChange={(e) => set('mail_nickname', e.target.value)}
            placeholder="auto (do UPN)"
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none font-mono" />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.account_enabled} onChange={(e) => set('account_enabled', e.target.checked)}
            className="rounded border-gray-400 dark:border-slate-600" />
          <span className="text-sm text-gray-700 dark:text-slate-300">Conta habilitada</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.force_change_password} onChange={(e) => set('force_change_password', e.target.checked)}
            className="rounded border-gray-400 dark:border-slate-600" />
          <span className="text-sm text-gray-700 dark:text-slate-300">Forçar troca de senha no 1º acesso</span>
        </label>
      </div>

      {createMut.isError && (
        <p className="text-xs text-red-400">
          {createMut.error?.response?.data?.detail || 'Erro ao criar usuário'}
        </p>
      )}
      {createMut.isSuccess && (
        <p className="text-xs text-green-500">Usuário criado com sucesso!</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white">
          Cancelar
        </button>
        <button
          onClick={() => createMut.mutate()}
          disabled={!form.display_name || !form.upn || !form.password || createMut.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {createMut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          Criar usuário
        </button>
      </div>
    </div>
  );
};

// ── Create Group Panel (inline expandable) ────────────────────────────────────

const CreateGroupPanel = () => {
  const [open, setOpen] = useState(false);
  const emptyForm = () => ({
    display_name: '', description: '', mail_nickname: '', group_type: 'm365', visibility: 'Private',
  });
  const [form, setForm] = useState(emptyForm);
  const qc = useQueryClient();

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const autoNickname = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const createMut = useMutation({
    mutationFn: () => m365Service.createGroup(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-teams'] });
      setOpen(false);
      setForm(emptyForm());
    },
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 shrink-0"
      >
        <Plus size={14} /> Criar grupo
      </button>
    );
  }

  return (
    <div className="card rounded-2xl p-5 space-y-4 border-l-4 border-l-blue-500">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Novo grupo</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
          Nome do grupo <span className="text-red-400">*</span>
        </label>
        <input
          value={form.display_name}
          onChange={(e) => {
            const v = e.target.value;
            set('display_name', v);
            // Auto-fill nickname only if it hasn't been manually edited
            if (!form.mail_nickname || form.mail_nickname === autoNickname(form.display_name)) {
              set('mail_nickname', autoNickname(v));
            }
          }}
          placeholder="Equipe de Marketing"
          className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Apelido de e-mail</label>
        <input value={form.mail_nickname} onChange={(e) => set('mail_nickname', e.target.value)}
          placeholder="equipe-de-marketing"
          className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none font-mono" />
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Preenchido automaticamente — sem espaços ou caracteres especiais</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Descrição</label>
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
          placeholder="Descreva o propósito deste grupo..." rows={2}
          className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none resize-none" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">Tipo de grupo</label>
        <div className="flex gap-3">
          {[
            ['m365', 'Microsoft 365', 'Teams, SharePoint, Exchange'],
            ['security', 'Grupo de Segurança', 'Controle de acesso a recursos'],
          ].map(([val, label, hint]) => (
            <label key={val} className={`flex-1 flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
              form.group_type === val
                ? 'border-blue-500 bg-blue-600/10'
                : 'border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}>
              <input type="radio" name="group_type" value={val} checked={form.group_type === val}
                onChange={() => set('group_type', val)} className="sr-only" />
              <span className={`text-xs font-semibold ${form.group_type === val ? 'text-blue-500' : 'text-gray-700 dark:text-slate-300'}`}>{label}</span>
              <span className="text-xs text-gray-400 dark:text-slate-500">{hint}</span>
            </label>
          ))}
        </div>
      </div>

      {form.group_type === 'm365' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">Visibilidade</label>
          <div className="flex gap-3">
            {[
              ['Private', 'Privada', 'Apenas membros convidados'],
              ['Public', 'Pública', 'Qualquer pessoa na organização'],
            ].map(([val, label, hint]) => (
              <label key={val} className={`flex-1 flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                form.visibility === val
                  ? 'border-blue-500 bg-blue-600/10'
                  : 'border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}>
                <input type="radio" name="visibility" value={val} checked={form.visibility === val}
                  onChange={() => set('visibility', val)} className="sr-only" />
                <span className={`text-xs font-semibold ${form.visibility === val ? 'text-blue-500' : 'text-gray-700 dark:text-slate-300'}`}>{label}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">{hint}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {createMut.isError && (
        <p className="text-xs text-red-400">
          {createMut.error?.response?.data?.detail || 'Erro ao criar grupo'}
        </p>
      )}
      {createMut.isSuccess && (
        <p className="text-xs text-green-500">Grupo criado com sucesso!</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white">
          Cancelar
        </button>
        <button
          onClick={() => createMut.mutate()}
          disabled={!form.display_name || createMut.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {createMut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          Criar grupo
        </button>
      </div>
    </div>
  );
};

// ── Tab: Usuários ─────────────────────────────────────────────────────────────

const exportCsv = (users) => {
  const headers = ['Nome', 'E-mail', 'Cargo', 'Departamento', 'Licenças', 'MFA', 'Último acesso', 'Status'];
  const rows = users.map((u) => [
    u.displayName || '',
    u.userPrincipalName || '',
    u.jobTitle || '',
    u.department || '',
    u.licensedCount ?? '',
    u.mfaRegistered === true ? 'Sim' : u.mfaRegistered === false ? 'Não' : '—',
    u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString('pt-BR') : '—',
    u.accountEnabled ? 'Ativo' : 'Desativado',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `m365-usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const UsersTab = ({ data, isLoading, onSelectUser, selectedUser }) => {
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');

  if (isLoading) return <LoadingSpinner />;

  const now = Date.now();
  const daysMs = (d) => d * 86_400_000;

  const users = (data?.users || []).filter((u) => {
    const matchSearch = !search || (
      u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      u.userPrincipalName?.toLowerCase().includes(search.toLowerCase())
    );
    let matchFilter = true;
    if (filterActive === 'active')      matchFilter = !!u.accountEnabled;
    else if (filterActive === 'inactive') matchFilter = !u.accountEnabled;
    else if (filterActive === 'inactive-30')
      matchFilter = !u.lastSignIn || (now - new Date(u.lastSignIn).getTime()) > daysMs(30);
    else if (filterActive === 'inactive-60')
      matchFilter = !u.lastSignIn || (now - new Date(u.lastSignIn).getTime()) > daysMs(60);
    else if (filterActive === 'inactive-90')
      matchFilter = !u.lastSignIn || (now - new Date(u.lastSignIn).getTime()) > daysMs(90);
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-4">
      <CreateUserPanel />

      <div className="flex gap-3 flex-wrap items-center">
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
          <optgroup label="Sem acesso há…">
            <option value="inactive-30">+30 dias sem acesso</option>
            <option value="inactive-60">+60 dias sem acesso</option>
            <option value="inactive-90">+90 dias sem acesso</option>
          </optgroup>
        </select>
        <button
          onClick={() => exportCsv(users)}
          disabled={users.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-2 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40"
          title="Exportar lista atual como CSV"
        >
          <Download size={14} /> Exportar CSV
        </button>
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
            {users.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              return (
                <tr
                  key={u.id}
                  onClick={() => onSelectUser(isSelected ? null : u)}
                  className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-800/40'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(u.displayName)}`}>
                        {initials(u.displayName)}
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{u.displayName || '—'}</span>
                    </div>
                  </td>
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
              );
            })}
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
              {team.isTeam && (
                <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  Teams
                </span>
              )}
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
      <CreateGroupPanel />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar grupo ou equipe..."
          className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {teams.length === 0 && (
        <div className="card rounded-2xl py-16 text-center">
          <MessageSquare size={32} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-sm text-gray-400 dark:text-slate-500">
            {search ? 'Nenhum grupo encontrado para a busca' : 'Nenhum grupo encontrado'}
          </p>
          {!search && (
            <p className="text-xs text-gray-400 dark:text-slate-600 mt-1">
              Verifique se a permissão Directory.Read.All foi concedida no Azure AD
            </p>
          )}
        </div>
      )}

      {teams.map((team) => (
        <TeamCard key={team.id} team={team} />
      ))}

      {teams.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-slate-500">
          {teams.length} grupo(s) · {teams.filter(t => t.isTeam).length} com Microsoft Teams
        </p>
      )}
    </div>
  );
};

// ── Tab: Segurança ────────────────────────────────────────────────────────────

const RISK_LEVEL_LABEL = { high: 'Alto', medium: 'Médio', low: 'Baixo' };
const RISK_STATE_LABEL  = {
  atRisk:               'Em risco',
  confirmedCompromised: 'Comprometido',
  remediated:           'Remediado',
  dismissed:            'Dispensado',
};

const SERVICE_STATUS_META = {
  operational: { label: 'Operacional',   cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',  dot: 'bg-green-500'  },
  warning:     { label: 'Atenção',        cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-400' },
  degraded:    { label: 'Degradado',      cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  outage:      { label: 'Interrupção',    cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',           dot: 'bg-red-500'    },
};

const SecurityTab = ({ data, isLoading, onSelectUser, selectedUser, serviceHealthData, serviceHealthLoading }) => {
  if (isLoading) return <LoadingSpinner />;
  if (!data) return null;

  const mfaPct     = data.mfa_coverage_pct ?? 0;
  const mfaError   = data.mfa_error;    // "permission_denied" | "error" | null
  const riskyError = data.risky_error;  // "permission_denied" | "not_available" | "error" | null
  const noMfaData  = data.total_users_checked === 0;
  const isClean    = !noMfaData && !mfaError && !riskyError
    && data.risky_users_count === 0 && (data.users_without_mfa?.length ?? 0) === 0;

  return (
    <div className="space-y-5">

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card rounded-2xl p-4 text-center">
          <p className={`text-2xl font-bold ${mfaError ? 'text-gray-400 dark:text-slate-600' : 'text-red-400'}`}>
            {mfaError ? '—' : (data.users_without_mfa?.length ?? 0)}
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Sem MFA</p>
        </div>
        <div className="card rounded-2xl p-4 text-center">
          <p className={`text-2xl font-bold ${riskyError ? 'text-gray-400 dark:text-slate-600' : 'text-orange-400'}`}>
            {riskyError ? '—' : (data.risky_users_count ?? 0)}
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Usuários de risco</p>
        </div>
        <div className="card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-500 dark:text-slate-400">{data.total_users_checked}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Total verificados</p>
        </div>
      </div>

      {/* MFA permission/error banner */}
      {mfaError && (
        <div className="card rounded-2xl p-4 border border-yellow-400/30 bg-yellow-50/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                {mfaError === 'permission_denied' ? 'Permissão insuficiente — Reports.Read.All' : 'Falha ao carregar dados de MFA'}
              </p>
              {mfaError === 'permission_denied' && (
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  No Azure Portal → App Registration → <strong>API permissions</strong> → adicione{' '}
                  <code className="font-mono bg-gray-100 dark:bg-slate-800 px-1 rounded">Reports.Read.All</code>{' '}
                  (Application) e clique em <strong>"Grant admin consent"</strong>.
                  Após o consent, reinicie o backend para forçar um novo token MSAL.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Identity Protection permission/license banner */}
      {riskyError && (
        <div className="card rounded-2xl p-4 border border-gray-300/30 dark:border-slate-700">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-gray-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                {riskyError === 'not_available' ? 'Identity Protection indisponível neste tenant' : 'Usuários de risco — sem acesso'}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                Este recurso requer <strong>Azure AD Premium P2</strong> e a permissão{' '}
                <code className="font-mono bg-gray-100 dark:bg-slate-800 px-1 rounded">IdentityRiskyUser.Read.All</code>{' '}
                com admin consent. Sem licença P2, a API retorna 403 independente das permissões.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MFA coverage bar */}
      {!noMfaData && !mfaError && (
        <div className="card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Cobertura MFA</p>
            <span className={`text-2xl font-bold ${mfaPct >= 0.9 ? 'text-green-400' : mfaPct >= 0.7 ? 'text-yellow-400' : 'text-red-400'}`}>
              {Math.round(mfaPct * 100)}%
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-slate-700">
            <div className={`h-3 rounded-full transition-all ${mfaColor(mfaPct)}`} style={{ width: `${Math.min(mfaPct * 100, 100)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-400 dark:text-slate-500">
            <span>{data.mfa_enabled} com MFA ativado</span>
            <span>{data.total_users_checked} verificados</span>
          </div>
        </div>
      )}

      {/* Users without MFA */}
      {(data.users_without_mfa?.length ?? 0) > 0 && (
        <div className="card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-yellow-500" />
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              Usuários sem MFA ({data.users_without_mfa.length})
            </p>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {data.users_without_mfa.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              return (
                <button
                  key={u.id || u.userPrincipalName}
                  onClick={() => onSelectUser?.(isSelected ? null : { ...u, mfaRegistered: false, accountEnabled: true })}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-400/30'
                      : 'bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent'
                  }`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(u.displayName || u.userPrincipalName)}`}>
                    {initials(u.displayName || u.userPrincipalName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                      {u.displayName || u.userPrincipalName}
                    </p>
                    {u.displayName && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 font-mono truncate">{u.userPrincipalName}</p>
                    )}
                  </div>
                  <XCircle size={14} className="flex-shrink-0 text-red-400" />
                </button>
              );
            })}
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
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {data.risky_users.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              const riskCls =
                u.riskLevel === 'high'   ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700'   :
                u.riskLevel === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700' :
                                           'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-600';
              return (
                <button
                  key={u.id}
                  onClick={() => onSelectUser?.(isSelected ? null : { id: u.id, userPrincipalName: u.userPrincipalName, displayName: u.userPrincipalName, accountEnabled: true })}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left border transition-colors ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400/30' : `${riskCls}`
                  }`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(u.userPrincipalName)}`}>
                    {initials(u.userPrincipalName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate font-mono">{u.userPrincipalName}</p>
                    {u.riskState && (
                      <p className="text-xs text-gray-500 dark:text-slate-400">{RISK_STATE_LABEL[u.riskState] || u.riskState}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold border ${riskCls}`}>
                      {RISK_LEVEL_LABEL[u.riskLevel] || u.riskLevel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Clean state — only when we have real data */}
      {isClean && (
        <div className="card rounded-2xl p-8 text-center">
          <CheckCircle size={36} className="text-green-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Nenhum problema de segurança detectado</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
            Todos os {data.total_users_checked} usuários verificados têm MFA ativado e nenhum risco foi identificado.
          </p>
        </div>
      )}

      {/* ── Service Health ── */}
      <div className="card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-blue-400" />
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Saúde dos Serviços M365</p>
        </div>

        {serviceHealthLoading && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        )}

        {!serviceHealthLoading && !serviceHealthData && (
          <div className="rounded-xl border border-yellow-300/40 dark:border-yellow-700/30 bg-yellow-50 dark:bg-yellow-900/10 px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Adicione a permissão{' '}
              <code className="font-mono bg-gray-100 dark:bg-slate-800 px-1 rounded">ServiceHealth.Read.All</code>{' '}
              (Application) com admin consent no App Registration para ver o status dos serviços.
            </p>
          </div>
        )}

        {!serviceHealthLoading && serviceHealthData && (() => {
          const services = serviceHealthData.services || [];
          const hasIssues = services.some((s) => s.status !== 'operational');
          return services.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-slate-500">Nenhum serviço encontrado</p>
          ) : (
            <>
              {!hasIssues && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-300/40 dark:border-green-700/30 px-3 py-2">
                  <CheckCircle size={13} className="text-green-500" />
                  <span className="text-xs text-green-700 dark:text-green-400 font-medium">Todos os serviços operacionais</span>
                </div>
              )}
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {services.map((svc) => {
                  const meta = SERVICE_STATUS_META[svc.status] || SERVICE_STATUS_META.operational;
                  return (
                    <div
                      key={svc.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-3 py-2.5"
                    >
                      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${meta.dot}`} />
                      <p className="flex-1 text-sm text-gray-800 dark:text-slate-200 truncate">
                        {svc.displayName || svc.id || '—'}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
                        {svc.statusLabel || meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">{services.length} serviço(s) monitorado(s)</p>
            </>
          );
        })()}
      </div>
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
  const [selectedUser, setSelectedUser] = useState(null);

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

  const serviceHealthQ = useQuery({
    queryKey: ['m365-service-health'],
    queryFn: m365Service.getServiceHealth,
    enabled: connected && isEnterprise && activeTab === 'seguranca',
    staleTime: 5 * 60_000, // 5 min — service health doesn't change often
    retry: false,
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
              <div className="flex items-center gap-2">
                {(() => {
                  const activeQ = { 'visao-geral': overviewQ, usuarios: usersQ, licencas: licensesQ, equipes: teamsQ, seguranca: securityQ }[activeTab];
                  const isFetching = activeQ?.isFetching || (activeTab === 'seguranca' && serviceHealthQ.isFetching);
                  return (
                    <button
                      onClick={() => {
                        qc.invalidateQueries({ queryKey: ['m365-overview'] });
                        qc.invalidateQueries({ queryKey: ['m365-users'] });
                        qc.invalidateQueries({ queryKey: ['m365-licenses'] });
                        qc.invalidateQueries({ queryKey: ['m365-teams'] });
                        qc.invalidateQueries({ queryKey: ['m365-security'] });
                        qc.invalidateQueries({ queryKey: ['m365-service-health'] });
                      }}
                      disabled={isFetching}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50"
                      title="Recarregar dados do tenant"
                    >
                      <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Recarregar
                    </button>
                  );
                })()}
                <button
                  onClick={() => setShowCredModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  <Pencil size={13} /> Reconfigurar
                </button>
              </div>
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
                <OverviewTab
                  overview={overviewQ.data}
                  isLoading={overviewQ.isLoading}
                  isError={overviewQ.isError}
                  error={overviewQ.error}
                  onRefresh={() => qc.invalidateQueries({ queryKey: ['m365-overview'] })}
                />
              )}
              {activeTab === 'usuarios' && (
                usersQ.isError
                  ? <ApiErrorCard error={usersQ.error} onRefresh={() => qc.invalidateQueries({ queryKey: ['m365-users'] })} />
                  : <UsersTab data={usersQ.data} isLoading={usersQ.isLoading} onSelectUser={setSelectedUser} selectedUser={selectedUser} />
              )}
              {activeTab === 'licencas' && (
                licensesQ.isError
                  ? <ApiErrorCard error={licensesQ.error} onRefresh={() => qc.invalidateQueries({ queryKey: ['m365-licenses'] })} />
                  : <LicensesTab data={licensesQ.data} isLoading={licensesQ.isLoading} />
              )}
              {activeTab === 'equipes' && (
                teamsQ.isError
                  ? <ApiErrorCard error={teamsQ.error} onRefresh={() => qc.invalidateQueries({ queryKey: ['m365-teams'] })} />
                  : <TeamsTab data={teamsQ.data} isLoading={teamsQ.isLoading} />
              )}
              {activeTab === 'seguranca' && (
                <SecurityTab
                  data={securityQ.data}
                  isLoading={securityQ.isLoading}
                  onSelectUser={setSelectedUser}
                  selectedUser={selectedUser}
                  serviceHealthData={serviceHealthQ.data}
                  serviceHealthLoading={serviceHealthQ.isLoading}
                />
              )}
            </>
          )}
        </div>
      </PlanGate>

      <UserDetailDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />

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
