import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Plus, Trash2, Play, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, MessageSquare, Send,
} from 'lucide-react';
import notificationChannelService from '../services/notificationChannelService';
import Layout from '../components/layout/layout';
import { RoleGate } from '../components/common/PermissionGate';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_TYPES = [
  { value: 'teams',    label: 'Microsoft Teams',  icon: MessageSquare, color: 'text-blue-500' },
  { value: 'telegram', label: 'Telegram',          icon: Send,          color: 'text-sky-500' },
];

const EVENT_LABELS = {
  'alert.triggered':          'Alerta disparado',
  'resource.started':         'Recurso iniciado',
  'resource.stopped':         'Recurso parado',
  'resource.failed':          'Recurso com falha',
  'finops.scan.completed':    'Scan FinOps concluído',
  'billing.paid':             'Fatura paga',
  'org.member.added':         'Membro adicionado',
  'schedule.executed':        'Agenda executada',
  'schedule.failed':          'Agenda falhou',
  'budget.threshold_crossed': 'Limite de orçamento atingido',
  'test.ping':                'Teste de conexão',
};

const EMPTY_FORM = {
  name: '',
  channel_type: 'teams',
  events: [],
  // teams
  url: '',
  // telegram
  bot_token: '',
  chat_id: '',
};

// ── ChannelModal ──────────────────────────────────────────────────────────────

function ChannelModal({ initial = null, supportedEvents = [], onSave, onClose, isPending }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(initial ? {
    name: initial.name,
    channel_type: initial.channel_type,
    events: [...(initial.events || [])],
    url: initial.config?.url || '',
    bot_token: '',   // never pre-fill masked token
    chat_id: initial.config?.chat_id || '',
  } : { ...EMPTY_FORM });
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleEvent = (e) => set('events', form.events.includes(e)
    ? form.events.filter((x) => x !== e)
    : [...form.events, e]);

  const handleSubmit = (ev) => {
    ev.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Nome é obrigatório');
    if (form.events.length === 0) return setError('Selecione ao menos um evento');

    let config = {};
    if (form.channel_type === 'teams') {
      if (!form.url.trim()) return setError('URL do webhook Teams é obrigatória');
      config = { url: form.url.trim() };
    } else {
      if (!form.bot_token.trim() && !isEdit) return setError('Bot token é obrigatório');
      if (!form.chat_id.trim()) return setError('Chat ID é obrigatório');
      config = {
        ...(form.bot_token.trim() ? { bot_token: form.bot_token.trim() } : {}),
        chat_id: form.chat_id.trim(),
      };
    }

    onSave({ name: form.name.trim(), channel_type: form.channel_type, config, events: form.events });
  };

  const TypeIcon = CHANNEL_TYPES.find((t) => t.value === form.channel_type)?.icon || MessageSquare;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Editar canal' : 'Novo canal de notificação'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Alertas críticos no Teams"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Channel type */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {CHANNEL_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set('channel_type', t.value)}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors ${
                      form.channel_type === t.value
                        ? 'border-primary bg-primary/5 text-primary dark:bg-primary/10'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <t.icon className={`w-4 h-4 ${form.channel_type === t.value ? 'text-primary' : t.color}`} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Config fields */}
          {form.channel_type === 'teams' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL do Incoming Webhook
              </label>
              <input
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
                placeholder="https://outlook.office.com/webhook/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Configure um Incoming Webhook no canal do Teams e cole a URL aqui.
              </p>
            </div>
          )}

          {form.channel_type === 'telegram' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Bot Token {isEdit && <span className="text-xs text-gray-400">(deixe vazio para manter o atual)</span>}
                </label>
                <input
                  value={form.bot_token}
                  onChange={(e) => set('bot_token', e.target.value)}
                  placeholder="123456789:AABBcc..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chat ID</label>
                <input
                  value={form.chat_id}
                  onChange={(e) => set('chat_id', e.target.value)}
                  placeholder="-100123456789"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <p className="font-medium text-gray-500 dark:text-gray-400">Como obter o Chat ID:</p>
                <p>① Crie um bot via <span className="font-mono">@BotFather</span> e copie o token</p>
                <p>② Adicione o bot ao grupo/canal como <strong>administrador</strong></p>
                <p>③ Envie qualquer mensagem no grupo</p>
                <p>④ Acesse <span className="font-mono break-all">api.telegram.org/bot{'<TOKEN>'}/getUpdates</span> e copie o <span className="font-mono">chat.id</span></p>
                <p className="text-amber-500 dark:text-amber-400">⚠ IDs de grupos são <strong>negativos</strong> (ex: <span className="font-mono">-1001234567890</span>)</p>
                <p className="text-amber-500 dark:text-amber-400">⚠ Não use o número do token como Chat ID</p>
              </div>
            </div>
          )}

          {/* Events */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Eventos ({form.events.length} selecionados)
            </label>
            <div className="grid grid-cols-1 gap-1 max-h-44 overflow-y-auto pr-1">
              {supportedEvents.map((ev) => (
                <label key={ev} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="w-3.5 h-3.5 text-primary rounded"
                  />
                  <span className="text-xs text-gray-700 dark:text-gray-300">{EVENT_LABELS[ev] || ev}</span>
                  <span className="ml-auto font-mono text-[10px] text-gray-400">{ev}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar canal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DeliveryHistory ───────────────────────────────────────────────────────────

function DeliveryHistory({ channelId }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['nc-deliveries', channelId, page],
    queryFn: () => notificationChannelService.deliveries(channelId, page),
    staleTime: 30_000,
  });

  if (q.isLoading) return <p className="text-xs text-gray-400 py-2">Carregando...</p>;
  const { deliveries = [], total = 0 } = q.data || {};
  const totalPages = Math.ceil(total / 20);

  if (deliveries.length === 0) return <p className="text-xs text-gray-400 py-2">Nenhuma entrega registrada.</p>;

  return (
    <div className="mt-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {['Evento', 'Status', 'Data'].map((h) => (
              <th key={h} className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700/50">
              <td className="py-1.5 px-2 font-mono text-gray-600 dark:text-gray-400">{d.event_type}</td>
              <td className="py-1.5 px-2">
                {d.status === 'delivered' ? (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3 h-3" /> Entregue
                  </span>
                ) : d.status === 'failed' ? (
                  <span className="flex items-center gap-1 text-red-500">
                    <XCircle className="w-3 h-3" /> Falha
                    {d.error_message && <span className="text-gray-400 ml-1 truncate max-w-[140px]">{d.error_message}</span>}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-yellow-500">
                    <Clock className="w-3 h-3" /> Pendente
                  </span>
                )}
              </td>
              <td className="py-1.5 px-2 text-gray-500 dark:text-gray-400">
                {d.created_at ? new Date(d.created_at).toLocaleString('pt-BR') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2 pt-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-xs text-gray-400">{page} / {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            Próximo
          </button>
        </div>
      )}
    </div>
  );
}

// ── ChannelCard ───────────────────────────────────────────────────────────────

function ChannelCard({ channel, onEdit, onDelete, onTest }) {
  const [showHistory, setShowHistory] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  const typeInfo = CHANNEL_TYPES.find((t) => t.value === channel.channel_type);
  const TypeIcon = typeInfo?.icon || Bell;

  const handleTest = async () => {
    setTestMsg(null);
    try {
      await onTest(channel.id);
      setTestMsg({ ok: true, text: 'Mensagem de teste enviada!' });
    } catch (e) {
      setTestMsg({ ok: false, text: e?.response?.data?.detail || 'Erro ao enviar teste' });
    }
    setTimeout(() => setTestMsg(null), 4000);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            channel.channel_type === 'teams' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-sky-100 dark:bg-sky-900/30'
          }`}>
            <TypeIcon className={`w-4 h-4 ${typeInfo?.color || 'text-gray-500'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{channel.name}</span>
              <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                channel.is_active
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
              }`}>
                {channel.is_active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{typeInfo?.label}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleTest}
            title="Enviar mensagem de teste"
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onEdit(channel)}
            title="Editar"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ✎
          </button>
          <button
            onClick={() => onDelete(channel.id)}
            title="Excluir"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Event badges */}
      <div className="flex flex-wrap gap-1 mt-3">
        {(channel.events || []).map((ev) => (
          <span key={ev} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {EVENT_LABELS[ev] || ev}
          </span>
        ))}
      </div>

      {/* Test feedback */}
      {testMsg && (
        <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg ${
          testMsg.ok
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
        }`}>
          {testMsg.text}
        </div>
      )}

      {/* Delivery history toggle */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="flex items-center gap-1 mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Histórico de entregas
      </button>
      {showHistory && <DeliveryHistory channelId={channel.id} />}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const NotificationChannels = () => {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: notificationChannelService.list,
    staleTime: 60_000,
  });

  const channels = data?.channels || [];
  const supportedEvents = data?.supported_events?.length
    ? data.supported_events
    : Object.keys(EVENT_LABELS);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notification-channels'] });

  const createMutation = useMutation({
    mutationFn: notificationChannelService.create,
    onSuccess: () => { invalidate(); setShowModal(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => notificationChannelService.update(id, body),
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: notificationChannelService.remove,
    onSuccess: invalidate,
  });

  const testFn = (id) => notificationChannelService.test(id);

  const handleSave = (body) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...body });
    } else {
      createMutation.mutate(body);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Excluir este canal de notificação?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <Layout>
      <RoleGate allowed={['owner', 'admin', 'operator', 'viewer', 'billing']}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Canais de Notificação</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Receba alertas no Microsoft Teams ou Telegram
              </p>
            </div>
          </div>
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo canal
          </button>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {CHANNEL_TYPES.map((t) => (
            <div key={t.value} className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <t.icon className={`w-5 h-5 ${t.color}`} />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.label}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t.value === 'teams' ? 'Via Incoming Webhook' : 'Via Bot API'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Channel list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <Bell className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nenhum canal configurado</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Adicione um canal para receber notificações de alertas, orçamentos e agendamentos.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar primeiro canal
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                onEdit={(c) => { setEditing(c); setShowModal(true); }}
                onDelete={handleDelete}
                onTest={testFn}
              />
            ))}
          </div>
        )}

        {/* Footer info */}
        {channels.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">
            {channels.length} canal{channels.length !== 1 ? 'is' : ''} configurado{channels.length !== 1 ? 's' : ''}.
            Eventos são entregues automaticamente quando disparados pelo sistema.
          </p>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ChannelModal
          initial={editing}
          supportedEvents={supportedEvents}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </RoleGate>
    </Layout>
  );
};

export default NotificationChannels;
