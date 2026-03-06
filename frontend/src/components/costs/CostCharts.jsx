import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const CostCharts = ({ data, hasAws, hasAzure, hasGcp }) => (
  <>
    {/* Line Chart */}
    <div className="card mb-6">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Evolução Diária de Gastos</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data.combined} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={60} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {hasAws   && <Line type="monotone" dataKey="aws"   name="AWS"   stroke="#f97316" strokeWidth={2} dot={false} />}
          {hasAzure && <Line type="monotone" dataKey="azure" name="Azure" stroke="#0ea5e9" strokeWidth={2} dot={false} />}
          {hasGcp   && <Line type="monotone" dataKey="gcp"   name="GCP"   stroke="#10b981" strokeWidth={2} dot={false} />}
          <Line type="monotone" dataKey="total" name="Total" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 2" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>

    {/* Bar + Pie grid */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      {data.by_service?.length > 0 && (
        <div className="card lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Top Serviços por Custo</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.by_service.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" name="Custo" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {[hasAws, hasAzure, hasGcp].filter(Boolean).length >= 2 && (
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
                {[hasAws && '#f97316', hasAzure && '#0ea5e9', hasGcp && '#10b981'].filter(Boolean).map((c, i) => (
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
        <div className="card border-l-4 border-l-orange-400">
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-1">AWS</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtUSD(data.aws?.total)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">período selecionado</p>
        </div>
      )}
      {hasAzure && (
        <div className="card border-l-4 border-l-sky-400">
          <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1">Azure</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtUSD(data.azure?.total)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">período selecionado</p>
        </div>
      )}
      {hasGcp && (
        <div className="card border-l-4 border-l-emerald-400">
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

export default CostCharts;
