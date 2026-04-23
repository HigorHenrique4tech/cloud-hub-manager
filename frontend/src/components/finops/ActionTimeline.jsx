import { CheckCircle2, XCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import PermissionGate from '../common/PermissionGate';
import PlanGate from '../common/PlanGate';
import { useCurrency } from '../../hooks/useCurrency';

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

const STATUS_ICON = {
  executed:    <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />,
  failed:      <XCircle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />,
  rolled_back: <RotateCcw size={16} className="text-gray-400 dark:text-gray-400 shrink-0 mt-0.5" />,
};

const TYPE_LABEL = {
  right_size: 'Redimensionado',
  stop:       'Parado',
  delete:     'Deletado',
  release_ip: 'IP liberado',
  rollback:   'Revertido',
  schedule:   'Agendado',
};

/**
 * Displays the last ~20 FinOps actions with rollback button.
 * Props:
 *   actions       — array from GET /finops/actions
 *   onRollback    — (actionId) => void
 *   rollbackLoading — actionId currently rolling back or null
 *   planTier      — string
 */
const ActionTimeline = ({ actions = [], onRollback, rollbackLoading, planTier = 'free' }) => {
  const { fmtCost } = useCurrency();
  const planOk = ['pro', 'enterprise'].includes((planTier || 'free').toLowerCase());

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
        <CheckCircle2 size={32} className="mb-2 opacity-30" />
        <p className="text-sm">Nenhuma ação executada ainda.</p>
        <p className="text-xs mt-1">Aplique recomendações para ver o histórico aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <div
          key={action.id}
          className="flex items-start gap-3 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800/40 p-3 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
        >
          {STATUS_ICON[action.status] || <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />}

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{action.resource_name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">({action.resource_type})</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                action.provider === 'aws'   ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' :
                action.provider === 'azure' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' :
                'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
              }`}>
                {action.provider?.toUpperCase()}
              </span>
            </div>

            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {TYPE_LABEL[action.action_type] || action.action_type}
              {action.estimated_saving > 0 && (
                <span className="ml-2 text-green-600 dark:text-green-400 font-medium">→ {fmtCost(action.estimated_saving)}/mês economizado</span>
              )}
            </p>

            {action.error_message && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400 truncate">{action.error_message}</p>
            )}

            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-600">{fmtDate(action.executed_at)}</p>
          </div>

          {/* Rollback button — only for executed actions within 24h */}
          {action.can_rollback && (
            <PermissionGate permission="finops.execute">
              {planOk ? (
                <button
                  onClick={() => onRollback(action.id)}
                  disabled={rollbackLoading === action.id}
                  className="shrink-0 inline-flex items-center gap-1 rounded border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 transition-colors"
                >
                  <RotateCcw size={12} />
                  {rollbackLoading === action.id ? 'Revertendo…' : 'Desfazer'}
                </button>
              ) : (
                <PlanGate minPlan="pro" feature="Desfazer" inline />
              )}
            </PermissionGate>
          )}
        </div>
      ))}
    </div>
  );
};

export default ActionTimeline;
