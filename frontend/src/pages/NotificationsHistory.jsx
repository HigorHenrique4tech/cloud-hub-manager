import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, TrendingDown, Clock, Zap, Wallet, Hourglass, CheckCircle2, Shield,
  ShieldAlert, ShieldCheck, CloudCog, Users, CreditCard, Crown, ArrowRightLeft,
  Database, AlertTriangle, Info, CheckCheck, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import api, { wsUrl } from '../services/api';
import { alertService } from '../services/alertService';

// ── Type registry ─────────────────────────────────────────────────────────────

const TYPE_META = {
  anomaly:        { Icon: TrendingDown,   color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-900/20',        label: 'Anomalia',              group: 'FinOps' },
  budget:         { Icon: Wallet,         color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20',  label: 'Orçamento',             group: 'FinOps' },
  finops_scan:    { Icon: Zap,            color: 'text-primary', bg: 'bg-indigo-50 dark:bg-indigo-900/20',  label: 'FinOps Scan',           group: 'FinOps' },
  cost_alert:     { Icon: Bell,           color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20',  label: 'Alerta de Custo',       group: 'FinOps' },
  security_alert: { Icon: ShieldAlert,    color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',        label: 'Alerta de Segurança',   group: 'Segurança' },
  security_auto:  { Icon: ShieldCheck,    color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20',  label: 'Automação de Segurança',group: 'Segurança' },
  security:       { Icon: Shield,         color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-900/20',        label: 'Segurança',             group: 'Segurança' },
  migration:      { Icon: ArrowRightLeft, color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20',      label: 'Migração',              group: 'Migração' },
  backup:         { Icon: Database,       color: 'text-sky-500',    bg: 'bg-sky-50 dark:bg-sky-900/20',        label: 'Backup',                group: 'Azure' },
  schedule:       { Icon: Clock,          color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20',      label: 'Agendamento',           group: 'Geral' },
  approval:       { Icon: CheckCircle2,   color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20',    label: 'Aprovação',             group: 'Geral' },
  policy:         { Icon: Shield,         color: 'text-gray-500',  bg: 'bg-gray-50 dark:bg-gray-900/20',    label: 'Política',              group: 'Geral' },
  cloud_account:  { Icon: CloudCog,       color: 'text-cyan-500',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',      label: 'Conta Cloud',           group: 'Geral' },
  workspace:      { Icon: Users,          color: 'text-teal-500',   bg: 'bg-teal-50 dark:bg-teal-900/20',      label: 'Workspace',             group: 'Geral' },
  billing:        { Icon: CreditCard,     color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20',    label: 'Cobrança',              group: 'Geral' },
  member:         { Icon: Users,          color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20',      label: 'Membro',                group: 'Geral' },
  trial:          { Icon: Hourglass,      color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20',  label: 'Trial',                 group: 'Geral' },
  plan:           { Icon: Crown,          color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20',    label: 'Plano',                 group: 'Geral' },
  warning:        { Icon: AlertTriangle,  color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20',    label: 'Aviso',                 group: 'Geral' },
  info:           { Icon: Info,           color: 'text-gray-400',   bg: 'bg-gray-50 dark:bg-gray-700/40',      label: 'Info',                  group: 'Geral' },
};

const FILTER_GROUPS = [
  { key: 'all',       label: 'Todos' },
  { key: 'security',  label: 'Segurança',  types: ['security_alert', 'security_auto', 'security'] },
  { key: 'migration', label: 'Migração',   types: ['migration'] },
  { key: 'backup',    label: 'Backup',     types: ['backup'] },
  { key: 'finops',    label: 'FinOps',     types: ['anomaly', 'budget', 'finops_scan', 'cost_alert'] },
  { key: 'schedule',  label: 'Agendamentos', types: ['schedule'] },
  { key: 'billing',   label: 'Cobrança',   types: ['billing', 'plan', 'trial', 'approval'] },
  { key: 'system',    label: 'Sistema',    types: ['cloud_account', 'workspace', 'member', 'policy', 'warning', 'info'] },
];

const PAGE_SIZE = 30;

function typeMeta(type) {
  return TYPE_META[type] || { Icon: Bell, color: 'text-gray-400', bg: 'bg-gray-50 dark:bg-gray-700/40', label: type };
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NotificationsHistory() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeGroup, setActiveGroup] = useState('all');
  const [page, setPage] = useState(0);

  const offset = page * PAGE_SIZE;
  const typeFilter = FILTER_GROUPS.find(g => g.key === activeGroup);

  // Query: fetch all events (or filtered by type)
  // Since the API accepts one type at a time, fetch all and filter client-side for groups
  // For groups with multiple types, fetch without type filter then filter locally
  const eventsQ = useQuery({
    queryKey: ['notifications-history', activeGroup, page],
    queryFn: async () => {
      if (activeGroup === 'all') {
        // For "all", use raw API to get paginated response with total
        const resp = await api.get(wsUrl('/alerts/events'), { params: { limit: PAGE_SIZE, offset } });
        const data = resp.data;
        return { items: Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []), total: data?.total ?? 0 };
      }
      // Fetch larger batch and filter locally for multi-type groups
      const allItems = await alertService.getEvents({ limit: 200 });
      const filtered = allItems.filter(e => typeFilter?.types?.includes(e.notification_type));
      const sliced = filtered.slice(offset, offset + PAGE_SIZE);
      return { items: sliced, total: filtered.length };
    },
    staleTime: 30_000,
    retry: false,
  });

  const markReadMut = useMutation({
    mutationFn: (id) => alertService.markEventRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-history'] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => alertService.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-history'] });
      qc.invalidateQueries({ queryKey: ['alert-events-unread'] });
    },
  });

  const items = eventsQ.data?.items || [];
  const total = eventsQ.data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleGroupChange(key) {
    setActiveGroup(key);
    setPage(0);
  }

  const unreadCount = items.filter(e => !e.is_read).length;

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => navigate(-1)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <Bell className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Histórico de Notificações</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 ml-9">
            Eventos do sistema: segurança, migrações, backup, FinOps e mais.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => eventsQ.refetch()}
            disabled={eventsQ.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={eventsQ.isFetching ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            onClick={() => markAllMut.mutate()}
            disabled={markAllMut.isPending || unreadCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
          >
            <CheckCheck size={12} />
            Marcar tudo como lido
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_GROUPS.map(g => (
          <button
            key={g.key}
            onClick={() => handleGroupChange(g.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeGroup === g.key
              ? 'bg-primary text-white shadow-sm'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {eventsQ.isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nenhuma notificação encontrada</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {activeGroup !== 'all' ? 'Tente selecionar outro filtro.' : 'Eventos do sistema aparecerão aqui.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {items.map(ev => {
              const { Icon, color, bg, label } = typeMeta(ev.notification_type);
              return (
                <div
                  key={ev.id}
                  onClick={() => {
                    if (!ev.is_read) markReadMut.mutate(ev.id);
                    if (ev.link_to) navigate(ev.link_to);
                  }}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer group
                    ${ev.is_read
                      ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-70 hover:opacity-100'
                      : 'border-primary/20 bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/15'
                    }`}
                >
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${bg}`}>
                    <Icon size={16} className={color} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
                      {!ev.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{ev.message}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{fmtDate(ev.triggered_at)}</p>
                  </div>

                  {/* Mark read button */}
                  {!ev.is_read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markReadMut.mutate(ev.id); }}
                      title="Marcar como lido"
                      className="flex-shrink-0 text-gray-300 dark:text-gray-600 hover:text-green-500 dark:hover:text-green-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <CheckCheck size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Exibindo {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total} notificações
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={13} /> Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  Próximo <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
