import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { fmtUSD } from '../../utils/formatters';

const CostTrendChart = ({ costTrendQ }) => {
  if (costTrendQ.isLoading) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            Tendência de Custo — últimos 30 dias
          </h3>
          <span className="text-xs text-gray-400 dark:text-slate-500 animate-pulse">Carregando…</span>
        </div>
        <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (costTrendQ.isError) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">
          Tendência de Custo — últimos 30 dias
        </h3>
        <div className="h-40 flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
          Dados de custo indisponíveis
        </div>
      </div>
    );
  }

  const trendData   = costTrendQ.data ?? {};
  const labels      = trendData.labels        ?? [];
  const aws         = trendData.aws           ?? [];
  const azure       = trendData.azure         ?? [];
  const gcp         = trendData.gcp           ?? [];
  const fLabels     = trendData.forecast_labels ?? [];
  const awsF        = trendData.aws_forecast  ?? [];
  const azureF      = trendData.azure_forecast ?? [];
  const gcpF        = trendData.gcp_forecast  ?? [];
  const hasAws      = aws.some((v) => v > 0);
  const hasAzure    = azure.some((v) => v > 0);
  const hasGcp      = gcp.some((v) => v > 0);
  const hasForecast = awsF.some((v) => v > 0) || azureF.some((v) => v > 0) || gcpF.some((v) => v > 0);

  if (!hasAws && !hasAzure && !hasGcp) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">
          Tendência de Custo — últimos 30 dias
        </h3>
        <div className="h-40 flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
          Nenhum dado de custo disponível. Configure uma conta cloud e execute um scan.
        </div>
      </div>
    );
  }

  const todayLabel  = labels[labels.length - 1]?.slice(5) ?? 'Hoje';
  const histData    = labels.map((label, i) => ({
    date:  label.slice(5),
    AWS:   aws[i]   || 0,
    Azure: azure[i] || 0,
    GCP:   gcp[i]   || 0,
  }));
  const forecastData = fLabels.map((label, i) => ({
    date:    label.slice(5),
    AWS_f:   awsF[i]   || 0,
    Azure_f: azureF[i] || 0,
    GCP_f:   gcpF[i]   || 0,
  }));
  const chartData = [...histData, ...forecastData];

  const avgDays      = fLabels.length || 1;
  const awsMonthly   = (awsF.reduce((s, v) => s + v, 0) / avgDays) * 30;
  const azureMonthly = (azureF.reduce((s, v) => s + v, 0) / avgDays) * 30;
  const gcpMonthly   = (gcpF.reduce((s, v) => s + v, 0) / avgDays) * 30;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
          Tendência de Custo — últimos 30 dias
        </h3>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="awsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0}   />
            </linearGradient>
            <linearGradient id="azureGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
            </linearGradient>
            <linearGradient id="gcpGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="rgba(148,163,184,0.4)" />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `$${v}`}
            stroke="rgba(148,163,184,0.4)"
            width={45}
          />
          <RTooltip
            formatter={(v, name) => {
              const label = name.endsWith('_f') ? `${name.replace('_f', '')} (prev.)` : name;
              return [`$${Number(v).toFixed(2)}`, label];
            }}
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          {hasAws   && <Area type="monotone" dataKey="AWS"   stroke="#f97316" fill="url(#awsGrad)"   strokeWidth={2} dot={false} connectNulls animationDuration={800} />}
          {hasAzure && <Area type="monotone" dataKey="Azure" stroke="#3b82f6" fill="url(#azureGrad)" strokeWidth={2} dot={false} connectNulls animationDuration={800} />}
          {hasGcp   && <Area type="monotone" dataKey="GCP"   stroke="#22c55e" fill="url(#gcpGrad)"   strokeWidth={2} dot={false} connectNulls animationDuration={800} />}
          {hasForecast && hasAws   && <Area type="monotone" dataKey="AWS_f"   stroke="#f97316" fill="none" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
          {hasForecast && hasAzure && <Area type="monotone" dataKey="Azure_f" stroke="#3b82f6" fill="none" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
          {hasForecast && hasGcp   && <Area type="monotone" dataKey="GCP_f"   stroke="#22c55e" fill="none" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
          {hasForecast && (
            <ReferenceLine
              x={todayLabel}
              stroke="rgba(148,163,184,0.5)"
              strokeDasharray="4 4"
              label={{ value: 'Hoje', fill: '#94a3b8', fontSize: 10, position: 'top' }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {hasForecast && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {hasAws && awsMonthly > 0 && (
            <div className="rounded-lg border border-orange-200 dark:border-orange-800/30 bg-orange-50 dark:bg-orange-900/10 p-2.5">
              <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">AWS (próx. 30d)</p>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100">~{fmtUSD(awsMonthly)}</p>
            </div>
          )}
          {hasAzure && azureMonthly > 0 && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/10 p-2.5">
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Azure (próx. 30d)</p>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100">~{fmtUSD(azureMonthly)}</p>
            </div>
          )}
          {hasGcp && gcpMonthly > 0 && (
            <div className="rounded-lg border border-green-200 dark:border-green-800/30 bg-green-50 dark:bg-green-900/10 p-2.5">
              <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">GCP (próx. 30d) *est.</p>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100">~{fmtUSD(gcpMonthly)}</p>
            </div>
          )}
          {(awsMonthly + azureMonthly + gcpMonthly) > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 p-2.5">
              <p className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">Total (próx. 30d)</p>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100">~{fmtUSD(awsMonthly + azureMonthly + gcpMonthly)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CostTrendChart;
