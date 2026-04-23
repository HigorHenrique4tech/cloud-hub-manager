import { Lock } from 'lucide-react';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';

const PLAN_ORDER = {
  free: 0,
  basic: 1,
  standard: 2,
  enterprise_e1: 3,
  enterprise_e2: 4,
  enterprise_e3: 5,
  enterprise_migration: 6,
};

/**
 * Renders children only if the org's plan_tier meets the minimum required plan.
 * Otherwise renders a locked fallback with an upgrade CTA.
 *
 * Usage:
 *   <PlanGate minPlan="pro" feature="Aplicar recomendações">
 *     <button>Aplicar</button>
 *   </PlanGate>
 */
const PlanGate = ({ minPlan = 'basic', feature = '', children, inline = false }) => {
  const { currentOrg } = useOrgWorkspace();
  const plan = (currentOrg?.effective_plan || currentOrg?.plan_tier || 'free').toLowerCase();

  const hasAccess = (PLAN_ORDER[plan] ?? 0) >= (PLAN_ORDER[minPlan] ?? 0);
  if (hasAccess) return children;

  if (inline) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-400 cursor-not-allowed select-none">
        <Lock size={12} />
        {minPlan.charAt(0).toUpperCase() + minPlan.slice(1)}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-6 text-center">
      <Lock size={22} className="text-gray-400 dark:text-gray-500" />
      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
        {feature || 'Este recurso'} requer o plano{' '}
        <span className="font-semibold text-gray-900 dark:text-white capitalize">{minPlan}</span>
      </p>
      <a
        href="/billing"
        className="mt-1 inline-block rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors"
      >
        Fazer upgrade
      </a>
    </div>
  );
};

export default PlanGate;
