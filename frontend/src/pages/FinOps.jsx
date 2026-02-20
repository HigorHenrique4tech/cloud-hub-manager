import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, TrendingDown, History, Wallet, AlertTriangle, Plus, Trash2, X } from 'lucide-react';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import PermissionGate from '../components/common/PermissionGate';
import PlanGate from '../components/common/PlanGate';
import WasteSummary from '../components/finops/WasteSummary';
import RecommendationCard from '../components/finops/RecommendationCard';
import ActionTimeline from '../components/finops/ActionTimeline';
import finopsService from '../services/finopsService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';

const TABS = [
  { id: 'recommendations', label: 'Recomendações', icon: TrendingDown },
  { id: 'budgets',         label: 'Orçamentos',     icon: Wallet },
  { id: 'actions',         label: 'Histórico',      icon: History },
];

const FILTER_STATUS   = ['pending', 'applied', 'dismissed'];
const FILTER_PROVIDER = ['aws', 'azure'];

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── Budget Modal ─────────────────────────────────────────────────────────── */

const BudgetModal = ({ onClose, onSave, saving }) => {
  const [form, setForm] = useState({ name: '', provider: 'all', amount: '', period: 'monthly', alert_threshold: 80 });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    onSave({ ...form, amount: parseFloat(form.amount), alert_threshold: form.alert_threshold / 100 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">Novo Orçamento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: AWS Production Q1"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => set('provider', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">Todos</option>
                <option value="aws">AWS</option>
                <option value="azure">Azure</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Período</label>
              <select
                value={form.period}
                onChange={(e) => set('period', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <option value="monthly">Mensal</option>
                <option value="quarterly">Trimestral</option>
                <option value="annual">Anual</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Valor (USD)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="1000.00"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Alerta em {form.alert_threshold}% do orçamento
            </label>
            <input
              type="range"
              min="50"
              max="100"
              step="5"
              value={form.alert_threshold}
              onChange={(e) => set('alert_threshold', parseInt(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors">
              {saving ? 'Salvando…' : 'Criar Orçamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ── Main Page ────────────────────────────────────────────────────────────── */

const FinOps = () => {
  const qc = useQueryClient();
  const { currentOrg } = useOrgWorkspace();
  const planTier = (currentOrg?.plan_tier || 'free').toLowerCase();

  const [activeTab, setActiveTab]       = useState('recommendations');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterProvider, setFilterProvider] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [applyingId, setApplyingId]   = useState(null);
  const [dismissingId, setDismissingId] = useState(null);
  const [rollbackId, setRollbackId]   = useState(null);

  /* ── Queries ── */

  const summaryQ = useQuery({
    queryKey: ['finops-summary'],
    queryFn: finopsService.getSummary,
    refetchInterval: 60_000,
  });

  const recsQ = useQuery({
    queryKey: ['finops-recs', filterStatus, filterProvider, filterSeverity],
    queryFn: () => finopsService.getRecommendations({
      status:   filterStatus   || undefined,
      provider: filterProvider || undefined,
      severity: filterSeverity || undefined,
    }),
    enabled: activeTab === 'recommendations',
  });

  const actionsQ = useQuery({
    queryKey: ['finops-actions'],
    queryFn: finopsService.getActions,
    enabled: activeTab === 'actions',
  });

  const isPro = ['pro', 'enterprise'].includes(planTier);

  const budgetsQ = useQuery({
    queryKey: ['finops-budgets'],
    queryFn: finopsService.getBudgets,
    enabled: activeTab === 'budgets' && isPro,
  });

  const anomaliesQ = useQuery({
    queryKey: ['finops-anomalies'],
    queryFn: finopsService.getAnomalies,
    enabled: isPro,
  });

  /* ── Mutations ── */

  const scanMut = useMutation({
    mutationFn: () => finopsService.triggerScan(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
    },
  });

  const applyMut = useMutation({
    mutationFn: finopsService.applyRecommendation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      qc.invalidateQueries({ queryKey: ['finops-actions'] });
      setApplyingId(null);
    },
    onError: () => setApplyingId(null),
  });

  const dismissMut = useMutation({
    mutationFn: finopsService.dismissRecommendation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      setDismissingId(null);
    },
    onError: () => setDismissingId(null),
  });

  const rollbackMut = useMutation({
    mutationFn: finopsService.rollbackAction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-actions'] });
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      setRollbackId(null);
    },
    onError: () => setRollbackId(null),
  });

  const createBudgetMut = useMutation({
    mutationFn: finopsService.createBudget,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-budgets'] });
      setShowBudgetModal(false);
    },
  });

  const deleteBudgetMut = useMutation({
    mutationFn: finopsService.deleteBudget,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-budgets'] }),
  });

  /* ── Handlers ── */

  const handleApply = (id) => {
    setApplyingId(id);
    applyMut.mutate(id);
  };

  const handleDismiss = (id) => {
    setDismissingId(id);
    dismissMut.mutate(id);
  };

  const handleRollback = (id) => {
    setRollbackId(id);
    rollbackMut.mutate(id);
  };

  /* ── Render ── */

  return (
    <Layout>
      <div className="min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/20">
            <Zap size={22} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">FinOps</h1>
            <p className="text-sm text-slate-400">Detecte desperdício e aplique economias reais na sua infraestrutura</p>
          </div>
        </div>

        {/* Hero summary */}
        <PermissionGate permission="finops.view">
          {summaryQ.isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : (
            <WasteSummary
              summary={summaryQ.data}
              onScan={() => scanMut.mutate()}
              scanning={scanMut.isPending}
            />
          )}
        </PermissionGate>

        {/* Scan result toast */}
        {scanMut.isSuccess && scanMut.data && (
          <div className="flex items-center gap-2 rounded-lg border border-green-700/40 bg-green-900/20 px-4 py-2.5 text-sm text-green-300">
            <Zap size={14} />
            Scan concluído: <strong>{scanMut.data.new_findings}</strong> novos desperdícios detectados.
          </div>
        )}
        {scanMut.isError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-700/40 bg-red-900/20 px-4 py-2.5 text-sm text-red-300">
            <AlertTriangle size={14} />
            Erro ao escanear. Verifique as credenciais da conta cloud.
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-slate-700">
          <nav className="flex gap-1 -mb-px">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                <Icon size={15} />
                {label}
                {id === 'recommendations' && recsQ.data?.length > 0 && (
                  <span className="ml-1 rounded-full bg-indigo-600/30 px-1.5 py-0.5 text-xs font-semibold text-indigo-300">
                    {recsQ.data.filter((r) => r.status === 'pending').length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Recommendations Tab ── */}
        {activeTab === 'recommendations' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-lg border border-slate-700 overflow-hidden">
                <button
                  onClick={() => setFilterStatus('')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${!filterStatus ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Todas
                </button>
                {FILTER_STATUS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
                    className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors border-l border-slate-700 ${filterStatus === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    {s === 'pending' ? 'Pendente' : s === 'applied' ? 'Aplicada' : 'Ignorada'}
                  </button>
                ))}
              </div>

              <div className="flex rounded-lg border border-slate-700 overflow-hidden">
                {FILTER_PROVIDER.map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilterProvider(p === filterProvider ? '' : p)}
                    className={`px-3 py-1.5 text-xs font-medium uppercase transition-colors ${p !== FILTER_PROVIDER[0] ? 'border-l border-slate-700' : ''} ${filterProvider === p ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex rounded-lg border border-slate-700 overflow-hidden">
                {['high', 'medium', 'low'].map((sev, i) => (
                  <button
                    key={sev}
                    onClick={() => setFilterSeverity(sev === filterSeverity ? '' : sev)}
                    className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${i > 0 ? 'border-l border-slate-700' : ''} ${filterSeverity === sev ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    {sev === 'high' ? 'Alta' : sev === 'medium' ? 'Média' : 'Baixa'}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            {recsQ.isLoading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : recsQ.isError ? (
              <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
                Erro ao carregar recomendações. Verifique as permissões.
              </div>
            ) : recsQ.data?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <TrendingDown size={40} className="mb-3 opacity-20" />
                <p className="text-base font-medium">Nenhuma recomendação encontrada</p>
                <p className="text-sm mt-1">Clique em "Escanear Agora" para detectar desperdícios</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recsQ.data.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    rec={rec}
                    onApply={handleApply}
                    onDismiss={handleDismiss}
                    applyLoading={applyingId === rec.id}
                    dismissLoading={dismissingId === rec.id}
                    planTier={planTier}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Budgets Tab ── */}
        {activeTab === 'budgets' && (
          <div className="space-y-4">
            <PlanGate minPlan="pro" feature="Orçamentos">
              <div className="flex justify-end">
                <PermissionGate permission="finops.budget">
                  <button
                    onClick={() => setShowBudgetModal(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                  >
                    <Plus size={16} />
                    Novo Orçamento
                  </button>
                </PermissionGate>
              </div>

              {budgetsQ.isLoading ? (
                <div className="flex justify-center py-12"><LoadingSpinner /></div>
              ) : budgetsQ.isError ? (
                <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
                  Erro ao carregar orçamentos.
                </div>
              ) : (budgetsQ.data ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <Wallet size={40} className="mb-3 opacity-20" />
                  <p className="text-base font-medium">Nenhum orçamento criado</p>
                  <p className="text-sm mt-1">Defina limites de custo para receber alertas automáticos</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(budgetsQ.data ?? []).map((budget) => {
                    const pct = 0; // real spend TBD via cost API
                    const barColor = pct >= budget.alert_threshold * 100
                      ? 'bg-red-500'
                      : pct >= (budget.alert_threshold * 100 * 0.75)
                        ? 'bg-yellow-500'
                        : 'bg-green-500';

                    const PERIOD_LABEL = { monthly: 'Mensal', quarterly: 'Trimestral', annual: 'Anual' };
                    return (
                      <div key={budget.id} className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-100">{budget.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {budget.provider === 'all' ? 'Todos' : budget.provider.toUpperCase()} · {PERIOD_LABEL[budget.period]}
                            </p>
                          </div>
                          <PermissionGate permission="finops.budget">
                            <button
                              onClick={() => deleteBudgetMut.mutate(budget.id)}
                              className="text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </PermissionGate>
                        </div>

                        <p className="mt-3 text-2xl font-bold text-slate-100">{fmtUSD(budget.amount)}</p>

                        {/* Progress bar */}
                        <div className="mt-3 space-y-1">
                          <div className="h-2 w-full rounded-full bg-slate-700">
                            <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Alerta em {Math.round(budget.alert_threshold * 100)}%</span>
                            <span>Limite: {fmtUSD(budget.amount)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </PlanGate>
          </div>
        )}

        {/* ── Actions Tab ── */}
        {activeTab === 'actions' && (
          <div className="space-y-3">
            {actionsQ.isLoading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : (
              <ActionTimeline
                actions={actionsQ.data || []}
                onRollback={handleRollback}
                rollbackLoading={rollbackId}
                planTier={planTier}
              />
            )}
          </div>
        )}

        {/* Budget modal */}
        {showBudgetModal && (
          <BudgetModal
            onClose={() => setShowBudgetModal(false)}
            onSave={(payload) => createBudgetMut.mutate(payload)}
            saving={createBudgetMut.isPending}
          />
        )}
      </div>
    </Layout>
  );
};

export default FinOps;
