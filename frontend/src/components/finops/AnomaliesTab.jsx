import { AlertTriangle, Bell, CheckCircle } from 'lucide-react';
import LoadingSpinner from '../common/loadingspinner';
import EmptyState from '../common/emptystate';
import PlanGate from '../common/PlanGate';
import PermissionGate from '../common/PermissionGate';
import { fmtUSD } from '../../utils/formatters';

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
            <div className="mt-2 flex flex-wrap gap-4 text-xs">
              <span className="text-gray-500 dark:text-slate-400">
                Baseline: <strong className="text-gray-700 dark:text-slate-300">{fmtUSD(anomaly.baseline_cost)}/dia</strong>
              </span>
              <span className="text-gray-500 dark:text-slate-400">
                Observado: <strong className={devPct >= 100 ? 'text-red-400' : 'text-amber-400'}>{fmtUSD(anomaly.actual_cost)}/dia</strong>
              </span>
              <span className={`font-semibold ${devPct >= 200 ? 'text-red-400' : devPct >= 100 ? 'text-amber-400' : 'text-yellow-400'}`}>
                +{devPct.toFixed(0)}% acima do normal
              </span>
            </div>
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

const AnomaliesTab = ({ anomaliesQ, anomalyScanMut, acknowledgeAnomalyMut }) => (
  <div className="space-y-4 animate-fade-in">
    <PlanGate minPlan="pro" feature="Detecção de Anomalias">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Picos de custo detectados automaticamente por análise estatística (3σ acima da baseline).
        </p>
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
        <div className="flex items-center gap-2 rounded-lg border border-green-700/40 bg-green-900/20 px-4 py-2.5 text-sm text-green-300">
          <CheckCircle size={14} />
          Scan iniciado — os resultados aparecem em instantes.
        </div>
      )}

      {anomaliesQ.isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : anomaliesQ.isError ? (
        <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
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
