import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, BarChart2, X, Check, RefreshCw, Save } from 'lucide-react';
import Layout from '../../components/layout/layout';
import m365Service from '../../services/m365Service';

// ─ Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
const thCls = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider';
const tdCls = 'px-4 py-3 text-sm text-gray-700 dark:text-gray-300';

const TABS = [
  { id: 'mailboxes', label: 'Caixas de Correio', icon: Mail },
  { id: 'activity',  label: 'Atividade de E-mail', icon: BarChart2 },
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
function MailboxDrawer({ mailbox, onClose }) {
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: ['m365-mbx-settings', mailbox?.id],
    queryFn: () => m365Service.getMailboxSettings(mailbox.id),
    enabled: !!mailbox,
    retry: false,
  });

  const settings = settingsQ.data || {};

  // Derive boolean from auto_reply_status string ("enabled" | "disabled" | "scheduledSend")
  const isEnabled = settings.auto_reply_status
    ? settings.auto_reply_status !== 'disabled'
    : false;

  const [autoReplyEnabled, setAutoReplyEnabled] = useState(null); // null = not loaded yet
  const [autoReplyMessage, setAutoReplyMessage] = useState('');
  const [timezone, setTimezone] = useState('');
  const [saved, setSaved] = useState(false);

  // Sync once settings load (only on first load)
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {settingsQ.isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}</div>
          ) : settingsQ.isError ? (
            <p className="text-sm text-red-500">Erro ao carregar configurações. Verifique a permissão <code>MailboxSettings.Read</code>.</p>
          ) : (
            <>
              {/* Auto-reply toggle */}
              <div>
                <label className={labelCls}>Resposta Automática</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAutoReplyEnabled(v => !(v !== null ? v : isEnabled))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${displayEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${displayEnabled ? 'translate-x-5' : ''}`} />
                  </button>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{displayEnabled ? 'Ativada' : 'Desativada'}</span>
                </div>
              </div>

              {/* Auto-reply message */}
              {displayEnabled && (
                <div>
                  <label className={labelCls}>Mensagem de Resposta Automática</label>
                  <textarea
                    rows={4}
                    className={inputCls}
                    placeholder="Digite a mensagem de resposta automática..."
                    value={autoReplyMessage}
                    onChange={e => setAutoReplyMessage(e.target.value)}
                  />
                </div>
              )}

              {/* Timezone */}
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
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          {saveMut.isError && (
            <p className="text-xs text-red-500 mb-2">{saveMut.error?.response?.data?.detail || 'Erro ao salvar.'}</p>
          )}
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || settingsQ.isLoading || settingsQ.isError}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {saveMut.isPending
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : saved
              ? <><Check className="w-4 h-4" /> Salvo!</>
              : <><Save className="w-4 h-4" /> Salvar</>
            }
          </button>
        </div>
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

// ─ Main Page ─────────────────────────────────────────────────────────────────
export default function Exchange() {
  const [activeTab, setActiveTab] = useState('mailboxes');
  const [selectedMailbox, setSelectedMailbox] = useState(null);

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
        {activeTab === 'mailboxes' && <MailboxesTab onSelectMailbox={setSelectedMailbox} />}
        {activeTab === 'activity'  && <ActivityTab />}
      </div>

      {/* Mailbox Settings Drawer */}
      {selectedMailbox && (
        <MailboxDrawer mailbox={selectedMailbox} onClose={() => setSelectedMailbox(null)} />
      )}
    </Layout>
  );
}
