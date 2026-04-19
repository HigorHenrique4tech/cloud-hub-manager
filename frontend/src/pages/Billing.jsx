import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Crown, ArrowUpRight, CreditCard, Building2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import billingService from '../services/billingService';
import orgService from '../services/orgService';
import Layout from '../components/layout/layout';
import AddOnsPanel from '../components/billing/AddOnsPanel';

const PLAN_INFO = {
  free: { name: 'Free', price: 'R$ 0', color: 'gray' },
  basic: { name: 'Basic', price: 'R$ 397/mês', color: 'primary' },
  standard: { name: 'Standard', price: 'R$ 797/mês', color: 'primary' },
  enterprise_e1: { name: 'Enterprise E1', price: 'R$ 2.997/mês + add-ons', color: 'amber' },
  enterprise_e2: { name: 'Enterprise E2', price: 'R$ 4.997/mês + add-ons', color: 'amber' },
  enterprise_e3: { name: 'Enterprise E3', price: 'R$ 7.997/mês + add-ons', color: 'amber' },
  enterprise_migration: { name: 'Enterprise + Migration', price: 'R$ 4.747/mês', color: 'purple' },
};

const STATUS_BADGE = {
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  PAID: { label: 'Pago', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  EXPIRED: { label: 'Expirado', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  REFUNDED: { label: 'Reembolsado', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
};

const UsageBar = ({ label, current, max }) => {
  const pct = max ? Math.min((current / max) * 100, 100) : 0;
  const isUnlimited = max === null || max === undefined;
  const isNearLimit = max && current >= max * 0.8;

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-gray-700 dark:text-gray-300 font-medium">{label}</span>
        <span className={`font-semibold ${isNearLimit ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>
          {current} / {isUnlimited ? '∞' : max}
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isUnlimited
              ? 'bg-primary/40'
              : isNearLimit
                ? 'bg-amber-500'
                : 'bg-primary'
          }`}
          style={{ width: isUnlimited ? '10%' : `${pct}%` }}
        />
      </div>
    </div>
  );
};

const Billing = () => {
  const navigate = useNavigate();
  const { currentOrg, isMasterOrg, refreshOrgs } = useOrgWorkspace();
  const slug = currentOrg?.slug;
  const effectivePlan = currentOrg?.effective_plan || currentOrg?.plan_tier || 'free';
  const isEnterprise = effectivePlan.startsWith('enterprise');
  const trial = currentOrg?.trial || {};
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [selectedDowngradePlan, setSelectedDowngradePlan] = useState(null);
  const qc = useQueryClient();

  const AVAILABLE_DOWNGRADE_PLANS = ['free', 'basic', 'standard', 'enterprise_e1', 'enterprise_e2', 'enterprise_e3'];
  const planLabels = {
    free: 'Free',
    basic: 'Basic - R$ 397/mês',
    standard: 'Standard - R$ 797/mês',
    enterprise_e1: 'Enterprise E1 - R$ 2.997/mês',
    enterprise_e2: 'Enterprise E2 - R$ 4.997/mês',
    enterprise_e3: 'Enterprise E3 - R$ 7.997/mês',
  };

  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['org-usage', slug],
    queryFn: () => billingService.getUsage(slug),
    enabled: !!slug,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['billing-history', slug],
    queryFn: () => billingService.getHistory(slug),
    enabled: !!slug,
  });

  const { data: managedSummary } = useQuery({
    queryKey: ['managed-orgs-summary', slug],
    queryFn: () => orgService.getManagedOrgsSummary(slug),
    enabled: !!slug && isEnterprise && isMasterOrg,
    retry: false,
  });

  const downgradeMutation = useMutation({
    mutationFn: (plan) => billingService.downgrade(slug, plan),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-usage', slug] });
      refreshOrgs();
      setDowngradeOpen(false);
      setSelectedDowngradePlan(null);
    },
  });

  const plan = PLAN_INFO[effectivePlan] || PLAN_INFO.free;
  const usage = usageData?.usage || {};
  const limits = usageData?.limits || {};
  const payments = historyData?.payments || [];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Faturamento</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gerencie seu plano e acompanhe seu uso
          </p>
        </div>

        {/* Current plan card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                plan.color === 'primary'
                  ? 'bg-primary/10'
                  : plan.color === 'amber'
                    ? 'bg-amber-100 dark:bg-amber-900/20'
                    : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                <Crown className={`w-6 h-6 ${
                  plan.color === 'primary'
                    ? 'text-primary'
                    : plan.color === 'amber'
                      ? 'text-amber-500'
                      : 'text-gray-400'
                }`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Plano {plan.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{plan.price}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {effectivePlan !== 'free' && (
                <button
                  onClick={() => setDowngradeOpen(!downgradeOpen)}
                  className="flex items-center gap-1.5 px-4 py-2 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Fazer downgrade de plano"
                >
                  Downgrade
                  <ChevronDown className={`w-4 h-4 transition-transform ${downgradeOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
              <button
                onClick={() => navigate('/select-plan')}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Alterar plano
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Downgrade dropdown */}
          {downgradeOpen && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-3">Selecione o novo plano:</p>
              <div className="space-y-2">
                {AVAILABLE_DOWNGRADE_PLANS.map((p) => {
                  const isCurrentPlan = p === effectivePlan;
                  const isDowngrade = PLAN_INFO[p] && PLAN_INFO[effectivePlan] &&
                    (p === 'free' || PLAN_INFO[p].price < PLAN_INFO[effectivePlan].price);
                  if (isCurrentPlan || (PLAN_INFO[p] && PLAN_INFO[effectivePlan] && PLAN_INFO[p].price >= PLAN_INFO[effectivePlan].price)) return null;

                  return (
                    <button
                      key={p}
                      onClick={() => setSelectedDowngradePlan(p)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedDowngradePlan === p
                          ? 'bg-primary/10 border border-primary text-primary dark:bg-primary/20'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {planLabels[p]}
                    </button>
                  );
                })}
              </div>

              {selectedDowngradePlan && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
                    ⚠️ Se seu uso exceder os limites do novo plano, você será cobrado por extras.
                  </p>
                  <button
                    onClick={() => downgradeMutation.mutate(selectedDowngradePlan)}
                    disabled={downgradeMutation.isPending}
                    className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {downgradeMutation.isPending ? 'Processando...' : `Confirmar downgrade para ${planLabels[selectedDowngradePlan]}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trial info */}
        {trial.has_trial && (
          <div className={`rounded-xl border p-4 flex items-center justify-between ${
            trial.trial_active
              ? trial.days_remaining <= 7
                ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800'
                : trial.days_remaining <= 14
                  ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800'
                  : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800'
              : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
          }`}>
            <div>
              <p className={`text-sm font-semibold ${
                trial.trial_active
                  ? trial.days_remaining <= 7 ? 'text-red-700 dark:text-red-400' : trial.days_remaining <= 14 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}>
                {trial.trial_active
                  ? `Trial Pro — ${trial.days_remaining} dia${trial.days_remaining !== 1 ? 's' : ''} restante${trial.days_remaining !== 1 ? 's' : ''}`
                  : 'Trial expirado'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {trial.trial_active
                  ? 'Aproveite todos os recursos Pro durante o período de teste'
                  : 'Faça upgrade para continuar usando os recursos Pro'}
              </p>
            </div>
            {!trial.trial_active && currentOrg?.plan_tier === 'free' && (
              <button
                onClick={() => navigate('/select-plan')}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Fazer upgrade
              </button>
            )}
          </div>
        )}

        {/* Usage */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Uso atual</h2>
          {usageLoading ? (
            <div className="flex justify-center py-8">
              <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              <UsageBar label="Workspaces" current={usage.workspaces || 0} max={limits.workspaces} />
              <UsageBar label="Contas Cloud" current={usage.cloud_accounts || 0} max={limits.cloud_accounts} />
              <UsageBar label="Membros" current={usage.members || 0} max={limits.members} />
            </div>
          )}
        </div>

        {/* Add-ons Panel */}
        <AddOnsPanel
          orgSlug={slug}
          currentPlan={effectivePlan}
          currentMembers={usage.members || 0}
          currentWorkspaces={usage.workspaces || 0}
          maxMembers={limits.members}
          maxWorkspaces={limits.workspaces}
        />

        {/* Managed orgs add-on (Enterprise master only) */}
        {isEnterprise && isMasterOrg && managedSummary && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Organizações Gerenciadas</h2>
              </div>
              <button
                onClick={() => navigate('/org/managed')}
                className="text-sm text-primary hover:text-primary-light font-medium transition-colors"
              >
                Gerenciar →
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">Orgs parceiras</span>
                  <span className="font-semibold text-gray-600 dark:text-gray-400">
                    {managedSummary.total_partners} / {managedSummary.base_included_orgs} incluídas
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      managedSummary.total_partners > managedSummary.base_included_orgs ? 'bg-amber-500' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min((managedSummary.total_partners / Math.max(managedSummary.base_included_orgs, 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
              {managedSummary.extra_orgs > 0 ? (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 px-4 py-3">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>{managedSummary.extra_orgs}</strong> org{managedSummary.extra_orgs > 1 ? 's' : ''} adicional{managedSummary.extra_orgs > 1 ? 'is' : ''} a{' '}
                    <strong>R$ 397,00/org/mês</strong> = <strong>R$ {managedSummary.extra_cost_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</strong>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Até {managedSummary.base_included_orgs} orgs incluídas no plano base · orgs adicionais R$ 397,00/org/mês
                </p>
              )}

              {/* Workspace add-on */}
              {managedSummary.total_extra_workspaces > 0 ? (
                <div className="rounded-lg bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800/30 px-4 py-3">
                  <p className="text-sm text-sky-700 dark:text-sky-400">
                    <strong>{managedSummary.total_extra_workspaces}</strong> workspace{managedSummary.total_extra_workspaces > 1 ? 's' : ''} adicional{managedSummary.total_extra_workspaces > 1 ? 'is' : ''} além do incluso a{' '}
                    <strong>R$ 290,00/ws/mês</strong> = <strong>R$ {managedSummary.extra_workspace_cost_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</strong>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Cada org parceira inclui {managedSummary.partner_base_workspaces} workspaces · extras a R$ 290,00/ws/mês
                </p>
              )}
            </div>
          </div>
        )}

        {/* Payment history */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-5">
            <CreditCard className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Histórico de pagamentos</h2>
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-8">
              <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              Nenhum pagamento encontrado
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-2 text-gray-500 dark:text-gray-400 font-medium">Data</th>
                    <th className="text-left py-3 px-2 text-gray-500 dark:text-gray-400 font-medium">Plano</th>
                    <th className="text-left py-3 px-2 text-gray-500 dark:text-gray-400 font-medium">Valor</th>
                    <th className="text-left py-3 px-2 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const badge = STATUS_BADGE[p.status] || STATUS_BADGE.PENDING;
                    return (
                      <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-3 px-2 text-gray-700 dark:text-gray-300">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="py-3 px-2 text-gray-700 dark:text-gray-300 capitalize">
                          {p.plan_tier}
                        </td>
                        <td className="py-3 px-2 text-gray-700 dark:text-gray-300">
                          R$ {(p.amount / 100).toFixed(2).replace('.', ',')}
                        </td>
                        <td className="py-3 px-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Billing;
