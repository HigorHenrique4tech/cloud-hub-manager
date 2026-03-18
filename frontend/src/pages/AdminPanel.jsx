import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Users, Building2, ChevronDown, ChevronUp, Search, Check,
  Phone, MessageSquare, Mail, Calendar, Loader2, ArrowRight,
  DollarSign, Plus, Pencil, Trash2, Paperclip, Download, X,
  ChevronRight, AlertCircle, CheckCircle2, Clock, Ban, CreditCard,
  History, FileDown, RefreshCw, Power, PowerOff, StickyNote, Save,
  Server, Cloud, Activity, BarChart2, LayoutGrid, Settings, Zap,
  TrendingUp, ChevronLeft, CheckSquare, Square, Bell,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import adminService from '../services/adminService';
import BillingAnalytics from '../components/admin/BillingAnalytics';
import BillingConfigModal from '../components/admin/BillingConfigModal';

/* ── Shared constants ────────────────────────────────────────────────────── */

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

const BILLING_STATUS = {
  pending:   { label: 'Pendente',   icon: Clock,         cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  paid:      { label: 'Pago',       icon: CheckCircle2,  cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  overdue:   { label: 'Em atraso',  icon: AlertCircle,   cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Cancelado',  icon: Ban,           cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtBRL = (v) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);


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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leads'] }); setOpenMenu(null); },
  });

  const leads = data?.leads || [];

  return (
    <div className="space-y-4">
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
        <div className="flex justify-center py-16"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500"><Users size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm">Nenhum lead encontrado</p></div>
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
                    <tr key={lead.id} onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                      className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer">
                      <td className="py-3 px-4 text-gray-400">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{lead.name}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{lead.company || '—'}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{lead.org_name || '—'}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="py-3 px-4"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span></td>
                      <td className="py-3 px-4 relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setOpenMenu(openMenu === lead.id ? null : lead.id)}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 transition-colors">
                          Alterar <ChevronDown size={12} />
                        </button>
                        {openMenu === lead.id && (
                          <div className="absolute right-4 top-8 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[140px]">
                            {Object.entries(LEAD_STATUS).map(([key, val]) => (
                              <button key={key} onClick={() => updateMut.mutate({ id: lead.id, status: key })}
                                disabled={lead.status === key || updateMut.isPending}
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 flex items-center gap-2 first:rounded-t-lg last:rounded-b-lg">
                                {lead.status === key && <Check size={12} />}{val.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${lead.id}-detail`} className="bg-gray-50 dark:bg-gray-700/20">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1"><Mail size={11} /> E-mail</p>
                              <p className="text-sm text-gray-800 dark:text-gray-200">{lead.email}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1"><Phone size={11} /> Telefone</p>
                              <p className="text-sm text-gray-800 dark:text-gray-200">{lead.phone || <span className="text-gray-400 italic">Não informado</span>}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1"><Calendar size={11} /> Enviado em</p>
                              <p className="text-sm text-gray-800 dark:text-gray-200">{lead.created_at ? new Date(lead.created_at).toLocaleString('pt-BR') : '—'}</p>
                            </div>
                            {lead.message && (
                              <div className="md:col-span-3 space-y-1">
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1"><MessageSquare size={11} /> Mensagem</p>
                                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">{lead.message}</p>
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


/* ── Orgs Tab (hierarchical + metrics + suspend + notes) ─────────────────── */

const PROVIDER_COLOR = {
  aws:   'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  azure: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  gcp:   'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  m365:  'bg-primary-50 text-primary-dark dark:bg-indigo-900/20 dark:text-primary-light',
};

const OrgMetricsPanel = ({ slug }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-org-metrics', slug],
    queryFn: () => adminService.getOrgMetrics(slug),
    staleTime: 120_000,
  });

  if (isLoading) return <div className="flex items-center gap-2 py-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Carregando métricas…</div>;
  if (!data) return null;

  const providers = Object.entries(data.cloud_accounts || {});

  return (
    <div className="flex flex-wrap gap-3 py-1">
      <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
        <LayoutGrid size={12} className="text-gray-400" />
        <span><strong>{data.active_workspace_count}</strong>/{data.workspace_count} workspaces</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
        <Users size={12} className="text-gray-400" />
        <span><strong>{data.member_count}</strong> membros</span>
      </div>
      {providers.map(([p, count]) => (
        <span key={p} className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${PROVIDER_COLOR[p] || 'bg-gray-100 text-gray-600'}`}>
          <Cloud size={9} /> {p.toUpperCase()} {count > 1 ? `×${count}` : ''}
        </span>
      ))}
      {data.last_activity_at && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Activity size={12} />
          <span>Ativo: {new Date(data.last_activity_at).toLocaleDateString('pt-BR')}</span>
        </div>
      )}
    </div>
  );
};

const OrgsTab = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [confirmChange, setConfirmChange] = useState(null);
  const [confirmSuspend, setConfirmSuspend] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [collapsed, setCollapsed] = useState(new Set());
  const [expandedOrg, setExpandedOrg] = useState(null);
  const [editingNotes, setEditingNotes] = useState(null); // org.slug
  const [notesValue, setNotesValue] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: () => adminService.listOrgs(),
  });

  const planMut = useMutation({
    mutationFn: ({ slug, plan_tier }) => adminService.setOrgPlan(slug, plan_tier),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-orgs'] }); setOpenMenu(null); setConfirmChange(null); },
  });

  const suspendMut = useMutation({
    mutationFn: ({ slug, suspend, reason }) => adminService.suspendOrg(slug, suspend, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-orgs'] }); setConfirmSuspend(null); setSuspendReason(''); },
  });

  const notesMut = useMutation({
    mutationFn: ({ slug, notes }) => adminService.updateOrgNotes(slug, notes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-orgs'] }); setEditingNotes(null); },
  });

  const allOrgs = data?.orgs || [];
  const masters = allOrgs.filter((o) => !o.parent_org_id);
  const childrenOf = (parentId) => allOrgs.filter((o) => o.parent_org_id === parentId);

  const searchLower = search.toLowerCase();
  const matchesSearch = (o) =>
    !search || o.name.toLowerCase().includes(searchLower) || o.slug.toLowerCase().includes(searchLower);

  const toggleCollapse = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleExpand = (id) => setExpandedOrg((prev) => (prev === id ? null : id));

  const OrgRow = ({ org, depth = 0 }) => {
    const children = childrenOf(org.id);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(org.id);
    const isExpanded = expandedOrg === org.id;
    const visible = matchesSearch(org) || children.some(matchesSearch);
    if (!visible) return null;

    const isSuspended = !org.is_active;

    return (
      <>
        <tr className={`transition-colors group ${isSuspended ? 'bg-red-50/40 dark:bg-red-900/5' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
          {/* Name + expand */}
          <td className="py-3 px-4">
            <div className="flex items-center gap-2" style={{ paddingLeft: depth * 20 }}>
              {hasChildren ? (
                <button onClick={() => toggleCollapse(org.id)}
                  className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {isCollapsed ? <ChevronRight size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                </button>
              ) : depth > 0 ? (
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  <span className="w-2 h-px bg-gray-300 dark:bg-gray-600" />
                </span>
              ) : <span className="w-5" />}
              <button onClick={() => toggleExpand(org.id)} className="flex items-center gap-2 text-left group/name">
                <span className={`font-medium text-sm ${isSuspended ? 'text-red-700 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{org.name}</span>
                {depth > 0 && <span className="text-xs text-gray-400">(parceira)</span>}
                {isSuspended && <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 px-1.5 py-0.5 rounded-full">Suspenso</span>}
              </button>
            </div>
            {org.notes && !isSuspended && (
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]" style={{ paddingLeft: depth * 20 + 28 }} title={org.notes}>
                📝 {org.notes}
              </p>
            )}
          </td>
          <td className="py-3 px-4 font-mono text-xs text-gray-500 dark:text-gray-400">{org.slug}</td>
          <td className="py-3 px-4">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_BADGE[org.plan_tier] || PLAN_BADGE.free}`}>
              {org.plan_tier}
            </span>
          </td>
          <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-xs capitalize">{org.org_type}</td>
          <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm">{org.members_count}</td>
          <td className="py-3 px-4 text-gray-500 text-xs">{fmtDate(org.created_at)}</td>
          <td className="py-3 px-4">
            <div className="flex items-center gap-1">
              {/* Plan menu */}
              <div className="relative">
                <button onClick={() => setOpenMenu(openMenu === org.id ? null : org.id)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 transition-colors">
                  Plano <ChevronDown size={11} />
                </button>
                {openMenu === org.id && (
                  <div className="absolute right-0 top-8 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[130px]">
                    {['free', 'pro', 'enterprise'].map((tier) => (
                      <button key={tier} onClick={() => { setOpenMenu(null); setConfirmChange({ slug: org.slug, name: org.name, plan: tier, current: org.plan_tier }); }}
                        disabled={org.plan_tier === tier}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 capitalize first:rounded-t-lg last:rounded-b-lg flex items-center gap-2">
                        {org.plan_tier === tier && <Check size={11} />}{tier}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Suspend / reactivate */}
              <button
                onClick={() => { setConfirmSuspend(org); setSuspendReason(org.suspended_reason || ''); }}
                title={isSuspended ? 'Reativar organização' : 'Suspender organização'}
                className={`p-1.5 rounded-lg transition-colors ${isSuspended ? 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20' : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'}`}>
                {isSuspended ? <Power size={13} /> : <PowerOff size={13} />}
              </button>

              {/* Notes */}
              <button
                onClick={() => { setEditingNotes(org.slug); setNotesValue(org.notes || ''); }}
                title="Notas do parceiro"
                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                <StickyNote size={13} />
              </button>
            </div>
          </td>
        </tr>

        {/* Expanded detail row */}
        {isExpanded && (
          <tr className="bg-gray-50/70 dark:bg-gray-700/20">
            <td colSpan={7} className="px-6 py-3">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <BarChart2 size={11} /> Métricas
                </p>
                <OrgMetricsPanel slug={org.slug} />
                {isSuspended && org.suspended_reason && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-1.5">
                    <strong>Motivo da suspensão:</strong> {org.suspended_reason}
                    {org.suspended_at && ` (${fmtDate(org.suspended_at)})`}
                  </p>
                )}
                {org.notes && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-lg px-3 py-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Notas internas: </span>{org.notes}
                  </p>
                )}
              </div>
            </td>
          </tr>
        )}

        {hasChildren && !isCollapsed && children.map((child) => (
          <OrgRow key={child.id} org={child} depth={depth + 1} />
        ))}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou slug..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary" />
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{allOrgs.length} orgs</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
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
                <th className="py-3 px-4 w-36" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {masters.map((org) => <OrgRow key={org.id} org={org} depth={0} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm plan change */}
      {confirmChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Confirmar alteração de plano</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Alterar <strong>{confirmChange.name}</strong> de <span className="capitalize font-medium">{confirmChange.current}</span> para <span className="capitalize font-medium">{confirmChange.plan}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmChange(null)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => planMut.mutate({ slug: confirmChange.slug, plan_tier: confirmChange.plan })} disabled={planMut.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {planMut.isPending ? 'Alterando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm suspend/reactivate */}
      {confirmSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {confirmSuspend.is_active ? '⚠️ Suspender organização' : '✅ Reativar organização'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {confirmSuspend.is_active
                ? <>Suspender <strong>{confirmSuspend.name}</strong> bloqueará o acesso de todos os membros imediatamente.</>
                : <>Reativar <strong>{confirmSuspend.name}</strong> restaurará o acesso para todos os membros.</>}
            </p>
            {confirmSuspend.is_active && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Motivo da suspensão (opcional)</label>
                <input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Ex: Inadimplência, violação de termos..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setConfirmSuspend(null); setSuspendReason(''); }}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => suspendMut.mutate({ slug: confirmSuspend.slug, suspend: confirmSuspend.is_active, reason: suspendReason || undefined })}
                disabled={suspendMut.isPending}
                className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-colors ${confirmSuspend.is_active ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}>
                {suspendMut.isPending ? 'Aguarde…' : confirmSuspend.is_active ? 'Suspender' : 'Reativar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes editor */}
      {editingNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <StickyNote size={16} className="text-indigo-500" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Notas do Parceiro</h3>
            </div>
            <p className="text-xs text-gray-400">Notas internas visíveis apenas para administradores (SLA, contato comercial, condições especiais…)</p>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              rows={5}
              placeholder="Ex: Contato comercial: João Silva (11) 99999-9999. SLA 99.9%. Desconto de 15% negociado em jan/2026."
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingNotes(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => notesMut.mutate({ slug: editingNotes, notes: notesValue })} disabled={notesMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.97]">
                {notesMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


/* ── Billing Modal ───────────────────────────────────────────────────────── */

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

const BillingModal = ({ existing, orgs, onClose, onSave, isSaving }) => {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    client_name:       existing?.client_name       || '',
    client_email:      existing?.client_email      || '',
    org_id:            existing?.org_id            || '',
    amount:            existing?.amount            || '',
    period_type:       existing?.period_type       || 'monthly',
    period_ref:        existing?.period_ref        || '',
    due_date:          existing?.due_date          ? existing.due_date.slice(0, 10) : '',
    paid_at:           existing?.paid_at           ? existing.paid_at.slice(0, 10) : '',
    status:            existing?.status            || 'pending',
    notes:             existing?.notes             || '',
    is_recurring:      existing?.is_recurring      ?? false,
    recurrence_months: existing?.recurrence_months ?? 1,
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      amount: parseFloat(form.amount),
      client_email: form.client_email || null,
      org_id: form.org_id || null,
      due_date: form.due_date || null,
      paid_at: form.paid_at || null,
      recurrence_months: form.is_recurring ? parseInt(form.recurrence_months, 10) : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Editar Cobrança' : 'Nova Cobrança'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Client name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Nome do Cliente <span className="text-red-500">*</span>
            </label>
            <input value={form.client_name} onChange={(e) => set('client_name', e.target.value)} required
              placeholder="Ex: Cliente X" className={inputCls} />
            <p className="mt-1 text-xs text-gray-400">Nome da empresa/pessoa que realiza o pagamento</p>
          </div>

          {/* Client email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email do Cliente <Mail className="inline w-3.5 h-3.5 text-gray-400 ml-1" />
            </label>
            <input type="email" value={form.client_email} onChange={(e) => set('client_email', e.target.value)}
              placeholder="cliente@empresa.com" className={inputCls} />
            <p className="mt-1 text-xs text-gray-400">Para envio de cobranças. Se vazio, usa o email do owner da organização vinculada.</p>
          </div>

          {/* Organization */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Organização Vinculada</label>
            <select value={form.org_id} onChange={(e) => set('org_id', e.target.value)} className={inputCls}>
              <option value="">— Nenhuma —</option>
              {orgs.filter((o) => !o.parent_org_id).map((o) => (
                <option key={o.id} value={o.id}>{o.name} ({o.plan_tier})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Valor (R$) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} required placeholder="0,00" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tipo de Período</label>
              <select value={form.period_type} onChange={(e) => set('period_type', e.target.value)} className={inputCls}>
                <option value="monthly">Mensal</option>
                <option value="annual">Anual</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Referência <span className="text-red-500">*</span></label>
              <input value={form.period_ref} onChange={(e) => set('period_ref', e.target.value)} required
                placeholder={form.period_type === 'monthly' ? '2026-03' : '2026'} className={inputCls} />
              <p className="mt-1 text-xs text-gray-400">{form.period_type === 'monthly' ? 'Formato: YYYY-MM' : 'Formato: YYYY'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                <option value="pending">Pendente</option>
                <option value="paid">Pago</option>
                <option value="overdue">Em atraso</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Vencimento</label>
              <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Data do Pagamento</label>
              <input type="date" value={form.paid_at} onChange={(e) => set('paid_at', e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Recurrence */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_recurring}
                onChange={(e) => set('is_recurring', e.target.checked)}
                className="w-4 h-4 rounded accent-primary"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cobrança Recorrente</span>
                <p className="text-xs text-gray-400">Gera próxima cobrança automaticamente ao marcar como pago</p>
              </div>
            </label>
            {form.is_recurring && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Frequência de Renovação</label>
                <select value={form.recurrence_months} onChange={(e) => set('recurrence_months', e.target.value)} className={inputCls}>
                  <option value={1}>Mensal (a cada 1 mês)</option>
                  <option value={3}>Trimestral (a cada 3 meses)</option>
                  <option value={6}>Semestral (a cada 6 meses)</option>
                  <option value={12}>Anual (a cada 12 meses)</option>
                </select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Observações</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
              placeholder="Notas internas sobre esta cobrança..."
              className={`${inputCls} resize-none`} />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Cancelar</button>
            <button type="submit" disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.97]">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {isSaving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Cobrança'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


/* ── Billing History Modal ────────────────────────────────────────────────── */

const STATUS_LABELS = {
  pending:   { label: 'Pendente',   cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  paid:      { label: 'Pago',       cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  overdue:   { label: 'Em atraso',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Cancelado',  cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

const BillingHistoryModal = ({ recordId, clientName, onClose }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['billing-history', recordId],
    queryFn: () => adminService.getBillingHistory(recordId),
    enabled: !!recordId,
  });

  const history = data?.history || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Histórico de Status</h2>
              <p className="text-xs text-gray-400">{clientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : history.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Sem histórico registrado</p>
          ) : (
            <div className="relative pl-4">
              {/* vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="space-y-4">
                {history.map((h, i) => {
                  const oldSt = STATUS_LABELS[h.old_status];
                  const newSt = STATUS_LABELS[h.new_status] || { label: h.new_status, cls: 'bg-gray-100 text-gray-500' };
                  return (
                    <div key={h.id} className="relative flex gap-3">
                      <div className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded-full bg-white dark:bg-gray-800 border-2 border-primary z-10" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {oldSt ? (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${oldSt.cls}`}>{oldSt.label}</span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">criado</span>
                          )}
                          {oldSt && <span className="text-xs text-gray-400">→</span>}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${newSt.cls}`}>{newSt.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {new Date(h.changed_at).toLocaleString('pt-BR')}
                          {' — '}
                          <span className="font-medium">{h.changed_by_name || 'Sistema'}</span>
                        </p>
                        {h.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">{h.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


/* ── Billing Tab ─────────────────────────────────────────────────────────── */

const RECURRENCE_LABEL = { 1: 'Mensal', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };

const BillingTab = ({ orgs }) => {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [historyRecord, setHistoryRecord] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchAction, setBatchAction] = useState('');
  const fileInputRef = useRef(null);
  const [pendingUploadId, setPendingUploadId] = useState(null);

  const { data: summaryData } = useQuery({
    queryKey: ['admin-billing-summary'],
    queryFn: () => adminService.getBillingSummary(),
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-billing', statusFilter, search],
    queryFn: () => adminService.listBilling({ status: statusFilter || undefined, search: search || undefined }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-billing'] });
    qc.invalidateQueries({ queryKey: ['admin-billing-summary'] });
    qc.invalidateQueries({ queryKey: ['billing-analytics'] });
  };

  const createMut = useMutation({
    mutationFn: (d) => adminService.createBilling(d),
    onSuccess: () => { invalidateAll(); setShowModal(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => adminService.updateBilling(id, data),
    onSuccess: () => { invalidateAll(); setEditRecord(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => adminService.deleteBilling(id),
    onSuccess: () => invalidateAll(),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => adminService.patchBillingStatus(id, status),
    onSuccess: () => invalidateAll(),
  });

  const batchStatusMut = useMutation({
    mutationFn: ({ ids, status }) => adminService.batchUpdateStatus(ids, status),
    onSuccess: () => { invalidateAll(); setSelectedIds(new Set()); setBatchAction(''); },
  });

  const batchGenerateMut = useMutation({
    mutationFn: () => adminService.batchGenerateRecurring(),
    onSuccess: (res) => { invalidateAll(); alert(`${res.generated} cobranças geradas com sucesso.`); },
  });

  const sendInvoiceMut = useMutation({
    mutationFn: (id) => adminService.sendInvoiceEmail(id),
    onSuccess: (res) => { invalidateAll(); alert(`Cobrança enviada para ${res.sent_to}`); },
    onError: (err) => alert(err.response?.data?.detail || 'Erro ao enviar email'),
  });

  const sendRemindersMut = useMutation({
    mutationFn: () => adminService.sendReminders(),
    onSuccess: (res) => {
      invalidateAll();
      alert(`${res.sent} lembretes enviados. ${res.auto_overdue_marked} marcados como atrasado.`);
    },
  });

  const sendStatusMut = useMutation({
    mutationFn: (id) => adminService.sendStatusEmail(id),
    onSuccess: (res) => alert(`Notificação enviada para ${res.sent_to}`),
    onError: (err) => alert(err.response?.data?.detail || 'Erro ao enviar email'),
  });

  const records = data?.records || [];
  const s = summaryData;

  const handleUploadClick = (id) => {
    setPendingUploadId(id);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUploadId) return;
    setUploading(pendingUploadId);
    try {
      await adminService.uploadBillingAttachment(pendingUploadId, file);
      invalidateAll();
    } finally {
      setUploading(null);
      e.target.value = '';
      setPendingUploadId(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await adminService.exportBillingCsv({
        status: statusFilter || undefined,
        search: search || undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map((r) => r.id)));
    }
  };

  const handleBatchAction = () => {
    if (!batchAction || selectedIds.size === 0) return;
    if (confirm(`Alterar ${selectedIds.size} cobranças para "${batchAction}"?`)) {
      batchStatusMut.mutate({ ids: [...selectedIds], status: batchAction });
    }
  };

  const daysUntilDue = (dueDate) => {
    if (!dueDate) return null;
    const diff = Math.ceil((new Date(dueDate) - new Date()) / 86400000);
    return diff;
  };

  return (
    <div className="space-y-5">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />

      {/* Financial KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'MRR',         value: fmtBRL(s?.mrr),           color: 'blue',   tip: 'Receita mensal recorrente' },
          { label: 'ARR',         value: fmtBRL(s?.arr),           color: 'blue',   tip: 'Receita anual projetada' },
          { label: 'A Receber',   value: fmtBRL(s?.total_pending), color: 'yellow', tip: 'Total pendente' },
          { label: 'Em Atraso',   value: fmtBRL(s?.total_overdue), color: 'red',    tip: `${s?.overdue_count ?? 0} cobranças` },
          { label: 'Pago (30d)',  value: fmtBRL(s?.total_paid_30d),color: 'green',  tip: 'Recebido nos últimos 30 dias' },
          { label: 'Clientes',    value: s?.active_clients ?? '—', color: 'gray',   tip: 'Clientes ativos' },
        ].map(({ label, value, color, tip }) => (
          <div key={label} title={tip} className={`rounded-xl border p-3 ${
            color === 'blue'   ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800/30' :
            color === 'yellow' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800/30' :
            color === 'red'    ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800/30' :
            color === 'green'  ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800/30' :
            'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
          }`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
            <p className={`text-base font-bold truncate ${
              color === 'blue'   ? 'text-blue-700 dark:text-blue-400' :
              color === 'yellow' ? 'text-yellow-700 dark:text-yellow-400' :
              color === 'red'    ? 'text-red-700 dark:text-red-400' :
              color === 'green'  ? 'text-green-700 dark:text-green-400' :
              'text-gray-800 dark:text-gray-200'
            }`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Analytics toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowAnalytics((v) => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
            showAnalytics
              ? 'border-indigo-400 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <TrendingUp size={13} />
          {showAnalytics ? 'Ocultar Dashboard' : 'Dashboard Financeiro'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => sendRemindersMut.mutate()}
            disabled={sendRemindersMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-300 dark:hover:border-amber-700 transition-colors disabled:opacity-50"
            title="Envia lembretes para cobranças próximas do vencimento e em atraso"
          >
            {sendRemindersMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
            Enviar Lembretes
          </button>
          <button
            onClick={() => batchGenerateMut.mutate()}
            disabled={batchGenerateMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors disabled:opacity-50"
            title="Gerar cobranças recorrentes pendentes"
          >
            {batchGenerateMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Gerar Recorrências
          </button>
          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <Settings size={12} /> Configuração
          </button>
        </div>
      </div>

      {/* Analytics panel */}
      {showAnalytics && <BillingAnalytics />}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary">
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="paid">Pago</option>
          <option value="overdue">Em atraso{s?.overdue_count ? ` (${s.overdue_count})` : ''}</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 bg-white dark:bg-gray-800 transition-colors disabled:opacity-50">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
          Exportar CSV
        </button>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-all active:scale-[0.97]">
          <Plus className="w-4 h-4" /> Nova Cobrança
        </button>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 rounded-xl animate-fade-in">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
            {selectedIds.size} selecionada{selectedIds.size > 1 ? 's' : ''}
          </span>
          <select
            value={batchAction}
            onChange={(e) => setBatchAction(e.target.value)}
            className="rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="">Ação em lote...</option>
            <option value="paid">Marcar como Pago</option>
            <option value="overdue">Marcar como Em Atraso</option>
            <option value="pending">Marcar como Pendente</option>
            <option value="cancelled">Cancelar</option>
          </select>
          <button
            onClick={handleBatchAction}
            disabled={!batchAction || batchStatusMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {batchStatusMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            Aplicar
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors ml-auto"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {/* Records table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <DollarSign size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma cobrança registrada</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <th className="py-3 px-3 w-8">
                  <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {selectedIds.size === records.length && records.length > 0
                      ? <CheckSquare size={15} className="text-primary" />
                      : <Square size={15} />}
                  </button>
                </th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Cliente</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Organização</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Valor</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Período</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Vencimento</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Comprovante</th>
                <th className="py-3 px-4 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {records.map((r) => {
                const st = BILLING_STATUS[r.status] || BILLING_STATUS.pending;
                const daysLeft = daysUntilDue(r.due_date);
                const isSelected = selectedIds.has(r.id);
                return (
                  <tr key={r.id} className={`transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/50 dark:bg-indigo-900/10'
                      : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                  }`}>
                    <td className="py-3 px-3">
                      <button onClick={() => toggleSelect(r.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        {isSelected
                          ? <CheckSquare size={15} className="text-primary" />
                          : <Square size={15} />}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.client_name}</p>
                      {r.client_email && (
                        <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5" title={r.client_email}>
                          <Mail size={9} /> {r.client_email}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {r.is_recurring && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                            <RefreshCw size={8} /> {RECURRENCE_LABEL[r.recurrence_months] || 'Recorrente'}
                          </span>
                        )}
                        {r.notes && <p className="text-xs text-gray-400 truncate max-w-[120px]" title={r.notes}>{r.notes}</p>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {r.org_name ? (
                        <div>
                          <p className="text-gray-700 dark:text-gray-300 text-xs font-medium">{r.org_name}</p>
                          <p className="text-gray-400 text-xs font-mono">{r.org_slug}</p>
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmtBRL(r.amount)}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                      <span>{r.period_type === 'monthly' ? 'Mensal' : 'Anual'}</span>
                      <span className="ml-1 font-mono text-gray-500">· {r.period_ref}</span>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <p className="text-gray-500">{fmtDate(r.due_date)}</p>
                      {r.paid_at ? (
                        <p className="text-green-600 dark:text-green-400">Pago: {fmtDate(r.paid_at)}</p>
                      ) : r.status === 'overdue' && daysLeft !== null ? (
                        <p className="text-red-500 font-semibold">{Math.abs(daysLeft)}d atrasado</p>
                      ) : r.status === 'pending' && daysLeft !== null && daysLeft <= 3 && daysLeft >= 0 ? (
                        <p className="text-amber-500">Vence em {daysLeft}d</p>
                      ) : null}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={r.status}
                        onChange={(e) => statusMut.mutate({ id: r.id, status: e.target.value })}
                        disabled={statusMut.isPending}
                        className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40 ${st.cls}`}
                      >
                        <option value="pending">Pendente</option>
                        <option value="paid">Pago</option>
                        <option value="overdue">Em atraso</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      {r.has_attachment ? (
                        <div className="flex items-center gap-1.5">
                          <a href={adminService.downloadBillingAttachment(r.id)}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-primary hover:underline">
                            <Download size={12} /> Baixar
                          </a>
                          <button onClick={() => handleUploadClick(r.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title="Substituir">
                            <Paperclip size={12} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => handleUploadClick(r.id)} disabled={uploading === r.id}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary border border-dashed border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 transition-colors disabled:opacity-50">
                          {uploading === r.id ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
                          Anexar
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => sendInvoiceMut.mutate(r.id)}
                          disabled={sendInvoiceMut.isPending}
                          title={r.client_email ? `Enviar cobrança para ${r.client_email}` : 'Enviar cobrança por email'}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50">
                          {sendInvoiceMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                        </button>
                        {r.status !== 'pending' && (
                          <button
                            onClick={() => sendStatusMut.mutate(r.id)}
                            disabled={sendStatusMut.isPending}
                            title="Notificar status por email"
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors disabled:opacity-50">
                            {sendStatusMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                          </button>
                        )}
                        <button onClick={() => setHistoryRecord(r)} title="Histórico"
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                          <History size={13} />
                        </button>
                        <button onClick={() => setEditRecord(r)} title="Editar"
                          className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => { if (confirm(`Excluir cobrança de ${r.client_name}?`)) deleteMut.mutate(r.id); }}
                          title="Excluir"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <BillingModal orgs={orgs} onClose={() => setShowModal(false)}
          onSave={(d) => createMut.mutate(d)} isSaving={createMut.isPending} />
      )}
      {editRecord && (
        <BillingModal existing={editRecord} orgs={orgs} onClose={() => setEditRecord(null)}
          onSave={(d) => updateMut.mutate({ id: editRecord.id, data: d })} isSaving={updateMut.isPending} />
      )}
      {historyRecord && (
        <BillingHistoryModal
          recordId={historyRecord.id}
          clientName={historyRecord.client_name}
          onClose={() => setHistoryRecord(null)}
        />
      )}
      {showConfig && <BillingConfigModal onClose={() => setShowConfig(false)} />}
    </div>
  );
};


/* ── Main Page ───────────────────────────────────────────────────────────── */

const AdminPanel = () => {
  const [tab, setTab] = useState('leads');

  // Pre-fetch orgs for billing org selector
  const { data: orgsData } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: () => adminService.listOrgs(),
    staleTime: 120_000,
  });
  const allOrgs = orgsData?.orgs || [];

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
            <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie leads, organizações e faturamento</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'leads',   label: 'Leads Enterprise', icon: Users },
            { id: 'orgs',    label: 'Organizações',      icon: Building2 },
            { id: 'billing', label: 'Faturamento',        icon: CreditCard },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'leads'   && <LeadsTab />}
        {tab === 'orgs'    && <OrgsTab />}
        {tab === 'billing' && <BillingTab orgs={allOrgs} />}
      </div>
    </Layout>
  );
};

export default AdminPanel;
