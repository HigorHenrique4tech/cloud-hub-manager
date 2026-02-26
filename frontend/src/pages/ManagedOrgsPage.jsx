import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, ExternalLink, Trash2, X, Users, Layers, Cloud, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import orgService from '../services/orgService';

/* ── Add Partner Modal ───────────────────────────────────────────────────── */

const AddPartnerModal = ({ onClose, onSave, saving }) => {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Adicionar Organização Parceira</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Nome da organização</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
              placeholder="Ex: TechCorp Solutions"
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">
              Um workspace padrão será criado automaticamente. Você será adicionado como owner.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => name.trim() && onSave(name.trim())}
              disabled={saving || !name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Criando…' : 'Criar Parceira'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Remove Confirm Modal ───────────────────────────────────────────────── */

const RemoveConfirmModal = ({ org, onClose, onConfirm, removing }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertTriangle size={20} className="text-red-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Remover organização parceira?</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{org.name}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 dark:text-slate-300">
        A organização será desvinculada e seu plano será revertido para <strong>Free</strong>. Os dados internos não serão apagados.
      </p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={removing}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 transition-colors"
        >
          {removing ? 'Removendo…' : 'Remover'}
        </button>
      </div>
    </div>
  </div>
);

/* ── Partner Org Card ────────────────────────────────────────────────────── */

const PartnerCard = ({ org, onAccess, onRemove }) => {
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5 flex flex-col gap-4 hover:border-gray-300 dark:hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/10">
            <Building2 size={18} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{org.name}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">{org.slug}</p>
          </div>
        </div>
        <button
          onClick={() => onRemove(org)}
          className="text-gray-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
          title="Remover parceira"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 dark:bg-slate-700/50 px-2 py-1.5 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-slate-100">{org.workspaces_count}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 flex items-center justify-center gap-0.5">
            <Layers size={9} /> Workspaces
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-slate-700/50 px-2 py-1.5 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-slate-100">{org.cloud_accounts_count}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 flex items-center justify-center gap-0.5">
            <Cloud size={9} /> Contas
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-slate-700/50 px-2 py-1.5 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-slate-100">{org.members_count}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 flex items-center justify-center gap-0.5">
            <Users size={9} /> Membros
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-slate-500">Criada em {fmtDate(org.created_at)}</p>
        <button
          onClick={() => onAccess(org)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Acessar
          <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
};

/* ── Main Page ───────────────────────────────────────────────────────────── */

const ManagedOrgsPage = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { currentOrg, switchOrg, refreshOrgs } = useOrgWorkspace();

  const [showAddModal, setShowAddModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  const orgsQ = useQuery({
    queryKey: ['managed-orgs', currentOrg?.slug],
    queryFn: () => orgService.listManagedOrgs(currentOrg.slug),
    enabled: Boolean(currentOrg?.slug),
    retry: false,
  });

  const summaryQ = useQuery({
    queryKey: ['managed-orgs-summary', currentOrg?.slug],
    queryFn: () => orgService.getManagedOrgsSummary(currentOrg.slug),
    enabled: Boolean(currentOrg?.slug),
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: (name) => orgService.createManagedOrg(currentOrg.slug, name),
    onSuccess: async (data) => {
      await refreshOrgs();
      qc.invalidateQueries({ queryKey: ['managed-orgs'] });
      qc.invalidateQueries({ queryKey: ['managed-orgs-summary'] });
      setShowAddModal(false);
      // Switch to new partner org
      await switchOrg(data.slug);
      navigate('/');
    },
  });

  const removeMut = useMutation({
    mutationFn: (partnerSlug) => orgService.removeManagedOrg(currentOrg.slug, partnerSlug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['managed-orgs'] });
      qc.invalidateQueries({ queryKey: ['managed-orgs-summary'] });
      setRemoveTarget(null);
    },
  });

  const summary = summaryQ.data;
  const managedOrgs = orgsQ.data?.managed_orgs || [];

  if (orgsQ.isError) {
    return (
      <Layout>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
            Acesso negado. Esta funcionalidade requer plano Enterprise.
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/20">
              <Building2 size={22} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Organizações Gerenciadas</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Gerencie organizações parceiras vinculadas à sua conta Enterprise
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus size={16} />
            Adicionar Parceira
          </button>
        </div>

        {/* Summary bar */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Organizações', value: summary.total_partners, sub: `${summary.base_included_orgs} incluídas no plano` },
              { label: 'Workspaces', value: summary.total_workspaces, sub: 'em todas as parceiras' },
              { label: 'Contas cloud', value: summary.total_cloud_accounts, sub: 'em todas as parceiras' },
              { label: 'Membros', value: summary.total_members, sub: 'em todas as parceiras' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</p>
                <p className="text-sm font-medium text-gray-600 dark:text-slate-300 mt-0.5">{label}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add-on pricing info */}
        {summary && summary.extra_orgs > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
            <strong>{summary.extra_orgs}</strong> org{summary.extra_orgs > 1 ? 's' : ''} adicional{summary.extra_orgs > 1 ? 'is' : ''} além das {summary.base_included_orgs} incluídas
            {' '}· <strong>R$ {summary.extra_cost_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</strong> em add-ons
          </div>
        )}

        {/* Orgs grid */}
        {orgsQ.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : managedOrgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-slate-500">
            <Building2 size={48} className="mb-4 opacity-20" />
            <p className="text-base font-medium">Nenhuma organização parceira ainda</p>
            <p className="text-sm mt-1 mb-4">Adicione parceiros para gerenciar suas infraestruturas centralizadamente</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              <Plus size={15} />
              Adicionar primeira parceira
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {managedOrgs.map((org) => (
              <PartnerCard
                key={org.id}
                org={org}
                onAccess={async (o) => {
                  await switchOrg(o.slug);
                  navigate('/');
                }}
                onRemove={setRemoveTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddPartnerModal
          onClose={() => setShowAddModal(false)}
          onSave={(name) => createMut.mutate(name)}
          saving={createMut.isPending}
        />
      )}
      {removeTarget && (
        <RemoveConfirmModal
          org={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => removeMut.mutate(removeTarget.slug)}
          removing={removeMut.isPending}
        />
      )}
    </Layout>
  );
};

export default ManagedOrgsPage;
