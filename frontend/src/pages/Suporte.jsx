/**
 * Suporte.jsx — Admin/Helpdesk ticket management panel.
 * Route: /suporte — accessible to is_admin or is_helpdesk users only.
 * Jira Service Management-inspired layout:
 *   Left: queue filters | Center: ticket list | Right: ticket detail + live chat
 */
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  LifeBuoy, Search, Send, ShieldCheck, User, Loader2, AlertTriangle,
  Clock, Tag, Layers, Building2, ChevronRight, Lock, RefreshCw,
  CheckCircle, Circle, AlertCircle, XCircle, StickyNote, X,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import supportService from '../services/supportService';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  open:           { label: 'Aberto',          short: 'Aberto',      icon: AlertCircle, cls: 'text-red-600 dark:text-red-400',    badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' },
  in_progress:    { label: 'Em Andamento',    short: 'Andamento',   icon: RefreshCw,   cls: 'text-blue-600 dark:text-blue-400',  badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' },
  waiting_client: { label: 'Aguardando Cliente', short: 'Aguardando', icon: Clock,     cls: 'text-yellow-600 dark:text-yellow-400', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800' },
  resolved:       { label: 'Resolvido',       short: 'Resolvido',   icon: CheckCircle, cls: 'text-green-600 dark:text-green-400', badge: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' },
  closed:         { label: 'Encerrado',       short: 'Encerrado',   icon: XCircle,     cls: 'text-gray-500 dark:text-gray-400',  badge: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600' },
};

const PRIORITY_DOT = {
  low:    'bg-gray-400',
  normal: 'bg-blue-500',
  high:   'bg-orange-500',
  urgent: 'bg-red-600',
};

const PRIORITY_LABEL = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const CATEGORY_LABELS = { billing: 'Financeiro', technical: 'Técnico', feature_request: 'Sugestão', other: 'Outro' };

const QUEUES = [
  { id: '',             label: 'Todos os tickets',   icon: LifeBuoy },
  { id: 'open',         label: 'Abertos',            icon: AlertCircle },
  { id: 'in_progress',  label: 'Em Andamento',       icon: RefreshCw },
  { id: 'waiting_client', label: 'Aguardando Cliente', icon: Clock },
  { id: 'resolved',     label: 'Resolvidos',         icon: CheckCircle },
  { id: 'closed',       label: 'Encerrados',         icon: XCircle },
];

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtTicketId(t) {
  if (t?.ticket_number) return `TKT-${String(t.ticket_number).padStart(4, '0')}`;
  return t?.id ? `#${t.id.slice(0, 8)}` : '';
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, currentUserId }) {
  const isOwn = msg.sender?.id === currentUserId;
  const isInternal = msg.is_internal;
  const isSupport = msg.sender?.is_admin || msg.sender?.is_helpdesk;

  return (
    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs ${isSupport ? 'bg-primary' : 'bg-gray-400'}`}>
        {isSupport ? <ShieldCheck className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
      </div>
      <div className={`max-w-[75%] flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-1.5 text-[11px] text-gray-400 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="font-medium">{isSupport ? 'Suporte' : (msg.sender?.name || 'Cliente')}</span>
          <span>{fmtFull(msg.created_at)}</span>
          {isInternal && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
              interna
            </span>
          )}
        </div>
        <div
          className={`px-3 py-2 rounded-xl text-sm whitespace-pre-wrap break-words ${
            isOwn
              ? 'bg-primary text-white rounded-tr-sm'
              : isInternal
                ? 'bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300 rounded-tl-sm'
                : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>
      </div>
    </div>
  );
}

// ── Ticket Detail Panel ───────────────────────────────────────────────────────

function TicketDetailPanel({ ticket, onClose, currentUser }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [replyError, setReplyError] = useState('');
  const messagesEndRef = useRef(null);
  const prevMsgCount = useRef(0);

  // Poll messages every 5s
  const { data: messagesData } = useQuery({
    queryKey: ['admin-ticket-messages', ticket.id],
    queryFn: () => supportService.adminGetMessages(ticket.id),
    refetchInterval: 5000,
  });

  // Poll ticket status every 10s
  const { data: ticketData } = useQuery({
    queryKey: ['admin-ticket-detail', ticket.id],
    queryFn: () => supportService.adminGet(ticket.id),
    refetchInterval: 10000,
    initialData: ticket,
  });

  const t = ticketData || ticket;
  const messages = messagesData?.messages || t.messages || [];

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      prevMsgCount.current = messages.length;
    }
  }, [messages.length]);

  const statusMut = useMutation({
    mutationFn: (status) => supportService.adminUpdateStatus(ticket.id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      qc.invalidateQueries({ queryKey: ['admin-ticket-detail', ticket.id] });
    },
  });

  const priorityMut = useMutation({
    mutationFn: (priority) => supportService.adminUpdatePriority(ticket.id, priority),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      qc.invalidateQueries({ queryKey: ['admin-ticket-detail', ticket.id] });
    },
  });

  const sendMut = useMutation({
    mutationFn: (data) => supportService.adminAddMessage(ticket.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-ticket-messages', ticket.id] });
      qc.invalidateQueries({ queryKey: ['admin-ticket-detail', ticket.id] });
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      setReply('');
      setReplyError('');
    },
    onError: (e) => setReplyError(e.response?.data?.detail || 'Erro ao enviar'),
  });

  const handleSend = () => {
    if (!reply.trim()) return;
    sendMut.mutate({ content: reply.trim(), is_internal: isInternal });
  };

  const sCfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;

  return (
    <div className="flex flex-col h-full border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-xs font-bold text-primary">{fmtTicketId(t)}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium border ${sCfg.badge}`}>
              {sCfg.short}
            </span>
          </div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{t.title}</h2>
        </div>
        <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Meta row */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
        {t.creator && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span className="font-medium text-gray-700 dark:text-gray-300">{t.creator.name}</span>
            <span>({t.creator.email})</span>
          </span>
        )}
        {t.organization && (
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            {t.organization.name}
          </span>
        )}
        {t.workspace && (
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {t.workspace.name}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {fmtFull(t.created_at)}
        </span>
      </div>

      {/* Actions row */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex gap-2 flex-wrap items-center">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Status:</span>
        {['open', 'in_progress', 'waiting_client', 'resolved', 'closed'].map((s) => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => statusMut.mutate(s)}
              disabled={t.status === s || statusMut.isPending}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                t.status === s
                  ? cfg.badge + ' ring-1 ring-offset-1 ring-current'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-400'
              }`}
            >
              {cfg.short}
            </button>
          );
        })}

        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-2 mr-1">Prioridade:</span>
        <select
          value={t.priority}
          onChange={(e) => priorityMut.mutate(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
        >
          {['low', 'normal', 'high', 'urgent'].map((p) => (
            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50/50 dark:bg-gray-900/20">
        {messages.length === 0 && (
          <div className="text-center text-xs text-gray-400 py-8">Nenhuma mensagem ainda.</div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} currentUserId={currentUser?.id} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); }}
          rows={3}
          placeholder={isInternal ? 'Nota interna (não visível ao cliente)...' : 'Responder ao cliente... (Ctrl+Enter para enviar)'}
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none resize-none transition-colors ${
            isInternal
              ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-900 dark:text-yellow-100 placeholder-yellow-500 focus:border-yellow-500'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-primary'
          }`}
        />
        {replyError && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {replyError}
          </p>
        )}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
            />
            <StickyNote className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Nota interna</span>
          </label>
          <button
            onClick={handleSend}
            disabled={sendMut.isPending || !reply.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors active:scale-[0.97]"
          >
            {sendMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ticket Row ────────────────────────────────────────────────────────────────

function TicketRow({ ticket, isSelected, onClick }) {
  const sCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const StatusIcon = sCfg.icon;
  const dotCls = PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.normal;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 transition-colors ${
        isSelected
          ? 'bg-primary/5 border-l-2 border-l-primary dark:bg-primary/10'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700/30 border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-2">
        <StatusIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${sCfg.cls}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-mono text-[11px] font-bold text-primary">
              {fmtTicketId(ticket)}
            </span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} title={PRIORITY_LABEL[ticket.priority]} />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{ticket.title}</p>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
            {ticket.creator && (
              <span className="flex items-center gap-0.5">
                <User className="w-3 h-3" />
                {ticket.creator.name}
              </span>
            )}
            {ticket.organization && (
              <span className="flex items-center gap-0.5">
                <Building2 className="w-3 h-3" />
                {ticket.organization.name}
              </span>
            )}
            {ticket.workspace && (
              <span className="flex items-center gap-0.5">
                <Layers className="w-3 h-3" />
                {ticket.workspace.name}
              </span>
            )}
            <span className="ml-auto flex-shrink-0">{fmtTime(ticket.updated_at)}</span>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 mt-1 flex-shrink-0 transition-colors ${isSelected ? 'text-primary' : 'text-gray-300 dark:text-gray-600'}`} />
      </div>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const Suporte = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeQueue, setActiveQueue] = useState('open');
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Access guard
  if (!user?.is_admin && !user?.is_helpdesk) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Lock className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Acesso restrito a administradores e agentes de suporte.</p>
          <button onClick={() => navigate('/')} className="text-sm text-primary hover:underline">Voltar ao início</button>
        </div>
      </Layout>
    );
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tickets', activeQueue, search],
    queryFn: () => supportService.adminList({
      status: activeQueue || undefined,
      search: search || undefined,
      page_size: 50,
    }),
    refetchInterval: 30000, // refresh list every 30s
  });

  const tickets = data?.tickets || [];
  const stats = data?.stats || {};

  return (
    <Layout>
      {/* Full-viewport panel layout */}
      <div className="flex h-[calc(100vh-64px)] -mx-6 -my-8 overflow-hidden">

        {/* ── Left: Queue sidebar ───────────────────────────────────── */}
        <div className="w-52 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <LifeBuoy className="w-5 h-5 text-primary" />
              <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100">Helpdesk</h1>
            </div>
          </div>

          {/* Stats */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-1.5">
            {[
              { key: 'open', label: 'Abertos', cls: 'text-red-600 dark:text-red-400' },
              { key: 'in_progress', label: 'Andamento', cls: 'text-blue-600 dark:text-blue-400' },
              { key: 'waiting_client', label: 'Aguardando', cls: 'text-yellow-600 dark:text-yellow-400' },
              { key: 'resolved', label: 'Resolvidos', cls: 'text-green-600 dark:text-green-400' },
            ].map(({ key, label, cls }) => (
              <div key={key} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2 py-1.5 text-center">
                <p className={`text-base font-bold ${cls}`}>{stats[key] ?? '—'}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
              </div>
            ))}
          </div>

          {/* Queues */}
          <nav className="flex-1 overflow-y-auto py-2">
            <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Filas</p>
            {QUEUES.map((q) => {
              const QIcon = q.icon;
              const isActive = activeQueue === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => { setActiveQueue(q.id); setSelectedTicket(null); }}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <QIcon className="w-4 h-4 flex-shrink-0" />
                  {q.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── Center: Ticket list ───────────────────────────────────── */}
        <div className={`flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 ${selectedTicket ? 'w-80 flex-shrink-0' : 'flex-1'}`}>
          {/* Search */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700/60 bg-gray-100/60 dark:bg-gray-800/80">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tickets..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/80 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Header */}
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {QUEUES.find((q) => q.id === activeQueue)?.label || 'Todos'}
            </span>
            <span className="text-xs text-gray-400">{tickets.length} ticket(s)</span>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Circle className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                <p className="text-xs text-gray-400">Nenhum ticket nesta fila</p>
              </div>
            ) : (
              tickets.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  isSelected={selectedTicket?.id === t.id}
                  onClick={() => setSelectedTicket(t)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right: Detail panel ───────────────────────────────────── */}
        {selectedTicket ? (
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 min-w-0">
            <TicketDetailPanel
              ticket={selectedTicket}
              onClose={() => setSelectedTicket(null)}
              currentUser={user}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-900/30">
            <LifeBuoy className="w-12 h-12 text-gray-200 dark:text-gray-700" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Selecione um ticket para ver os detalhes</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Suporte;
