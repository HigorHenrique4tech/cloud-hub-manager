import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BarChart2, TrendingUp } from 'lucide-react';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PROVIDER_COLORS = { aws: '#f97316', azure: '#0ea5e9', gcp: '#10b981', total: '#8b5cf6' };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmtUSD(p.value)}</p>
      ))}
    </div>
  );
};

const CostCharts = ({ data, hasAws, hasAzure, hasGcp, providerFilter = 'all' }) => {
  const [chartType, setChartType] = useState('line'); // 'line' | 'stacked'

  // Filter combined data based on selected provider
  const filteredCombined = (data.combined || []).map((d) => {
    if (providerFilter === 'all') return d;
    return {
      date: d.date,
      [providerFilter]: d[providerFilter] || 0,
      total: d[providerFilter] || 0,
    };
  });

  const showAws   = hasAws   && (providerFilter === 'all' || providerFilter === 'aws');
  const showAzure = hasAzure && (providerFilter === 'all' || providerFilter === 'azure');
  const showGcp   = hasGcp   && (providerFilter === 'all' || providerFilter === 'gcp');
  const multiProvider = [showAws, showAzure, showGcp].filter(Boolean).length >= 2;

  return (
    <>
      {/* Line / Stacked toggle + chart */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Evolução Diária de Gastos
          </h2>
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

        <ResponsiveContainer width="100%" height={280}>
          {chartType === 'line' ? (
            <LineChart data={filteredCombined} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {showAws   && <Line type="monotone" dataKey="aws"   name="AWS"   stroke={PROVIDER_COLORS.aws}   strokeWidth={2} dot={false} />}
              {showAzure && <Line type="monotone" dataKey="azure" name="Azure" stroke={PROVIDER_COLORS.azure} strokeWidth={2} dot={false} />}
              {showGcp   && <Line type="monotone" dataKey="gcp"   name="GCP"   stroke={PROVIDER_COLORS.gcp}   strokeWidth={2} dot={false} />}
              {providerFilter === 'all' && (
                <Line type="monotone" dataKey="total" name="Total" stroke={PROVIDER_COLORS.total} strokeWidth={2} strokeDasharray="4 2" dot={false} />
              )}
            </LineChart>
          ) : (
            <BarChart data={filteredCombined} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {showAws   && <Bar dataKey="aws"   name="AWS"   stackId="s" fill={PROVIDER_COLORS.aws}   radius={showAws && !showAzure && !showGcp ? [4,4,0,0] : [0,0,0,0]} />}
              {showAzure && <Bar dataKey="azure" name="Azure" stackId="s" fill={PROVIDER_COLORS.azure} radius={showAzure && !showGcp ? [4,4,0,0] : [0,0,0,0]} />}
              {showGcp   && <Bar dataKey="gcp"   name="GCP"   stackId="s" fill={PROVIDER_COLORS.gcp}   radius={[4,4,0,0]} />}
              {/* Single provider mode — show as simple bars */}
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
          <div className="card lg:col-span-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Top Serviços por Custo</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={data.by_service
                  .filter((s) => providerFilter === 'all' || s.name.toLowerCase().startsWith(providerFilter))
                  .slice(0, 8)}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="amount" name="Custo" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {[hasAws, hasAzure, hasGcp].filter(Boolean).length >= 2 && providerFilter === 'all' && (
          <div className="card flex flex-col items-center justify-center">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 self-start">Distribuição por Cloud</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={[
                    hasAws   && { name: 'AWS',   value: data.aws?.total   || 0 },
                    hasAzure && { name: 'Azure', value: data.azure?.total || 0 },
                    hasGcp   && { name: 'GCP*',  value: data.gcp?.total   || 0 },
                  ].filter(Boolean)}
                  cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                  dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {[hasAws && PROVIDER_COLORS.aws, hasAzure && PROVIDER_COLORS.azure, hasGcp && PROVIDER_COLORS.gcp].filter(Boolean).map((c, i) => (
                    <Cell key={i} fill={c} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtUSD(v)} />
              </PieChart>
            </ResponsiveContainer>
            {hasGcp && data?.gcp?.estimated && (
              <p className="text-xs text-green-500 dark:text-green-400 mt-1">* GCP: valor estimado</p>
            )}
          </div>
        )}
      </div>

      {/* Provider breakdown cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {hasAws && (
          <div className={`card border-l-4 border-l-orange-400 transition-all ${providerFilter !== 'all' && providerFilter !== 'aws' ? 'opacity-40' : ''}`}>
            <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-1">AWS</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtUSD(data.aws?.total)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">período selecionado</p>
          </div>
        )}
        {hasAzure && (
          <div className={`card border-l-4 border-l-sky-400 transition-all ${providerFilter !== 'all' && providerFilter !== 'azure' ? 'opacity-40' : ''}`}>
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1">Azure</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtUSD(data.azure?.total)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">período selecionado</p>
          </div>
        )}
        {hasGcp && (
          <div className={`card border-l-4 border-l-emerald-400 transition-all ${providerFilter !== 'all' && providerFilter !== 'gcp' ? 'opacity-40' : ''}`}>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              GCP
              {data.gcp?.estimated && (
                <span className="text-[10px] font-normal bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded px-1 py-0.5">estimado</span>
              )}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtUSD(data.gcp?.total)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">período selecionado</p>
          </div>
        )}
      </div>
    </>
  );
};

export default CostCharts;
