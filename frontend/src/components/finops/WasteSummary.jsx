import { TrendingDown, Zap, BarChart3, AlertTriangle } from 'lucide-react';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KpiCard = ({ icon: Icon, label, value, sub, color }) => {
  const colors = {
    green:  { bg: 'from-green-50 to-green-100/50 dark:from-green-900/30 dark:to-green-800/10',   icon: 'text-green-500 dark:text-green-400',   border: 'border-green-200 dark:border-green-800/30' },
    yellow: { bg: 'from-yellow-50 to-yellow-100/50 dark:from-yellow-900/30 dark:to-yellow-800/10', icon: 'text-yellow-500 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-800/30' },
    blue:   { bg: 'from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/10',       icon: 'text-blue-500 dark:text-blue-400',     border: 'border-blue-200 dark:border-blue-800/30' },
    red:    { bg: 'from-red-50 to-red-100/50 dark:from-red-900/30 dark:to-red-800/10',           icon: 'text-red-500 dark:text-red-400',       border: 'border-red-200 dark:border-red-800/30' },
  }[color] || { bg: 'from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-800', icon: 'text-gray-400 dark:text-slate-400', border: 'border-gray-200 dark:border-slate-700' };

  return (
    <div className={`rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{sub}</p>}
        </div>
        <Icon className={`${colors.icon} opacity-60`} size={28} />
      </div>
    </div>
  );
};

/**
 * Hero bar showing FinOps KPIs.
 * Props:
 *   summary  — object from GET /finops/summary
 *   onScan   — callback for "Escanear Agora" button
 *   scanning — boolean
 */
const WasteSummary = ({ summary, onScan, scanning }) => {
  if (!summary) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
          <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-24" />
          <div className="h-7 bg-gray-200 dark:bg-slate-700 rounded w-20" />
          <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-32" />
        </div>
      ))}
    </div>
  );

  const { potential_saving_monthly, realized_saving_30d, adoption_rate_pct, recommendations, open_anomalies, top_waste_category } = summary;

  const TYPE_LABEL = {
    right_size: 'Redimensionamento',
    stop:       'Parar recursos ociosos',
    delete:     'Deletar recursos órfãos',
    schedule:   'Agendamento',
    reserve:    'Instâncias reservadas',
  };

  return (
    <div className="space-y-4">
      {/* Anomaly banner */}
      {open_anomalies > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{open_anomalies}</strong> anomalia{open_anomalies > 1 ? 's' : ''} de custo detectada{open_anomalies > 1 ? 's' : ''} —{' '}
            <span className="font-semibold">pico acima de 3σ por 2 dias consecutivos.</span>
          </p>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingDown}
          label="Economia Potencial"
          value={fmtUSD(potential_saving_monthly)}
          sub={`${recommendations?.pending ?? 0} recomendações pendentes`}
          color="green"
        />
        <KpiCard
          icon={Zap}
          label="Economia Realizada (30d)"
          value={fmtUSD(realized_saving_30d)}
          sub="Ações aplicadas"
          color="blue"
        />
        <KpiCard
          icon={BarChart3}
          label="Taxa de Adoção"
          value={`${adoption_rate_pct ?? 0}%`}
          sub={`${recommendations?.applied ?? 0} de ${recommendations?.total ?? 0} aplicadas`}
          color="yellow"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Desperdícios Detectados"
          value={recommendations?.pending ?? 0}
          sub={top_waste_category ? `Principal: ${TYPE_LABEL[top_waste_category] || top_waste_category}` : 'Nenhum pendente'}
          color={recommendations?.pending > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Scan button */}
      <div className="flex justify-end">
        <button
          onClick={onScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
        >
          <Zap size={16} />
          {scanning ? 'Escaneando…' : 'Escanear Agora'}
        </button>
      </div>
    </div>
  );
};

export default WasteSummary;
