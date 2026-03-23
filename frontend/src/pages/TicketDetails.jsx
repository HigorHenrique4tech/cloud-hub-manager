import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Loader2, Send, ShieldCheck, User, AlertTriangle,
  Clock, Tag, Zap, Layers, RefreshCw,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import supportService from '../services/supportService';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  open:           { label: 'Aberto',          cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' },
  in_progress:    { label: 'Em Andamento',    cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' },
  waiting_client: { label: 'Aguardando Você', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800' },
  resolved:       { label: 'Resolvido',       cls: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' },
  closed:         { label: 'Encerrado',       cls: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600' },
};

const PRIORITY_CONFIG = {
  low:    { label: 'Baixa',   cls: 'text-gray-500' },
  normal: { label: 'Normal',  cls: 'text-blue-600 dark:text-blue-400' },
  high:   { label: 'Alta',    cls: 'text-orange-600 dark:text-orange-400' },
  urgent: { label: 'Urgente', cls: 'text-red-600 dark:text-red-400' },
};

const CATEGORY_LABELS = {
  billing: 'Financeiro', technical: 'Técnico', feature_request: 'Sugestão', other: 'Outro',
};

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtTicketId(t) {
  if (t?.ticket_number) return `TKT-${String(t.ticket_number).padStart(4, '0')}`;
  return t?.id ? `#${t.id.slice(0, 8)}` : '';
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn }) {
  const branding = useBranding();
  const isAdmin = msg.sender?.is_admin || msg.sender?.is_helpdesk;

  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isAdmin ? 'bg-primary' : 'bg-gray-400'}`}>
        {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>

      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="font-medium">
            {isAdmin ? `Suporte ${branding.platform_name}` : (msg.sender?.name || 'Usuário')}
          </span>
          <span>{fmtTime(msg.created_at)}</span>
        </div>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
            isOwn
              ? 'bg-primary text-white rounded-tr-sm'
              : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar info ──────────────────────────────────────────────────────────────

function TicketSidebar({ ticket }) {
  const sCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const pCfg = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;

  return (
    <div className="w-64 flex-shrink-0 space-y-4">
      <div className="card p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Detalhes do Chamado</h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${sCfg.cls}`}>
              {sCfg.label}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Prioridade</span>
            <span className={`text-xs font-medium ${pCfg.cls}`}>{pCfg.label}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Categoria</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">{CATEGORY_LABELS[ticket.category] || ticket.category}</span>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
          <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Tag className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300">Número</p>
              <p className="font-mono font-semibold text-primary">{fmtTicketId(ticket)}</p>
            </div>
          </div>
          {ticket.workspace && (
            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Layers className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">Workspace</p>
                <p>{ticket.workspace.name}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300">Aberto em</p>
              <p>{fmtTime(ticket.created_at)}</p>
            </div>
          </div>
          {ticket.resolved_at && (
            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">Resolvido em</p>
                <p>{fmtTime(ticket.resolved_at)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {ticket.creator && (
        <div className="card p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Solicitante</h3>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
              {ticket.creator.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ticket.creator.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{ticket.creator.email}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TicketDetails = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const prevMsgCount = useRef(0);

  // Initial ticket load (no polling — just for metadata)
  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => supportService.get(ticketId),
    staleTime: 30000,
  });

  // Messages with 5s polling
  const { data: messagesData } = useQuery({
    queryKey: ['ticket-messages', ticketId],
    queryFn: () => supportService.getMessages(ticketId),
    refetchInterval: 5000,
    enabled: !!ticket,
  });

  const messages = messagesData?.messages || ticket?.messages || [];

  // Auto-scroll only when new messages arrive
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      prevMsgCount.current = messages.length;
    }
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: (content) => supportService.addMessage(ticketId, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-messages', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      setReply('');
      setError('');
    },
    onError: (e) => setError(e.response?.data?.detail || 'Erro ao enviar mensagem'),
  });

  const handleSend = () => {
    if (!reply.trim()) return;
    sendMut.mutate(reply.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend();
  };

  const isClosed = ticket?.status === 'resolved' || ticket?.status === 'closed';

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!ticket) {
    return (
      <Layout>
        <div className="text-center py-24 text-gray-500">Ticket não encontrado.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Back + Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/support')}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-primary">{fmtTicketId(ticket)}</span>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{ticket.title}</h1>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Atualizado: {fmtTime(ticket.updated_at)}
              <span className="ml-2 inline-flex items-center gap-1 text-gray-400">
                <RefreshCw className="w-3 h-3" /> atualiza a cada 5s
              </span>
            </p>
          </div>
        </div>

        <div className="flex gap-6 items-start">
          {/* Chat area */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="card p-4 min-h-[400px] max-h-[520px] overflow-y-auto flex flex-col gap-4">
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                  Nenhuma mensagem ainda.
                </div>
              )}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={msg.sender?.id === user?.id}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {isClosed ? (
              <div className="card p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Este chamado foi encerrado. Abra um novo chamado se precisar de ajuda.
              </div>
            ) : (
              <div className="card p-4 space-y-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  placeholder="Digite sua resposta... (Ctrl+Enter para enviar)"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary resize-none"
                />
                {error && (
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {error}
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={handleSend}
                    disabled={sendMut.isPending || !reply.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors active:scale-[0.97]"
                  >
                    {sendMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar
                  </button>
                </div>
              </div>
            )}
          </div>

          <TicketSidebar ticket={ticket} />
        </div>
      </div>
    </Layout>
  );
};

export default TicketDetails;
