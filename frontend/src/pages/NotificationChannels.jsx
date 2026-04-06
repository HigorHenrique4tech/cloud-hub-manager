import { useState, useMemo } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Plus, Trash2, Play, ChevronDown, ChevronUp, Pencil,
  CheckCircle2, XCircle, Clock, MessageSquare, Send, Mail,
  Power, Filter, BarChart3, AlertTriangle,
} from 'lucide-react';
import notificationChannelService from '../services/notificationChannelService';
import Layout from '../components/layout/layout';
import { RoleGate } from '../components/common/PermissionGate';
import { useBranding } from '../contexts/BrandingContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_TYPES = [
  { value: 'teams',    label: 'Microsoft Teams',  icon: MessageSquare, color: 'text-blue-500',  bg: 'bg-blue-50 dark:bg-blue-900/20',  border: 'border-blue-200 dark:border-blue-800/40' },
  { value: 'telegram', label: 'Telegram',          icon: Send,          color: 'text-sky-500',   bg: 'bg-sky-50 dark:bg-sky-900/20',    border: 'border-sky-200 dark:border-sky-800/40' },
  { value: 'email',    label: 'E-mail',             icon: Mail,          color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800/40' },
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

const EVENT_COLORS = {
  'alert.triggered':          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'resource.started':         'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'resource.stopped':         'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  'resource.failed':          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'finops.scan.completed':    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'billing.paid':             'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'org.member.added':         'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'schedule.executed':        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'schedule.failed':          'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'budget.threshold_crossed': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'test.ping':                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const EMPTY_FORM = {
  name: '',
  channel_type: 'teams',
  events: [],
  url: '',
  bot_token: '',
  chat_id: '',
  recipients: '',
};

// ── ChannelModal ──────────────────────────────────────────────────────────────

function ChannelModal({ initial = null, supportedEvents = [], onSave, onClose, isPending }) {
  useEscapeKey(true, onClose);
  const branding = useBranding();
  const isEdit = !!initial;
  const [form, setForm] = useState(initial ? {
    name: initial.name,
    channel_type: initial.channel_type,
    events: [...(initial.events || [])],
    url: initial.config?.url || '',
    bot_token: '',
    chat_id: initial.config?.chat_id || '',
    recipients: initial.config?.recipients || '',
  } : { ...EMPTY_FORM });
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleEvent = (e) => set('events', form.events.includes(e)
    ? form.events.filter((x) => x !== e)
    : [...form.events, e]);

  const allSelected = form.events.length === supportedEvents.length;
  const toggleAll = () => set('events', allSelected ? [] : [...supportedEvents]);

  const handleSubmit = (ev) => {
    ev.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Nome é obrigatório');
    if (form.events.length === 0) return setError('Selecione ao menos um evento');

    let config = {};
    if (form.channel_type === 'teams') {
      if (!form.url.trim()) return setError('URL do webhook Teams é obrigatória');
      config = { url: form.url.trim() };
    } else if (form.channel_type === 'telegram') {
      if (!form.bot_token.trim() && !isEdit) return setError('Bot token é obrigatório');
      if (!form.chat_id.trim()) return setError('Chat ID é obrigatório');
      config = {
        ...(form.bot_token.trim() ? { bot_token: form.bot_token.trim() } : {}),
        chat_id: form.chat_id.trim(),
      };
    } else if (form.channel_type === 'email') {
      if (!form.recipients.trim()) return setError('Pelo menos um e-mail é obrigatório');
      config = { recipients: form.recipients.trim() };
    }

    onSave({ name: form.name.trim(), channel_type: form.channel_type, config, events: form.events });
  };

  const TypeIcon = CHANNEL_TYPES.find((t) => t.value === form.channel_type)?.icon || MessageSquare;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TypeIcon className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Editar canal' : 'Novo canal de notificação'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Alertas críticos no Teams"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Channel type */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo</label>
              <div className="grid grid-cols-3 gap-2">
                {CHANNEL_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set('channel_type', t.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-sm font-medium transition-all ${
                      form.channel_type === t.value
                        ? `${t.border} ${t.bg} ring-1 ring-primary/30`
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <t.icon className={`w-5 h-5 ${form.channel_type === t.value ? t.color : 'text-gray-400'}`} />
                    <span className="text-xs">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Config fields — Teams */}
          {form.channel_type === 'teams' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL do Incoming Webhook</label>
                <input
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="https://outlook.office.com/webhook/..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1 bg-blue-50/50 dark:bg-gray-700/50 rounded-lg p-3 border border-blue-100 dark:border-gray-600">
                <p className="font-medium text-gray-500 dark:text-gray-400">Como configurar:</p>
                <p>1. Abra o Teams → canal desejado → <strong>...</strong> → <strong>Conectores</strong></p>
                <p>2. Pesquise <span className="font-mono text-blue-600 dark:text-blue-400">Incoming Webhook</span> → <strong>Configurar</strong></p>
                <p>3. Nomeie (ex: <span className="font-mono">{`${branding.platform_name} Alerts`}</span>) → <strong>Criar</strong></p>
                <p>4. Copie a URL e cole acima</p>
              </div>
            </div>
          )}

          {/* Config fields — Telegram */}
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
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chat ID</label>
                <input
                  value={form.chat_id}
                  onChange={(e) => set('chat_id', e.target.value)}
                  placeholder="-100123456789"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1 bg-sky-50/50 dark:bg-gray-700/50 rounded-lg p-3 border border-sky-100 dark:border-gray-600">
                <p className="font-medium text-gray-500 dark:text-gray-400">Como obter o Chat ID:</p>
                <p>1. Crie um bot via <span className="font-mono text-sky-600 dark:text-sky-400">@BotFather</span> e copie o token</p>
                <p>2. Adicione o bot ao grupo como <strong>administrador</strong></p>
                <p>3. Envie uma mensagem no grupo</p>
                <p>4. Acesse <span className="font-mono break-all">api.telegram.org/bot{'<TOKEN>'}/getUpdates</span></p>
                <p className="text-amber-500 dark:text-amber-400">IDs de grupos são negativos (ex: -1001234567890)</p>
              </div>
            </div>
          )}

          {/* Config fields — Email */}
          {form.channel_type === 'email' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destinatários</label>
                <input
                  value={form.recipients}
                  onChange={(e) => set('recipients', e.target.value)}
                  placeholder="admin@empresa.com, cto@empresa.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-gray-400 mt-1">Separe múltiplos e-mails por vírgula</p>
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1 bg-amber-50/50 dark:bg-gray-700/50 rounded-lg p-3 border border-amber-100 dark:border-gray-600">
                <p className="font-medium text-gray-500 dark:text-gray-400">Sobre o canal de e-mail:</p>
                <p>Os eventos serão enviados como e-mail formatado via SMTP configurado no sistema.</p>
                <p>Ideal para receber alertas diretamente na caixa de entrada, sem depender de bots.</p>
              </div>
            </div>
          )}

          {/* Events */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Eventos ({form.events.length}/{supportedEvents.length})
              </label>
              <button type="button" onClick={toggleAll} className="text-xs text-primary hover:underline">
                {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
              {supportedEvents.map((ev) => (
                <label key={ev} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  form.events.includes(ev) ? 'bg-primary/5 dark:bg-primary/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}>
                  <input
                    type="checkbox"
                    checked={form.events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="w-3.5 h-3.5 text-primary rounded border-gray-300"
                  />
                  <span className={`text-xs font-medium ${form.events.includes(ev) ? 'text-gray-800 dark:text-gray-200' : 'text-gray-600 dark:text-gray-400'}`}>
                    {EVENT_LABELS[ev] || ev}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-gray-400 hidden sm:inline">{ev}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

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
            <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
              <td className="py-1.5 px-2">
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${EVENT_COLORS[d.event_type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                  {EVENT_LABELS[d.event_type] || d.event_type}
                </span>
              </td>
              <td className="py-1.5 px-2">
                {d.status === 'delivered' ? (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3 h-3" /> Entregue
                  </span>
                ) : d.status === 'failed' ? (
                  <span className="flex items-center gap-1 text-red-500">
                    <XCircle className="w-3 h-3" /> Falha
                    {d.error_message && <span className="text-gray-400 ml-1 truncate max-w-[140px]" title={d.error_message}>{d.error_message}</span>}
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
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Anterior
          </button>
          <span className="text-xs text-gray-400">{page} / {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Próximo
          </button>
        </div>
      )}
    </div>
  );
}

// ── ChannelCard ───────────────────────────────────────────────────────────────

function ChannelCard({ channel, onEdit, onDelete, onTest, onToggle }) {
  const [showHistory, setShowHistory] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  const typeInfo = CHANNEL_TYPES.find((t) => t.value === channel.channel_type);
  const TypeIcon = typeInfo?.icon || Bell;
  const last = channel.last_delivery;

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
    <div className={`rounded-xl border p-4 transition-all ${
      channel.is_active
        ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200/60 dark:border-gray-700/50 opacity-70'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${typeInfo?.bg || 'bg-gray-100 dark:bg-gray-700'}`}>
            <TypeIcon className={`w-4.5 h-4.5 ${typeInfo?.color || 'text-gray-500'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">{channel.name}</span>
              <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                channel.is_active
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {channel.is_active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400 dark:text-gray-500">{typeInfo?.label}</p>
              {channel.total_deliveries > 0 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  · {channel.total_deliveries} entrega{channel.total_deliveries !== 1 ? 's' : ''}
                  {channel.fail_count > 0 && (
                    <span className="text-red-500"> · {channel.fail_count} falha{channel.fail_count !== 1 ? 's' : ''}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => onToggle(channel.id)}
            title={channel.is_active ? 'Desativar' : 'Ativar'}
            className={`p-1.5 rounded-lg transition-colors ${
              channel.is_active
                ? 'text-green-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                : 'text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleTest}
            title="Enviar teste"
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onEdit(channel)}
            title="Editar"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
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
          <span key={ev} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${EVENT_COLORS[ev] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
            {EVENT_LABELS[ev] || ev}
          </span>
        ))}
      </div>

      {/* Last delivery info */}
      {last && (
        <div className={`flex items-center gap-2 mt-2.5 text-[11px] px-2.5 py-1.5 rounded-lg ${
          last.status === 'delivered'
            ? 'bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/10 text-red-500 dark:text-red-400'
        }`}>
          {last.status === 'delivered' ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <XCircle className="w-3 h-3 flex-shrink-0" />}
          <span>Última: {EVENT_LABELS[last.event_type] || last.event_type}</span>
          <span className="text-gray-400 ml-auto">{last.created_at ? new Date(last.created_at).toLocaleString('pt-BR') : ''}</span>
        </div>
      )}

      {/* Test feedback */}
      {testMsg && (
        <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 ${
          testMsg.ok
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
        }`}>
          {testMsg.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
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
  const [filterType, setFilterType] = useState('all');
  const [filterEvent, setFilterEvent] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: notificationChannelService.list,
    staleTime: 60_000,
  });

  const channels = data?.channels || [];
  const supportedEvents = data?.supported_events?.length
    ? data.supported_events
    : Object.keys(EVENT_LABELS);

  const filteredChannels = useMemo(() => {
    let result = channels;
    if (filterType !== 'all') result = result.filter((ch) => ch.channel_type === filterType);
    if (filterEvent !== 'all') result = result.filter((ch) => (ch.events || []).includes(filterEvent));
    return result;
  }, [channels, filterType, filterEvent]);

  // Stats
  const stats = useMemo(() => {
    const active = channels.filter((c) => c.is_active).length;
    const totalDeliveries = channels.reduce((s, c) => s + (c.total_deliveries || 0), 0);
    const totalFails = channels.reduce((s, c) => s + (c.fail_count || 0), 0);
    return { total: channels.length, active, totalDeliveries, totalFails };
  }, [channels]);

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

  const toggleMutation = useMutation({
    mutationFn: notificationChannelService.toggle,
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Canais de Notificação</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Receba alertas no Teams, Telegram ou E-mail
              </p>
            </div>
          </div>
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" /> Novo canal
          </button>
        </div>

        {/* Stats */}
        {channels.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Canais', value: stats.total, icon: Bell, color: 'text-primary', bg: 'bg-primary-50 dark:bg-primary-900/20' },
              { label: 'Ativos', value: stats.active, icon: Power, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
              { label: 'Entregas', value: stats.totalDeliveries, icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
              { label: 'Falhas', value: stats.totalFails, icon: AlertTriangle, color: stats.totalFails > 0 ? 'text-red-500' : 'text-gray-400', bg: stats.totalFails > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/50' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`flex items-center gap-3 px-4 py-3 ${bg} rounded-xl border border-gray-200/60 dark:border-gray-700/50`}>
                <Icon className={`w-5 h-5 ${color}`} />
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        {channels.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Filter className="w-3.5 h-3.5" /> Filtros:
            </div>
            {/* Type filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">Todos os tipos</option>
              {CHANNEL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {/* Event filter */}
            <select
              value={filterEvent}
              onChange={(e) => setFilterEvent(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">Todos os eventos</option>
              {supportedEvents.map((ev) => (
                <option key={ev} value={ev}>{EVENT_LABELS[ev] || ev}</option>
              ))}
            </select>
            {(filterType !== 'all' || filterEvent !== 'all') && (
              <button
                onClick={() => { setFilterType('all'); setFilterEvent('all'); }}
                className="text-xs text-primary hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Channel list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <Bell className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nenhum canal configurado</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Adicione um canal para receber notificações de alertas, orçamentos e agendamentos.
            </p>
            <div className="flex items-center justify-center gap-3 mt-5">
              {CHANNEL_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => { setEditing(null); setShowModal(true); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${t.border} ${t.bg} text-sm font-medium text-gray-700 dark:text-gray-300 hover:shadow-md transition-all`}
                >
                  <t.icon className={`w-4 h-4 ${t.color}`} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <Filter className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum canal corresponde aos filtros selecionados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredChannels.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                onEdit={(c) => { setEditing(c); setShowModal(true); }}
                onDelete={handleDelete}
                onTest={testFn}
                onToggle={(id) => toggleMutation.mutate(id)}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        {channels.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">
            {channels.length} canal{channels.length !== 1 ? 'is' : ''} configurado{channels.length !== 1 ? 's' : ''} · Limite: {MAX_CHANNELS}.
            Eventos são entregues automaticamente quando disparados.
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

const MAX_CHANNELS = 20;

export default NotificationChannels;
