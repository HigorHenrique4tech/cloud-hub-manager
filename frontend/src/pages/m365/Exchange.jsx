import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, BarChart2, X, Check, RefreshCw, Save, Inbox, Plus, Trash2, UserPlus, Shield } from 'lucide-react';
import Layout from '../../components/layout/layout';
import m365Service from '../../services/m365Service';
import { useToast } from '../../contexts/ToastContext';

// ─ Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
const thCls = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider';
const tdCls = 'px-4 py-3 text-sm text-gray-700 dark:text-gray-300';

const TABS = [
  { id: 'mailboxes', label: 'Caixas de Correio',    icon: Mail },
  { id: 'activity',  label: 'Atividade de E-mail',  icon: BarChart2 },
  { id: 'shared',    label: 'Caixas Compartilhadas', icon: Inbox },
];

const TIMEZONES = [
  'UTC', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney',
];

// ─ Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRow({ cols = 3 }) {
  return (
    <tr>{Array.from({ length: cols }).map((_, i) => (
      <td key={i} className={tdCls}><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
    ))}</tr>
  );
}

// ─ Mailbox Settings Drawer ──────────────────────────────────────────────────
const DELEGATE_LABELS = {
  full_access:    { label: 'Ler e Gerenciar (Full Access)', color: 'purple' },
  send_as:        { label: 'Enviar Como (Send As)',          color: 'blue'   },
  send_on_behalf: { label: 'Enviar em Nome de',              color: 'green'  },
};

function DelegationSection({ mailbox }) {
  const qc = useQueryClient();
  const [addType, setAddType] = useState('full_access');
  const [addUpn, setAddUpn] = useState('');

  const delegatesQ = useQuery({
    queryKey: ['m365-mbx-delegates', mailbox?.id],
    queryFn: () => m365Service.getMailboxDelegates(mailbox.id),
    enabled: !!mailbox,
    retry: false,
  });

  // Load users directly — don't rely on parent prop which may not be loaded yet
  const usersQ = useQuery({
    queryKey: ['m365-users'],
    queryFn: () => m365Service.getUsers(),
    staleTime: 300_000,
    enabled: !!mailbox,
  });

  const addMut = useMutation({
    mutationFn: () => m365Service.addMailboxDelegate(mailbox.id, { delegate_upn: addUpn, permission_type: addType }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m365-mbx-delegates', mailbox.id] }); setAddUpn(''); },
  });

  const removeMut = useMutation({
    mutationFn: ({ permType, upn }) => m365Service.removeMailboxDelegate(mailbox.id, permType, upn),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m365-mbx-delegates', mailbox.id] }),
  });

  const delegates = delegatesQ.data || {};
  const exoError = delegates.full_access_error || delegates.send_as_error;

  const allUsers = usersQ.data?.users || [];
  const mailboxIdentifier = (mailbox?.upn || mailbox?.mail || '').toLowerCase();
  const userOptions = allUsers.filter(u => {
    const uUpn = (u.userPrincipalName || u.upn || '').toLowerCase();
    return uUpn && uUpn !== mailboxIdentifier;
  });

  if (delegatesQ.isLoading) return <div className="space-y-2">{[1,2].map(i=><div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"/>)}</div>;

  if (exoError && !delegates.full_access?.length && !delegates.send_as?.length) {
    return (
      <div className="px-3 py-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
        <p className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">Permissão Exchange.ManageAsApp necessária</p>
        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Adicione <strong>Exchange.ManageAsApp</strong> ao registro de app no Azure AD e atribua a função RBAC <strong>Recipient Management</strong> ao service principal.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(['full_access', 'send_as', 'send_on_behalf']).map(type => {
        const { label, color } = DELEGATE_LABELS[type];
        const list = delegates[type] || [];
        const colorMap = { purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
        return (
          <div key={type}>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{label}</p>
            {list.length === 0
              ? <p className="text-xs text-gray-400 italic mb-1">Nenhum delegado</p>
              : list.map((d, i) => (
                <div key={i} className="flex items-center justify-between mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorMap[color]}`}>{d.user}</span>
                  <button
                    onClick={() => removeMut.mutate({ permType: type, upn: d.user })}
                    disabled={removeMut.isPending}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600"
                  ><Trash2 className="w-3 h-3" /></button>
                </div>
              ))
            }
          </div>
        );
      })}

      {/* Add delegate form */}
      <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Adicionar delegado</p>
        <select className={inputCls} value={addType} onChange={e => setAddType(e.target.value)}>
          {Object.entries(DELEGATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={inputCls} value={addUpn} onChange={e => setAddUpn(e.target.value)}>
          <option value="">Selecionar usuário…</option>
          {usersQ.isLoading
            ? <option disabled>Carregando usuários…</option>
            : userOptions.map(u => <option key={u.id} value={u.userPrincipalName || u.upn}>{u.displayName || u.display_name} — {u.mail || u.userPrincipalName}</option>)
          }
        </select>
        {addMut.isError && <p className="text-xs text-red-500">{addMut.error?.response?.data?.detail || 'Erro ao adicionar.'}</p>}
        <button
          onClick={() => addMut.mutate()}
          disabled={!addUpn || addMut.isPending}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-50"
        >
          {addMut.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
          Adicionar
        </button>
      </div>
    </div>
  );
}

function MailboxDrawer({ mailbox, onClose, allUsers }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [drawerTab, setDrawerTab] = useState('settings');

  const settingsQ = useQuery({
    queryKey: ['m365-mbx-settings', mailbox?.id],
    queryFn: () => m365Service.getMailboxSettings(mailbox.id),
    enabled: !!mailbox,
    retry: false,
  });

  const settings = settingsQ.data || {};
  const isEnabled = settings.auto_reply_status ? settings.auto_reply_status !== 'disabled' : false;

  const [autoReplyEnabled, setAutoReplyEnabled] = useState(null);
  const [autoReplyMessage, setAutoReplyMessage] = useState('');
  const [timezone, setTimezone] = useState('');
  const [saved, setSaved] = useState(false);

  const loaded = settingsQ.isSuccess && !settingsQ.isFetching;
  if (loaded && autoReplyEnabled === null) {
    setAutoReplyEnabled(isEnabled);
    setAutoReplyMessage(settings.auto_reply_internal_message || '');
    setTimezone(settings.timezone || 'UTC');
  }

  const saveMut = useMutation({
    mutationFn: () => m365Service.updateMailboxSettings(mailbox.id, {
      auto_reply_enabled: autoReplyEnabled,
      auto_reply_message: autoReplyMessage,
      timezone,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-mailboxes'] });
      toast.success('Configurações da caixa de correio salvas.');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.response?.data?.detail || err.message}`),
  });

  if (!mailbox) return null;
  const displayEnabled = autoReplyEnabled !== null ? autoReplyEnabled : isEnabled;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-500" />
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{mailbox.display_name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{mailbox.mail}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[{ id: 'settings', label: 'Configurações', icon: Save }, { id: 'delegation', label: 'Delegação', icon: Shield }].map(t => (
            <button key={t.id} onClick={() => setDrawerTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${drawerTab === t.id ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {drawerTab === 'settings' ? (
            settingsQ.isLoading ? (
              <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"/>)}</div>
            ) : settingsQ.isError ? (
              <p className="text-sm text-red-500">Erro ao carregar. Verifique a permissão <code>MailboxSettings.Read</code>.</p>
            ) : (
              <>
                <div>
                  <label className={labelCls}>Resposta Automática</label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setAutoReplyEnabled(v => !(v !== null ? v : isEnabled))}
                      className={`relative w-10 h-5 rounded-full transition-colors ${displayEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${displayEnabled ? 'translate-x-5' : ''}`} />
                    </button>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{displayEnabled ? 'Ativada' : 'Desativada'}</span>
                  </div>
                </div>
                {displayEnabled && (
                  <div>
                    <label className={labelCls}>Mensagem de Resposta Automática</label>
                    <textarea rows={4} className={inputCls} placeholder="Digite a mensagem de resposta automática..."
                      value={autoReplyMessage} onChange={e => setAutoReplyMessage(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Fuso Horário</label>
                  <select className={inputCls} value={timezone} onChange={e => setTimezone(e.target.value)}>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                {settings.language && (
                  <div>
                    <label className={labelCls}>Idioma</label>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{settings.language}</p>
                  </div>
                )}
              </>
            )
          ) : (
            <DelegationSection mailbox={mailbox} />
          )}
        </div>

        {/* Footer — only shown on settings tab */}
        {drawerTab === 'settings' && (
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700">
            {saveMut.isError && <p className="text-xs text-red-500 mb-2">{saveMut.error?.response?.data?.detail || 'Erro ao salvar.'}</p>}
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || settingsQ.isLoading || settingsQ.isError}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {saveMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4" /> Salvo!</> : <><Save className="w-4 h-4" /> Salvar</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─ Mailboxes Tab ─────────────────────────────────────────────────────────────
function MailboxesTab({ onSelectMailbox }) {
  const mbxQ = useQuery({
    queryKey: ['m365-mailboxes'],
    queryFn: m365Service.getMailboxes,
    staleTime: 120_000,
    retry: false,
  });

  const mailboxes = mbxQ.data?.mailboxes || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{mbxQ.isLoading ? '…' : `${mailboxes.length} caixas`}</p>
        <button onClick={() => mbxQ.refetch()} disabled={mbxQ.isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${mbxQ.isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>
    <div className="card rounded-xl overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className={thCls}>Usuário</th>
            <th className={thCls}>E-mail</th>
            <th className={thCls}>Conta</th>
            <th className={thCls} />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {mbxQ.isLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
            : mailboxes.length === 0
            ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                Nenhuma caixa de correio encontrada.
              </td></tr>
            : mailboxes.map(m => (
              <tr
                key={m.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                onClick={() => onSelectMailbox(m)}
              >
                <td className={tdCls}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">
                      {(m.display_name || '?')[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{m.display_name}</span>
                  </div>
                </td>
                <td className={tdCls}>{m.mail || '—'}</td>
                <td className={tdCls}>
                  {m.account_enabled === false
                    ? <span className="text-xs text-red-500 font-medium">Desabilitada</span>
                    : <span className="text-xs text-green-500 font-medium">Ativa</span>
                  }
                </td>
                <td className={tdCls}><span className="text-xs text-blue-500 hover:underline">Configurar</span></td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
    </div>
  );
}

// ─ Activity Tab ──────────────────────────────────────────────────────────────
function ActivityTab() {
  const actQ = useQuery({
    queryKey: ['m365-email-activity'],
    queryFn: m365Service.getEmailActivity,
    staleTime: 300_000,
    retry: false,
  });

  const rows = actQ.data?.activity || [];

  // backend field names: send_count, receive_count, read_count
  const totals = rows.reduce((acc, r) => ({
    sent: acc.sent + (r.send_count || 0),
    received: acc.received + (r.receive_count || 0),
    read: acc.read + (r.read_count || 0),
  }), { sent: 0, received: 0, read: 0 });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'E-mails Enviados (D30)', value: totals.sent.toLocaleString(), color: 'text-blue-500' },
          { label: 'E-mails Recebidos (D30)', value: totals.received.toLocaleString(), color: 'text-green-500' },
          { label: 'E-mails Lidos (D30)', value: totals.read.toLocaleString(), color: 'text-purple-500' },
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
              <th className={thCls}>Enviados</th>
              <th className={thCls}>Recebidos</th>
              <th className={thCls}>Lidos</th>
              <th className={thCls}>Última Atividade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {actQ.isLoading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              : rows.length === 0
              ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Sem dados de atividade. Verifique a permissão <code>Reports.Read.All</code>.
                </td></tr>
              : rows.map((r, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className={tdCls}>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.display_name || '—'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.upn || ''}</p>
                    </div>
                  </td>
                  <td className={tdCls}>{(r.send_count || 0).toLocaleString()}</td>
                  <td className={tdCls}>{(r.receive_count || 0).toLocaleString()}</td>
                  <td className={tdCls}>{(r.read_count || 0).toLocaleString()}</td>
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

// ─ Shared Mailboxes Tab ───────────────────────────────────────────────────────
// ─ Create Shared Mailbox Modal ────────────────────────────────────────────────
function CreateSharedMailboxModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ display_name: '', alias: '', domain: '', description: '' });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const [done, setDone] = useState(false);

  const domainsQ = useQuery({ queryKey: ['m365-domains'], queryFn: m365Service.getDomains, staleTime: 300_000 });
  const domains = domainsQ.data?.domains || [];

  // Auto-set default domain once loaded
  const defaultDomain = domains.find(d => d.is_default);
  if (defaultDomain && !form.domain) set('domain', defaultDomain.id);

  const autoAlias = (name) => name.toLowerCase().split('@')[0].replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');

  const createMut = useMutation({
    mutationFn: () => m365Service.createSharedMailbox(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m365-shared-mailboxes'] }); setDone(true); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-indigo-500" />
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Nova Caixa Compartilhada</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Check className="w-10 h-10 text-green-500" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Caixa criada! Pode levar alguns minutos para aparecer.</p>
              <button onClick={onClose} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg">Fechar</button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                <span className="text-yellow-500 mt-0.5 text-xs">⚠</span>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">Requer permissão <strong>Exchange.ManageAsApp</strong> e papel RBAC <strong>Recipient Management</strong> no Azure AD.</p>
              </div>
              <div>
                <label className={labelCls}>Nome de exibição *</label>
                <input type="text" value={form.display_name}
                  onChange={e => { set('display_name', e.target.value); if (!form.alias) set('alias', autoAlias(e.target.value)); }}
                  placeholder="Suporte TI" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Endereço de e-mail *</label>
                <div className="flex gap-1">
                  <input type="text" value={form.alias} onChange={e => set('alias', e.target.value.split('@')[0].replace(/[^a-z0-9._-]/gi, ''))}
                    placeholder="suporte.ti" className={`${inputCls} flex-1`} />
                  <span className="flex items-center px-2 text-sm text-gray-500">@</span>
                  <select className={`${inputCls} flex-1`} value={form.domain} onChange={e => set('domain', e.target.value)}>
                    <option value="">Selecionar domínio…</option>
                    {domains.map(d => <option key={d.id} value={d.id}>{d.id}{d.is_default ? ' (padrão)' : ''}</option>)}
                  </select>
                </div>
                {form.alias && form.domain && <p className="mt-1 text-xs text-gray-400">{form.alias}@{form.domain}</p>}
              </div>
              <div>
                <label className={labelCls}>Descrição</label>
                <input type="text" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Opcional" className={inputCls} />
              </div>
              {createMut.isError && (() => {
                const detail = createMut.error?.response?.data?.detail || '';
                if (detail.includes('EXO_PERMISSION_REQUIRED')) return (
                  <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-3 space-y-1">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">Falta permissão Exchange.ManageAsApp:</p>
                    <ol className="text-xs text-red-600 dark:text-red-400 space-y-1 list-decimal list-inside">
                      <li>Azure AD → <strong>Registros de aplicativo</strong> → seu app → Permissões de API</li>
                      <li>Adicionar → "APIs da minha organização" → <strong>Office 365 Exchange Online</strong></li>
                      <li>Permissões de aplicativo → <strong>Exchange.ManageAsApp</strong> → Conceder consentimento</li>
                    </ol>
                  </div>
                );
                if (detail.includes('EXO_RBAC_REQUIRED')) return (
                  <div className="rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 p-3 space-y-1">
                    <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">Falta papel Exchange Administrator — siga os passos:</p>
                    <ol className="text-xs text-orange-600 dark:text-orange-400 space-y-1 list-decimal list-inside">
                      <li>Azure Portal → Azure AD → <strong>Funções e administradores</strong></li>
                      <li>Buscar e clicar em <strong>"Administrador do Exchange"</strong></li>
                      <li><strong>Adicionar atribuições</strong> → buscar o nome do seu aplicativo → Adicionar</li>
                    </ol>
                    <p className="text-xs text-orange-500 mt-1">Aguarde até 5 minutos após salvar e tente novamente.</p>
                  </div>
                );
                return <p className="text-xs text-red-500">{detail || 'Erro ao criar caixa.'}</p>;
              })()}
              <button onClick={() => createMut.mutate()} disabled={!form.display_name || !form.alias || !form.domain || createMut.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {createMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Criar Caixa
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SharedMailboxesTab({ onSelectMailbox, allUsers }) {
  const [showCreate, setShowCreate] = useState(false);
  const mbxQ = useQuery({
    queryKey: ['m365-shared-mailboxes'],
    queryFn: m365Service.getSharedMailboxes,
    staleTime: 120_000,
    retry: false,
  });

  const mailboxes = mbxQ.data?.mailboxes || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{mbxQ.isLoading ? '…' : `${mailboxes.length} caixas`}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => mbxQ.refetch()} disabled={mbxQ.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${mbxQ.isFetching ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Criar Caixa
          </button>
        </div>
      </div>
      <div className="card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className={thCls}>Nome</th>
              <th className={thCls}>E-mail</th>
              <th className={thCls}>Status</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {mbxQ.isLoading
              ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
              : mailboxes.length === 0
              ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  {mbxQ.isError ? 'Erro ao carregar. Verifique a permissão MailboxSettings.Read.' : 'Nenhuma caixa compartilhada encontrada.'}
                </td></tr>
              : mailboxes.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => onSelectMailbox(m)}>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                        {(m.display_name || '?')[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{m.display_name}</span>
                    </div>
                  </td>
                  <td className={tdCls}>{m.mail || '—'}</td>
                  <td className={tdCls}>
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Compartilhada</span>
                  </td>
                  <td className={tdCls}><span className="text-xs text-blue-500 hover:underline">Configurar</span></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
      {showCreate && <CreateSharedMailboxModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ─ Main Page ─────────────────────────────────────────────────────────────────
export default function Exchange() {
  const [activeTab, setActiveTab] = useState('mailboxes');
  const [selectedMailbox, setSelectedMailbox] = useState(null);

  // Users list for distribution list members + mailbox delegation
  const usersQ = useQuery({
    queryKey: ['m365-exchange-users'],
    queryFn: () => m365Service.getUsers(),
    staleTime: 300_000,
    enabled: activeTab === 'shared',
    retry: false,
  });
  const allUsers = usersQ.data?.users || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Mail className="w-6 h-6 text-blue-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Exchange</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie caixas de correio e monitore atividade de e-mail</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
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
        {activeTab === 'mailboxes'     && <MailboxesTab onSelectMailbox={setSelectedMailbox} />}
        {activeTab === 'activity'      && <ActivityTab />}
        {activeTab === 'shared'        && <SharedMailboxesTab onSelectMailbox={setSelectedMailbox} allUsers={allUsers} />}
      </div>

      {/* Mailbox Settings Drawer */}
      {selectedMailbox && (
        <MailboxDrawer mailbox={selectedMailbox} onClose={() => setSelectedMailbox(null)} allUsers={allUsers} />
      )}
    </Layout>
  );
}
