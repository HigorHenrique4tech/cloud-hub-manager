import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Users, Building2, ChevronDown, ChevronUp, Search, Check,
  Phone, MessageSquare, Mail, Calendar, LifeBuoy, Loader2, ArrowRight,
  AlertCircle, Clock as ClockIcon,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import adminService from '../services/adminService';
import supportService from '../services/supportService';

/* ── Constants ───────────────────────────────────────────────────────────── */

const LEAD_STATUS = {
  new:       { label: 'Novo',       cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  contacted: { label: 'Contatado',  cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  converted: { label: 'Convertido', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  lost:      { label: 'Perdido',    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

const PLAN_BADGE = {
  free:       'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  pro:        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  enterprise: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500',
};

/* ── Leads Tab ───────────────────────────────────────────────────────────── */

const LeadsTab = () => {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [expandedLead, setExpandedLead] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-leads', statusFilter],
    queryFn: () => adminService.listLeads(statusFilter || undefined),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }) => adminService.updateLeadStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-leads'] });
      setOpenMenu(null);
    },
  });

  const leads = data?.leads || [];

  const toggleExpand = (id) => setExpandedLead((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary"
        >
          <option value="">Todos os status</option>
          <option value="new">Novo</option>
          <option value="contacted">Contatado</option>
          <option value="converted">Convertido</option>
          <option value="lost">Perdido</option>
        </select>
        <span className="text-sm text-gray-500 dark:text-gray-400">{leads.length} leads</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum lead encontrado</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <th className="w-6 py-3 px-4" />
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Nome</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Empresa</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Org</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Data</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {leads.map((lead) => {
                const badge = LEAD_STATUS[lead.status] || LEAD_STATUS.new;
                const isExpanded = expandedLead === lead.id;
                return (
                  <>
                    <tr
                      key={lead.id}
                      onClick={() => toggleExpand(lead.id)}
                      className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 text-gray-400 dark:text-gray-500">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{lead.name}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{lead.company || '—'}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{lead.org_name || '—'}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-500 text-xs">
                        {lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setOpenMenu(openMenu === lead.id ? null : lead.id)}
                          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 transition-colors"
                        >
                          Alterar <ChevronDown size={12} />
                        </button>
                        {openMenu === lead.id && (
                          <div className="absolute right-4 top-8 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[140px]">
                            {Object.entries(LEAD_STATUS).map(([key, val]) => (
                              <button
                                key={key}
                                onClick={() => updateMut.mutate({ id: lead.id, status: key })}
                                disabled={lead.status === key || updateMut.isPending}
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 flex items-center gap-2 first:rounded-t-lg last:rounded-b-lg"
                              >
                                {lead.status === key && <Check size={12} />}
                                {val.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${lead.id}-detail`} className="bg-gray-50 dark:bg-gray-700/20">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-1">
                                <Mail size={11} /> E-mail
                              </p>
                              <p className="text-sm text-gray-800 dark:text-gray-200">{lead.email}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-1">
                                <Phone size={11} /> Telefone
                              </p>
                              <p className="text-sm text-gray-800 dark:text-gray-200">{lead.phone || <span className="text-gray-400 dark:text-gray-500">Não informado</span>}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-1">
                                <Calendar size={11} /> Enviado em
                              </p>
                              <p className="text-sm text-gray-800 dark:text-gray-200">
                                {lead.created_at ? new Date(lead.created_at).toLocaleString('pt-BR') : '—'}
                              </p>
                            </div>
                            {lead.message && (
                              <div className="md:col-span-3 space-y-1">
                                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-1">
                                  <MessageSquare size={11} /> Mensagem
                                </p>
                                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                  {lead.message}
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ── Orgs Tab ────────────────────────────────────────────────────────────── */

const OrgsTab = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [confirmChange, setConfirmChange] = useState(null); // { slug, name, plan }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: () => adminService.listOrgs(),
  });

  const planMut = useMutation({
    mutationFn: ({ slug, plan_tier }) => adminService.setOrgPlan(slug, plan_tier),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-orgs'] });
      setOpenMenu(null);
      setConfirmChange(null);
    },
  });

  const allOrgs = data?.orgs || [];
  const filtered = allOrgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou slug..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
        />
      </div>
      <span className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} organizações</span>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Organização</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Slug</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Plano</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Tipo</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Membros</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Criada em</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filtered.map((org) => (
                <tr key={org.id} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{org.name}</td>
                  <td className="py-3 px-4 font-mono text-xs text-gray-500 dark:text-gray-400">{org.slug}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_BADGE[org.plan_tier] || PLAN_BADGE.free}`}>
                      {org.plan_tier}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400 capitalize text-xs">{org.org_type}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{org.members_count}</td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-500 text-xs">
                    {org.created_at ? new Date(org.created_at).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="py-3 px-4 relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === org.id ? null : org.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 transition-colors"
                    >
                      Alterar plano <ChevronDown size={12} />
                    </button>
                    {openMenu === org.id && (
                      <div className="absolute right-4 top-8 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[140px]">
                        {['free', 'pro', 'enterprise'].map((tier) => (
                          <button
                            key={tier}
                            onClick={() => {
                              setOpenMenu(null);
                              setConfirmChange({ slug: org.slug, name: org.name, plan: tier, current: org.plan_tier });
                            }}
                            disabled={org.plan_tier === tier}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 capitalize first:rounded-t-lg last:rounded-b-lg flex items-center gap-2"
                          >
                            {org.plan_tier === tier && <Check size={12} />}
                            {tier}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm plan change modal */}
      {confirmChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Confirmar alteração de plano</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Alterar <strong>{confirmChange.name}</strong> de{' '}
              <span className="capitalize font-medium">{confirmChange.current}</span> para{' '}
              <span className="capitalize font-medium">{confirmChange.plan}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmChange(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => planMut.mutate({ slug: confirmChange.slug, plan_tier: confirmChange.plan })}
                disabled={planMut.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {planMut.isPending ? 'Alterando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Admin Tickets Tab ───────────────────────────────────────────────────── */

const TICKET_STATUS_CONFIG = {
  open:           { label: 'Aberto',          cls: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  in_progress:    { label: 'Em Andamento',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  waiting_client: { label: 'Aguardando',      cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  resolved:       { label: 'Resolvido',       cls: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  closed:         { label: 'Encerrado',       cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

const PRIORITY_CONFIG = {
  low:    { label: 'Baixa',   cls: 'text-gray-500' },
  normal: { label: 'Normal',  cls: 'text-blue-600 dark:text-blue-400' },
  high:   { label: 'Alta',    cls: 'text-orange-600 dark:text-orange-400' },
  urgent: { label: 'Urgente', cls: 'text-red-600 dark:text-red-400 font-semibold' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function TicketStatusBadge({ status }) {
  const cfg = TICKET_STATUS_CONFIG[status] || TICKET_STATUS_CONFIG.open;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function AdminTicketDrawer({ ticket: initial, onClose }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [statusSel, setStatusSel] = useState(initial.status);

  const { data: ticket } = useQuery({
    queryKey: ['admin-ticket', initial.id],
    queryFn: () => supportService.adminGet(initial.id),
    initialData: initial,
  });

  const statusMut = useMutation({
    mutationFn: (s) => supportService.adminUpdateStatus(ticket.id, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      qc.invalidateQueries({ queryKey: ['admin-ticket', ticket.id] });
    },
  });

  const msgMut = useMutation({
    mutationFn: () => supportService.adminAddMessage(ticket.id, { content: reply, is_internal: isInternal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-ticket', ticket.id] });
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      setReply('');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">#{ticket.id?.slice(0, 8)}</p>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{ticket.title}</h3>
            {ticket.organization && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ticket.organization.name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {/* Status change */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">Status:</span>
          <select
            value={statusSel}
            onChange={(e) => { setStatusSel(e.target.value); statusMut.mutate(e.target.value); }}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
          >
            <option value="open">Aberto</option>
            <option value="in_progress">Em Andamento</option>
            <option value="waiting_client">Aguardando Cliente</option>
            <option value="resolved">Resolvido</option>
            <option value="closed">Encerrado</option>
          </select>
          {statusMut.isPending && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-[200px]">
          {(ticket.messages || []).map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.sender?.is_admin ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0 ${msg.sender?.is_admin ? 'bg-primary' : 'bg-gray-400'}`}>
                {msg.sender?.is_admin ? <ShieldCheck className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              </div>
              <div className={`max-w-[75%] flex flex-col gap-1 ${msg.sender?.is_admin ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{msg.sender?.name || '—'}</span>
                  <span>{fmtDate(msg.created_at)}</span>
                  {msg.is_internal && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Interna</span>
                  )}
                </div>
                <div className={`px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                  msg.sender?.is_admin
                    ? 'bg-primary text-white'
                    : msg.is_internal
                      ? 'bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Reply */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder={isInternal ? 'Nota interna (não visível ao cliente)…' : 'Responder ao cliente…'}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none ${
              isInternal
                ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-900 dark:text-yellow-200'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            }`}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded"
              />
              Nota interna (invisível ao cliente)
            </label>
            <button
              onClick={() => msgMut.mutate()}
              disabled={msgMut.isPending || !reply.trim()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {msgMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const AdminTicketsTab = () => {
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selected, setSelected] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tickets', statusFilter, priorityFilter],
    queryFn: () => supportService.adminList({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
    }),
  });

  const tickets = data?.tickets || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary"
        >
          <option value="">Todos os status</option>
          <option value="open">Aberto</option>
          <option value="in_progress">Em Andamento</option>
          <option value="waiting_client">Aguardando Cliente</option>
          <option value="resolved">Resolvido</option>
          <option value="closed">Encerrado</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary"
        >
          <option value="">Todas as prioridades</option>
          <option value="urgent">Urgente</option>
          <option value="high">Alta</option>
          <option value="normal">Normal</option>
          <option value="low">Baixa</option>
        </select>
        <span className="text-sm text-gray-500 dark:text-gray-400">{tickets.length} chamado(s)</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <LifeBuoy size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum chamado encontrado</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Assunto</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Organização</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Prioridade</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Atualizado</th>
                <th className="py-3 px-4 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {tickets.map((t) => {
                const pCfg = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.normal;
                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate">
                      <span className="text-xs text-gray-400 font-mono mr-1">#{t.id?.slice(0, 8)}</span>
                      {t.title}
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{t.organization?.name || '—'}</td>
                    <td className="py-3 px-4"><TicketStatusBadge status={t.status} /></td>
                    <td className={`py-3 px-4 text-xs ${pCfg.cls}`}>{pCfg.label}</td>
                    <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400">{fmtDate(t.updated_at)}</td>
                    <td className="py-3 px-4"><ArrowRight className="w-4 h-4 text-gray-400" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && <AdminTicketDrawer ticket={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

/* ── Main Page ───────────────────────────────────────────────────────────── */

const AdminPanel = () => {
  const [tab, setTab] = useState('leads');

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Painel Admin</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie leads e planos das organizações</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'leads', label: 'Leads Enterprise', icon: Users },
            { id: 'orgs', label: 'Organizações', icon: Building2 },
            { id: 'tickets', label: 'Atendimento', icon: LifeBuoy },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'leads' && <LeadsTab />}
        {tab === 'orgs' && <OrgsTab />}
        {tab === 'tickets' && <AdminTicketsTab />}
      </div>
    </Layout>
  );
};

export default AdminPanel;
