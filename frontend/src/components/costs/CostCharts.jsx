import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceDot, ReferenceLine, Area, ComposedChart,
} from 'recharts';
import { BarChart2, TrendingUp, AlertTriangle } from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';

// Renders a small purple circle at the top of each event reference line
const EventMarkerLabel = ({ viewBox, count }) => {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  const r = 8;
  return (
    <g>
      <circle cx={x} cy={y + r + 2} r={r} fill="#8b5cf6" stroke="white" strokeWidth={1.5} />
      <text
        x={x} y={y + r + 6}
        textAnchor="middle" fill="white"
        fontSize={count > 9 ? 7 : 9} fontWeight="bold"
      >
        {count > 9 ? '9+' : count}
      </text>
    </g>
  );
};

const PROVIDER_COLORS = { aws: '#f97316', azure: '#0ea5e9', gcp: '#10b981', total: '#8b5cf6' };
const PROVIDER_NAMES = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' };

const ACTION_LABELS = {
  create: 'Criou', delete: 'Deletou', start: 'Iniciou', stop: 'Parou',
  update: 'Atualizou', restart: 'Reiniciou', deploy: 'Deploy',
};

/** Enhanced tooltip with provider breakdown + anomaly badge + event markers */
const EnhancedTooltip = ({ active, payload, label, anomalies, showComparison, fmt, events }) => {
  if (!active || !payload?.length) return null;

  const isAnomaly = anomalies?.has(label);
  const dayEvents = events?.[label] || [];
  const currentEntries = payload.filter((p) => !p.dataKey.startsWith('prev_'));
  const prevEntries = payload.filter((p) => p.dataKey.startsWith('prev_'));

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-sm min-w-[180px] max-w-[260px]">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <p className="font-semibold text-gray-700 dark:text-gray-300">{label}</p>
        {isAnomaly && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" /> Anomalia
          </span>
        )}
        {dayEvents.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded-full">
            {dayEvents.length} evento{dayEvents.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Current period */}
      {currentEntries.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-gray-600 dark:text-gray-400">{p.name}</span>
          </div>
          <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{fmt(p.value)}</span>
        </div>
      ))}

      {/* Previous period comparison */}
      {showComparison && prevEntries.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 mt-1.5 pt-1.5">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wide">Período anterior</p>
          {prevEntries.map((p) => (
            <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
              <span className="text-gray-500 dark:text-gray-400 text-xs">{p.name}</span>
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{fmt(p.value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Activity events */}
      {dayEvents.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 mt-1.5 pt-1.5">
          <p className="text-[10px] text-purple-500 dark:text-purple-400 uppercase tracking-wide mb-1.5">Atividade</p>
          {dayEvents.slice(0, 4).map((ev, i) => (
            <div key={i} className="flex items-start gap-1.5 py-0.5 text-[11px] text-gray-600 dark:text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0 mt-1" />
              <span className="leading-tight">
                <span className="font-medium">{ACTION_LABELS[ev.action] || ev.action}</span>
                {' '}{ev.resource_name || ev.resource_type}
                {ev.provider && ev.provider !== 'system' && (
                  <span className="ml-1 opacity-60">({ev.provider})</span>
                )}
              </span>
            </div>
          ))}
          {dayEvents.length > 4 && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 pl-3">+{dayEvents.length - 4} mais</p>
          )}
        </div>
      )}
    </div>
  );
};

const CostCharts = ({ data, prevData, hasAws, hasAzure, hasGcp, providerFilter = 'all', anomalies = new Set(), onServiceClick, events = {} }) => {
  const { fmtCost, currency } = useCurrency();
  const axisTickFmt = (v) => currency === 'BRL' ? `R$${v}` : `$${v}`;
  const [chartType, setChartType] = useState('line'); // 'line' | 'stacked'
  const showComparison = !!prevData;

  // Filter + merge comparison data
  const chartData = useMemo(() => {
    const combined = (data.combined || []).map((d, idx) => {
      const row = providerFilter === 'all'
        ? { ...d }
        : { date: d.date, [providerFilter]: d[providerFilter] || 0, total: d[providerFilter] || 0 };

      // Overlay previous period data aligned by index
      if (showComparison && prevData?.combined?.[idx]) {
        const prev = prevData.combined[idx];
        if (providerFilter === 'all') {
          row.prev_total = prev.total || 0;
        } else {
          row.prev_total = prev[providerFilter] || 0;
        }
      }

      return row;
    });
    return combined;
  }, [data.combined, prevData, providerFilter, showComparison]);

  const showAws   = hasAws   && (providerFilter === 'all' || providerFilter === 'aws');
  const showAzure = hasAzure && (providerFilter === 'all' || providerFilter === 'azure');
  const showGcp   = hasGcp   && (providerFilter === 'all' || providerFilter === 'gcp');
  const multiProvider = [showAws, showAzure, showGcp].filter(Boolean).length >= 2;

  // Event marker dates — only for dates that exist in chartData (line chart only)
  const eventDatesInRange = useMemo(() => {
    const chartDates = new Set(chartData.map((d) => d.date));
    return Object.keys(events).filter((d) => chartDates.has(d));
  }, [chartData, events]);

  // Anomaly dots for line chart
  const anomalyDots = useMemo(() => {
    if (!anomalies.size) return [];
    return chartData
      .filter((d) => anomalies.has(d.date))
      .map((d) => ({
        date: d.date,
        value: providerFilter === 'all' ? (d.total || 0) : (d[providerFilter] || 0),
      }));
  }, [chartData, anomalies, providerFilter]);

  return (
    <>
      {/* Line / Stacked toggle + chart */}
      <div className="card mb-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              Evolução Diária de Gastos
            </h2>
            {anomalies.size > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" /> {anomalies.size} anomalia{anomalies.size > 1 ? 's' : ''}
              </span>
            )}
            {showComparison && (
              <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-full">
                vs período anterior
              </span>
            )}
          </div>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setChartType('line')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                chartType === 'line'
                  ? 'bg-primary text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Linha
            </button>
            <button
              onClick={() => setChartType('stacked')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                chartType === 'stacked'
                  ? 'bg-primary text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> Barras
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          {chartType === 'line' ? (
            <ComposedChart data={chartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={axisTickFmt} width={60} />
              <Tooltip content={<EnhancedTooltip anomalies={anomalies} showComparison={showComparison} fmt={(v) => fmtCost(v, currency)} events={events} />} />
              <Legend />

              {/* Event marker lines (activity log) */}
              {eventDatesInRange.map((date) => (
                <ReferenceLine
                  key={`ev-${date}`}
                  x={date}
                  stroke="#8b5cf6"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  opacity={0.55}
                  label={<EventMarkerLabel count={events[date].length} />}
                />
              ))}

              {/* Previous period ghost line */}
              {showComparison && (
                <Line
                  type="monotone" dataKey="prev_total" name="Período Ant."
                  stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="6 3"
                  dot={false} opacity={0.5}
                />
              )}

              {showAws   && <Line type="monotone" dataKey="aws"   name="AWS"   stroke={PROVIDER_COLORS.aws}   strokeWidth={2} dot={false} />}
              {showAzure && <Line type="monotone" dataKey="azure" name="Azure" stroke={PROVIDER_COLORS.azure} strokeWidth={2} dot={false} />}
              {showGcp   && <Line type="monotone" dataKey="gcp"   name="GCP"   stroke={PROVIDER_COLORS.gcp}   strokeWidth={2} dot={false} />}
              {providerFilter === 'all' && (
                <Line type="monotone" dataKey="total" name="Total" stroke={PROVIDER_COLORS.total} strokeWidth={2} strokeDasharray="4 2" dot={false} />
              )}

              {/* Anomaly markers */}
              {anomalyDots.map((ad) => (
                <ReferenceDot
                  key={ad.date}
                  x={ad.date}
                  y={ad.value}
                  r={6}
                  fill="#f59e0b"
                  stroke="#fff"
                  strokeWidth={2}
                  isFront
                />
              ))}
            </ComposedChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={axisTickFmt} width={60} />
              <Tooltip content={<EnhancedTooltip anomalies={anomalies} showComparison={showComparison} fmt={(v) => fmtCost(v, currency)} events={events} />} />
              <Legend />

              {/* Previous period as ghost bars */}
              {showComparison && (
                <Bar dataKey="prev_total" name="Período Ant." stackId="prev" fill="#9ca3af" opacity={0.25} radius={[2,2,0,0]} />
              )}

              {showAws   && <Bar dataKey="aws"   name="AWS"   stackId="s" fill={PROVIDER_COLORS.aws}   radius={showAws && !showAzure && !showGcp ? [4,4,0,0] : [0,0,0,0]} />}
              {showAzure && <Bar dataKey="azure" name="Azure" stackId="s" fill={PROVIDER_COLORS.azure} radius={showAzure && !showGcp ? [4,4,0,0] : [0,0,0,0]} />}
              {showGcp   && <Bar dataKey="gcp"   name="GCP"   stackId="s" fill={PROVIDER_COLORS.gcp}   radius={[4,4,0,0]} />}
              {/* Single provider mode */}
              {!multiProvider && providerFilter !== 'all' && (
                <Bar dataKey={providerFilter} name={providerFilter.toUpperCase()} stackId="s" fill={PROVIDER_COLORS[providerFilter]} radius={[4,4,0,0]} />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Bar + Pie grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {data.by_service?.length > 0 && (
          <div className="card lg:col-span-2 animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Top Serviços por Custo</h2>
              {onServiceClick && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">Clique para detalhar</span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={data.by_service
                  .filter((s) => providerFilter === 'all' || s.name.toLowerCase().startsWith(`${providerFilter} /`))
                  .slice(0, 8)}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 0 }}
                onClick={(state) => {
                  if (onServiceClick && state?.activePayload?.[0]?.payload?.name) {
                    onServiceClick(state.activePayload[0].payload.name);
                  }
                }}
                style={{ cursor: onServiceClick ? 'pointer' : 'default' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={axisTickFmt} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const svc = payload[0]?.payload;
                  const total = data.total || 1;
                  const pct = svc ? ((svc.amount / total) * 100).toFixed(1) : 0;
                  return (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{svc?.name}</p>
                      <p className="text-primary-dark dark:text-indigo-400 font-mono">{fmtCost(svc?.amount, currency)}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{pct}% do total</p>
                      {onServiceClick && <p className="text-[10px] text-primary mt-1">Clique para ver recursos</p>}
                    </div>
                  );
                }} />
                <Bar dataKey="amount" name="Custo" fill="#6366f1" radius={[0, 4, 4, 0]} className="cursor-pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {[hasAws, hasAzure, hasGcp].filter(Boolean).length >= 2 && providerFilter === 'all' && (() => {
          // Only include providers with value > 0 to avoid overlapping zero-slice labels
          const pieEntries = [
            hasAws   && (data.aws?.total   || 0) > 0 && { name: 'AWS',   value: data.aws.total,   color: PROVIDER_COLORS.aws },
            hasAzure && (data.azure?.total || 0) > 0 && { name: 'Azure', value: data.azure.total, color: PROVIDER_COLORS.azure },
            hasGcp   && (data.gcp?.total   || 0) > 0 && { name: 'GCP*',  value: data.gcp.total,   color: PROVIDER_COLORS.gcp },
          ].filter(Boolean);

          if (pieEntries.length === 0) return null;

          const pieTotal = pieEntries.reduce((s, e) => s + e.value, 0);

          return (
            <div className="card flex flex-col animate-fade-in" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Distribuição por Cloud</h2>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieEntries}
                    cx="50%" cy="50%"
                    innerRadius={52} outerRadius={76}
                    dataKey="value"
                    label={false}
                    labelLine={false}
                  >
                    {pieEntries.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtCost(v, currency)} />
                </PieChart>
              </ResponsiveContainer>

              {/* Custom legend — avoids label overlap */}
              <div className="flex flex-col gap-1.5 mt-1 px-1">
                {pieEntries.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-gray-600 dark:text-gray-400">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                      <span className="text-gray-400 dark:text-gray-500 font-normal">
                        {((entry.value / pieTotal) * 100).toFixed(1)}%
                      </span>
                      {fmtCost(entry.value, currency)}
                    </div>
                  </div>
                ))}
              </div>

              {hasGcp && data?.gcp?.estimated && (
                <p className="text-xs text-green-500 dark:text-green-400 mt-2">* GCP: valor estimado</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Provider breakdown cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {hasAws && (
          <div className={`card border-l-4 border-l-orange-400 transition-all animate-fade-in ${providerFilter !== 'all' && providerFilter !== 'aws' ? 'opacity-40' : ''}`} style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
            <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-1">AWS</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtCost(data.aws?.total, currency)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">período selecionado</p>
            {showComparison && prevData?.aws?.total != null && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">anterior: {fmtCost(prevData.aws.total, currency)}</p>
            )}
          </div>
        )}
        {hasAzure && (
          <div className={`card border-l-4 border-l-sky-400 transition-all animate-fade-in ${providerFilter !== 'all' && providerFilter !== 'azure' ? 'opacity-40' : ''}`} style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1">Azure</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtCost(data.azure?.total, currency)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">período selecionado</p>
            {showComparison && prevData?.azure?.total != null && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">anterior: {fmtCost(prevData.azure.total, currency)}</p>
            )}
          </div>
        )}
        {hasGcp && (
          <div className={`card border-l-4 border-l-emerald-400 transition-all animate-fade-in ${providerFilter !== 'all' && providerFilter !== 'gcp' ? 'opacity-40' : ''}`} style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              GCP
              {data.gcp?.estimated && (
                <span className="text-[10px] font-normal bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded px-1 py-0.5">estimado</span>
              )}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtCost(data.gcp?.total, currency)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">período selecionado</p>
            {showComparison && prevData?.gcp?.total != null && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">anterior: {fmtCost(prevData.gcp.total, currency)}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default CostCharts;
