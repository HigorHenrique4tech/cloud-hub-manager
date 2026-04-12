import { Pencil, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import LoadingSpinner from '../common/loadingspinner';
import EmptyState from '../common/emptystate';
import PlanGate from '../common/PlanGate';
import PermissionGate from '../common/PermissionGate';
import { useCurrency } from '../../hooks/useCurrency';

const PERIOD_LABEL = { monthly: 'Mensal', quarterly: 'Trimestral', annual: 'Anual' };

const BudgetCard = ({ budget, onDelete, onEdit }) => {
  const { fmtCost } = useCurrency();
  const pct = Math.min((budget.pct ?? 0) * 100, 100);
  const barColor =
    pct >= budget.alert_threshold * 100
      ? 'bg-red-500'
      : pct >= budget.alert_threshold * 100 * 0.75
        ? 'bg-yellow-500'
        : 'bg-green-500';

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/60 p-4
                    transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{budget.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {budget.provider === 'all' ? 'Todos' : budget.provider.toUpperCase()} · {PERIOD_LABEL[budget.period]}
          </p>
        </div>
        <PermissionGate permission="finops.budget">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(budget)}
              className="text-gray-400 hover:text-primary-dark dark:text-gray-600 dark:hover:text-primary-light transition-colors"
              title="Editar orçamento"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(budget.id)}
              className="text-gray-400 hover:text-red-600 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
              title="Excluir orçamento"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </PermissionGate>
      </div>

      <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtCost(budget.amount)}</p>

      <div className="mt-3 space-y-1">
        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
          <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>Alerta em {Math.round(budget.alert_threshold * 100)}%</span>
          <span>{pct.toFixed(1)}%</span>
        </div>
        {budget.last_spend != null && (
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Gasto atual: <strong className="text-gray-700 dark:text-gray-300">{fmtCost(budget.last_spend)}</strong>
            {' '}/{' '}{fmtCost(budget.amount)}
          </p>
        )}
      </div>

      {budget.provider === 'all' && budget.breakdown && (
        <div className="space-y-1 pt-2 mt-2 border-t border-gray-200 dark:border-gray-700/50">
          {[
            { key: 'aws',   label: 'AWS',   color: 'bg-orange-500' },
            { key: 'azure', label: 'Azure', color: 'bg-blue-500' },
            { key: 'gcp',   label: 'GCP',   color: 'bg-green-500' },
          ].filter((p) => budget.breakdown[p.key] != null).map(({ key, label, color }) => {
            const v = budget.breakdown[key];
            const barPct = budget.amount > 0 ? Math.min((v / budget.amount) * 100, 100) : 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-10 text-xs text-gray-400 dark:text-gray-400">{label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                  <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${barPct}%` }} />
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-400 w-16 text-right">{fmtCost(v)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const BudgetsTab = ({ budgetsQ, deleteBudget, evaluateBudgets, onOpenModal, onEditBudget }) => (
  <div className="space-y-4 animate-fade-in">
    <PlanGate minPlan="pro" feature="Orçamentos">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          {evaluateBudgets.isPending && (
            <span className="flex items-center gap-1">
              <RefreshCw size={11} className="animate-spin" />
              Atualizando gastos…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate permission="finops.budget">
            <button
              onClick={() => evaluateBudgets.mutate()}
              disabled={evaluateBudgets.isPending}
              title="Atualizar gastos agora"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors active:scale-[0.97]"
            >
              <RefreshCw size={14} className={evaluateBudgets.isPending ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <button
              onClick={onOpenModal}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors active:scale-[0.97]"
            >
              <Plus size={16} />
              Novo Orçamento
            </button>
          </PermissionGate>
        </div>
      </div>

      {budgetsQ.isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : budgetsQ.isError ? (
        <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
          Erro ao carregar orçamentos.
        </div>
      ) : (budgetsQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhum orçamento criado"
          description="Defina limites de custo para receber alertas automáticos"
          action={onOpenModal}
          actionLabel="Criar Primeiro Orçamento"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(budgetsQ.data ?? []).map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onDelete={(id) => deleteBudget.mutate(id)}
              onEdit={onEditBudget}
            />
          ))}
        </div>
      )}
    </PlanGate>
  </div>
);

export default BudgetsTab;
