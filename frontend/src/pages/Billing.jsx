import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Crown, ArrowUpRight, CreditCard, Building2 } from 'lucide-react';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import billingService from '../services/billingService';
import orgService from '../services/orgService';
import Layout from '../components/layout/layout';

const PLAN_INFO = {
  free: { name: 'Free', price: 'R$ 0', color: 'gray' },
  pro: { name: 'Pro', price: 'R$ 497/mês', color: 'primary' },
  enterprise: { name: 'Enterprise', price: 'R$ 2.497/mês + add-ons', color: 'amber' },
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
  const { currentOrg, isMasterOrg } = useOrgWorkspace();
  const slug = currentOrg?.slug;
  const isEnterprise = currentOrg?.plan_tier === 'enterprise';

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
    enabled: !!slug && isEnterprise,
    retry: false,
  });

  const plan = PLAN_INFO[currentOrg?.plan_tier] || PLAN_INFO.free;
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
            <button
              onClick={() => navigate('/select-plan')}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Alterar plano
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>

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

        {/* Managed orgs add-on (Enterprise only) */}
        {isEnterprise && managedSummary && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Organizações Gerenciadas</h2>
              </div>
              <button
                onClick={() => navigate('/org/managed')}
                className="text-sm text-indigo-500 hover:text-indigo-400 font-medium transition-colors"
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
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  Até {managedSummary.base_included_orgs} orgs incluídas no plano base · orgs adicionais R$ 397,00/org/mês
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
