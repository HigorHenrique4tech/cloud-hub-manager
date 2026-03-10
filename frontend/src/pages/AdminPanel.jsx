import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Users, Building2, ChevronDown, ChevronUp, Search, Check,
  Phone, MessageSquare, Mail, Calendar, Loader2, ArrowRight,
  DollarSign, Plus, Pencil, Trash2, Paperclip, Download, X,
  ChevronRight, AlertCircle, CheckCircle2, Clock, Ban, CreditCard,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import adminService from '../services/adminService';

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


/* ── Orgs Tab (hierarchical) ─────────────────────────────────────────────── */

const OrgsTab = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [confirmChange, setConfirmChange] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: () => adminService.listOrgs(),
  });

  const planMut = useMutation({
    mutationFn: ({ slug, plan_tier }) => adminService.setOrgPlan(slug, plan_tier),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-orgs'] }); setOpenMenu(null); setConfirmChange(null); },
  });

  const allOrgs = data?.orgs || [];

  // Build hierarchy
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

  const OrgRow = ({ org, depth = 0 }) => {
    const children = childrenOf(org.id);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(org.id);
    const visible = matchesSearch(org) || children.some(matchesSearch);
    if (!visible) return null;

    return (
      <>
        <tr className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
          <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
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
              <span className={depth > 0 ? 'text-gray-700 dark:text-gray-300' : ''}>{org.name}</span>
              {depth > 0 && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">(parceira)</span>}
            </div>
          </td>
          <td className="py-3 px-4 font-mono text-xs text-gray-500 dark:text-gray-400">{org.slug}</td>
          <td className="py-3 px-4">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_BADGE[org.plan_tier] || PLAN_BADGE.free}`}>
              {org.plan_tier}
            </span>
          </td>
          <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-xs capitalize">{org.org_type}</td>
          <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{org.members_count}</td>
          <td className="py-3 px-4 text-gray-500 text-xs">{fmtDate(org.created_at)}</td>
          <td className="py-3 px-4 relative">
            <button onClick={() => setOpenMenu(openMenu === org.id ? null : org.id)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 transition-colors">
              Alterar plano <ChevronDown size={12} />
            </button>
            {openMenu === org.id && (
              <div className="absolute right-4 top-8 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[140px]">
                {['free', 'pro', 'enterprise'].map((tier) => (
                  <button key={tier} onClick={() => { setOpenMenu(null); setConfirmChange({ slug: org.slug, name: org.name, plan: tier, current: org.plan_tier }); }}
                    disabled={org.plan_tier === tier}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 capitalize first:rounded-t-lg last:rounded-b-lg flex items-center gap-2">
                    {org.plan_tier === tier && <Check size={12} />}{tier}
                  </button>
                ))}
              </div>
            )}
          </td>
        </tr>
        {hasChildren && !isCollapsed && children.map((child) => (
          <OrgRow key={child.id} org={child} depth={depth + 1} />
        ))}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou slug..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary" />
      </div>
      <span className="text-sm text-gray-500 dark:text-gray-400">{allOrgs.length} organizações</span>

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
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {masters.map((org) => <OrgRow key={org.id} org={org} depth={0} />)}
            </tbody>
          </table>
        </div>
      )}

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
              <button onClick={() => setConfirmChange(null)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => planMut.mutate({ slug: confirmChange.slug, plan_tier: confirmChange.plan })} disabled={planMut.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {planMut.isPending ? 'Alterando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


/* ── Billing Modal ───────────────────────────────────────────────────────── */

const BillingModal = ({ existing, orgs, onClose, onSave, isSaving }) => {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    client_name:  existing?.client_name  || '',
    org_id:       existing?.org_id       || '',
    amount:       existing?.amount       || '',
    period_type:  existing?.period_type  || 'monthly',
    period_ref:   existing?.period_ref   || '',
    due_date:     existing?.due_date     ? existing.due_date.slice(0, 10) : '',
    paid_at:      existing?.paid_at      ? existing.paid_at.slice(0, 10) : '',
    status:       existing?.status       || 'pending',
    notes:        existing?.notes        || '',
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      amount: parseFloat(form.amount),
      org_id: form.org_id || null,
      due_date: form.due_date || null,
      paid_at: form.paid_at || null,
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

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Client name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Nome do Cliente <span className="text-red-500">*</span>
            </label>
            <input value={form.client_name} onChange={(e) => set('client_name', e.target.value)} required
              placeholder="Ex: Advanced Informática LTDA"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <p className="mt-1 text-xs text-gray-400">Nome da empresa/pessoa que realiza o pagamento</p>
          </div>

          {/* Organization */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Organização Vinculada
            </label>
            <select value={form.org_id} onChange={(e) => set('org_id', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">— Nenhuma —</option>
              {orgs.filter((o) => !o.parent_org_id).map((o) => (
                <option key={o.id} value={o.id}>{o.name} ({o.plan_tier})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Valor (R$) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} required
                placeholder="0,00"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>

            {/* Period type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Período</label>
              <select value={form.period_type} onChange={(e) => set('period_type', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="monthly">Mensal</option>
                <option value="annual">Anual</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Period ref */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Referência <span className="text-red-500">*</span>
              </label>
              <input value={form.period_ref} onChange={(e) => set('period_ref', e.target.value)} required
                placeholder={form.period_type === 'monthly' ? '2026-03' : '2026'}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <p className="mt-1 text-xs text-gray-400">{form.period_type === 'monthly' ? 'Formato: YYYY-MM' : 'Formato: YYYY'}</p>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="pending">Pendente</option>
                <option value="paid">Pago</option>
                <option value="overdue">Em atraso</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Due date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Vencimento</label>
              <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>

            {/* Paid at */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Data do Pagamento</label>
              <input type="date" value={form.paid_at} onChange={(e) => set('paid_at', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Observações</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
              placeholder="Notas internas sobre esta cobrança..."
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
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


/* ── Billing Tab ─────────────────────────────────────────────────────────── */

const BillingTab = ({ orgs }) => {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [uploading, setUploading] = useState(null);
  const fileInputRef = useRef(null);
  const [pendingUploadId, setPendingUploadId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-billing', statusFilter, search],
    queryFn: () => adminService.listBilling({ status: statusFilter || undefined, search: search || undefined }),
  });

  const createMut = useMutation({
    mutationFn: (d) => adminService.createBilling(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-billing'] }); setShowModal(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => adminService.updateBilling(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-billing'] }); setEditRecord(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => adminService.deleteBilling(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-billing'] }),
  });

  const records = data?.records || [];

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
      qc.invalidateQueries({ queryKey: ['admin-billing'] });
    } finally {
      setUploading(null);
      e.target.value = '';
      setPendingUploadId(null);
    }
  };

  // KPI summary
  const totalPending = records.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
  const totalPaid    = records.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
  const totalOverdue = records.filter((r) => r.status === 'overdue').reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-5">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'A receber', value: fmtBRL(totalPending), color: 'yellow' },
          { label: 'Recebido',  value: fmtBRL(totalPaid),    color: 'green' },
          { label: 'Em atraso', value: fmtBRL(totalOverdue), color: 'red' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border p-4 ${
            color === 'yellow' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800/30' :
            color === 'green'  ? 'bg-green-50  border-green-200  dark:bg-green-900/10  dark:border-green-800/30'  :
            'bg-red-50    border-red-200    dark:bg-red-900/10    dark:border-red-800/30'
          }`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            <p className={`text-xl font-bold ${
              color === 'yellow' ? 'text-yellow-700 dark:text-yellow-400' :
              color === 'green'  ? 'text-green-700  dark:text-green-400'  :
              'text-red-700    dark:text-red-400'
            }`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary">
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="paid">Pago</option>
          <option value="overdue">Em atraso</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-all active:scale-[0.97] ml-auto">
          <Plus className="w-4 h-4" /> Nova Cobrança
        </button>
      </div>

      {/* Records table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <DollarSign size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma cobrança registrada</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Cliente</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Organização</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Valor</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Período</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Vencimento</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Comprovante</th>
                <th className="py-3 px-4 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {records.map((r) => {
                const st = BILLING_STATUS[r.status] || BILLING_STATUS.pending;
                const StIcon = st.icon;
                return (
                  <tr key={r.id} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.client_name}</p>
                      {r.notes && <p className="text-xs text-gray-400 truncate max-w-[160px]" title={r.notes}>{r.notes}</p>}
                    </td>
                    <td className="py-3 px-4">
                      {r.org_name ? (
                        <div>
                          <p className="text-gray-700 dark:text-gray-300 text-xs font-medium">{r.org_name}</p>
                          <p className="text-gray-400 text-xs font-mono">{r.org_slug}</p>
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-gray-100">{fmtBRL(r.amount)}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-xs">
                      <span className="capitalize">{r.period_type === 'monthly' ? 'Mensal' : 'Anual'}</span>
                      <span className="ml-1 font-mono text-gray-500">· {r.period_ref}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {fmtDate(r.due_date)}
                      {r.paid_at && <p className="text-green-600 dark:text-green-400">Pago: {fmtDate(r.paid_at)}</p>}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                        <StIcon size={11} /> {st.label}
                      </span>
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
                            title="Substituir comprovante">
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
                      <div className="flex items-center gap-1">
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
