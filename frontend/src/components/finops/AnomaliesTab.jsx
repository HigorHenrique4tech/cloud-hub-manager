import { AlertTriangle, Bell, CheckCircle, TrendingUp } from 'lucide-react';
import LoadingSpinner from '../common/loadingspinner';
import EmptyState from '../common/emptystate';
import PlanGate from '../common/PlanGate';
import PermissionGate from '../common/PermissionGate';
import { fmtUSD } from '../../utils/formatters';

const CostComparisonBar = ({ baseline, actual }) => {
  if (baseline == null || actual == null) return null;
  const max = Math.max(baseline, actual, 0.01);
  const baselinePct = Math.round((baseline / max) * 100);
  const actualPct   = Math.round((actual   / max) * 100);
  const ratio = actual / (baseline || 1);
  const barColor = ratio >= 3 ? 'bg-red-500' : ratio >= 2 ? 'bg-orange-500' : 'bg-amber-400';

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-16 text-gray-500 dark:text-slate-400 shrink-0">Baseline</span>
        <div className="flex-1 h-3 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-3 rounded-full bg-blue-400 transition-all duration-500" style={{ width: `${baselinePct}%` }} />
        </div>
        <span className="w-20 text-right text-gray-600 dark:text-slate-300 font-mono text-[11px]">{fmtUSD(baseline)}/d</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-16 text-gray-500 dark:text-slate-400 shrink-0">Observado</span>
        <div className="flex-1 h-3 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
          <div className={`h-3 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${actualPct}%` }} />
        </div>
        <span className="w-20 text-right font-mono text-[11px] font-semibold text-amber-500 dark:text-amber-400">{fmtUSD(actual)}/d</span>
      </div>
    </div>
  );
};

const AnomalyCard = ({ anomaly, onAcknowledge, acknowledging }) => {
  const devPct = anomaly.deviation_pct ?? 0;
  const isOpen = anomaly.status === 'open';

  return (
    <div className={`rounded-xl border p-4 transition-all duration-200 ${
      isOpen
        ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-900/10'
        : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800/40 opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${isOpen ? 'bg-amber-500/20' : 'bg-gray-100 dark:bg-slate-700'}`}>
            <AlertTriangle size={16} className={isOpen ? 'text-amber-400' : 'text-gray-400 dark:text-slate-500'} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{anomaly.service_name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
                anomaly.provider === 'aws'   ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                anomaly.provider === 'azure' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}>
                {anomaly.provider}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isOpen
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
              }`}>
                {isOpen ? 'Aberta' : 'Reconhecida'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Detectada em {anomaly.detected_date ? new Date(anomaly.detected_date).toLocaleDateString('pt-BR') : '—'}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <TrendingUp size={12} className={devPct >= 200 ? 'text-red-400' : devPct >= 100 ? 'text-orange-400' : 'text-amber-400'} />
              <span className={`text-xs font-bold ${devPct >= 200 ? 'text-red-400' : devPct >= 100 ? 'text-orange-400' : 'text-amber-400'}`}>
                +{devPct.toFixed(0)}% acima do normal
              </span>
            </div>
            <CostComparisonBar baseline={anomaly.baseline_cost} actual={anomaly.actual_cost} />
          </div>
        </div>

        {isOpen && (
          <PermissionGate permission="finops.recommend">
            <button
              onClick={() => onAcknowledge(anomaly.id)}
              disabled={acknowledging}
              className="flex-shrink-0 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors active:scale-[0.97]"
            >
              Reconhecer
            </button>
          </PermissionGate>
        )}
      </div>
    </div>
  );
};

const PROVIDERS = ['aws', 'azure', 'gcp'];

const AnomaliesTab = ({ anomaliesQ, anomalyScanMut, acknowledgeAnomalyMut, filterProvider, setFilterProvider }) => (
  <div className="space-y-4 animate-fade-in">
    <PlanGate minPlan="pro" feature="Detecção de Anomalias">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500 dark:text-slate-400 hidden sm:block">
            Picos detectados por análise estatística (3σ acima da baseline).
          </p>
          {/* Provider filter */}
          <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setFilterProvider('')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${!filterProvider ? 'bg-primary text-white' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
            >
              Todos
            </button>
            {PROVIDERS.map((p, i) => (
              <button
                key={p}
                onClick={() => setFilterProvider(p === filterProvider ? '' : p)}
                className={`px-3 py-1.5 text-xs font-medium uppercase border-l border-gray-200 dark:border-slate-700 transition-colors ${filterProvider === p ? 'bg-primary text-white' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => anomalyScanMut.mutate()}
          disabled={anomalyScanMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60 transition-all active:scale-[0.97] shrink-0"
        >
          <AlertTriangle size={14} />
          {anomalyScanMut.isPending ? 'Escaneando…' : 'Escanear Anomalias'}
        </button>
      </div>

      {anomalyScanMut.isSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 dark:border-green-700/40 bg-green-50 dark:bg-green-900/20 px-4 py-2.5 text-sm text-green-700 dark:text-green-300">
          <CheckCircle size={14} />
          Scan iniciado — os resultados aparecem em instantes.
        </div>
      )}

      {anomaliesQ.isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : anomaliesQ.isError ? (
        <div className="rounded-lg border border-red-300 dark:border-red-700/40 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          Erro ao carregar anomalias. Verifique as permissões.
        </div>
      ) : (anomaliesQ.data?.items ?? []).length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nenhuma anomalia detectada"
          description="As anomalias são detectadas automaticamente durante o scan de custos"
        />
      ) : (
        <div className="space-y-3">
          {(anomaliesQ.data?.items ?? []).map((anomaly) => (
            <AnomalyCard
              key={anomaly.id}
              anomaly={anomaly}
              onAcknowledge={(id) => acknowledgeAnomalyMut.mutate(id)}
              acknowledging={acknowledgeAnomalyMut.isPending}
            />
          ))}
        </div>
      )}
    </PlanGate>
  </div>
);

export default AnomaliesTab;
