import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Users, Building2, ChevronDown, Search, Check } from 'lucide-react';
import Layout from '../components/layout/layout';
import adminService from '../services/adminService';

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
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Nome</th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">E-mail</th>
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
                return (
                  <tr key={lead.id} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{lead.name}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{lead.email}</td>
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
                    <td className="py-3 px-4 relative">
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Message preview panel */}
      {leads.some((l) => l.message) && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Passe o mouse sobre um lead para ver a mensagem completa.
        </p>
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
        {tab === 'leads' ? <LeadsTab /> : <OrgsTab />}
      </div>
    </Layout>
  );
};

export default AdminPanel;
