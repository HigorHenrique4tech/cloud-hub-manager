import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  TrendingUp, Users, AlertTriangle, Target, Loader2, DollarSign,
} from 'lucide-react';
import adminService from '../../services/adminService';

const fmtBRL = (v) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const STATUS_COLORS = {
  pending: '#eab308',
  paid: '#22c55e',
  overdue: '#ef4444',
  cancelled: '#6b7280',
};

const STATUS_LABELS = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Em atraso',
  cancelled: 'Cancelado',
};

const ChartTooltip = ({ active, payload, label, prefix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 shadow-lg text-xs">
      <p className="text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-mono font-semibold text-gray-900 dark:text-gray-100">
          {prefix}{fmtBRL(p.value)}
        </p>
      ))}
    </div>
  );
};

const BillingAnalytics = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['billing-analytics'],
    queryFn: () => adminService.getBillingAnalytics(),
    staleTime: 120_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  const { monthly_revenue, revenue_by_client, overdue_report, forecast, status_distribution, avg_ticket } = data;

  // Combine revenue + forecast for chart
  const revenueWithForecast = [
    ...monthly_revenue.map((d) => ({ ...d, type: 'real' })),
    ...forecast.map((d) => ({ month: d.month, revenue: d.projected, type: 'forecast' })),
  ];

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-green-500" />
            <p className="text-xs text-gray-500 dark:text-gray-400">Ticket Médio</p>
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtBRL(avg_ticket)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <p className="text-xs text-gray-500 dark:text-gray-400">Inadimplentes</p>
          </div>
          <p className="text-lg font-bold text-red-600 dark:text-red-400">{overdue_report.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-3.5 h-3.5 text-indigo-500" />
            <p className="text-xs text-gray-500 dark:text-gray-400">Previsão (próx. mês)</p>
          </div>
          <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{fmtBRL(forecast[0]?.projected)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-blue-500" />
            <p className="text-xs text-gray-500 dark:text-gray-400">Top Cliente</p>
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{revenue_by_client[0]?.client || '—'}</p>
          <p className="text-xs text-gray-400">{fmtBRL(revenue_by_client[0]?.total)}</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Revenue evolution + forecast */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-4">
            <TrendingUp className="w-4 h-4 text-green-500" /> Evolução de Receita
            <span className="text-[10px] text-gray-400 ml-1">(12 meses + previsão)</span>
          </h3>
          {revenueWithForecast.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueWithForecast} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={55} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {revenueWithForecast.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.type === 'forecast' ? '#818cf8' : '#3b82f6'}
                      fillOpacity={entry.type === 'forecast' ? 0.4 : 0.85}
                      stroke={entry.type === 'forecast' ? '#818cf8' : 'none'}
                      strokeWidth={entry.type === 'forecast' ? 1 : 0}
                      strokeDasharray={entry.type === 'forecast' ? '4 4' : 'none'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-gray-400">Sem dados de receita</div>
          )}
        </div>

        {/* Status distribution pie */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Distribuição por Status</h3>
          {status_distribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={status_distribution}
                    dataKey="count"
                    nameKey="status"
                    cx="50%" cy="50%"
                    innerRadius={40} outerRadius={65}
                    paddingAngle={3}
                  >
                    {status_distribution.map((entry, idx) => (
                      <Cell key={idx} fill={STATUS_COLORS[entry.status] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [`${v} cobranças`, STATUS_LABELS[name] || name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {status_distribution.map((s) => (
                  <div key={s.status} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] }} />
                    <span className="text-gray-500 dark:text-gray-400">{STATUS_LABELS[s.status]}</span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[160px] text-sm text-gray-400">Sem dados</div>
          )}
        </div>
      </div>

      {/* Revenue by client */}
      {revenue_by_client.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-4">
            <Users className="w-4 h-4 text-blue-500" /> Receita por Cliente (Top 10)
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(180, revenue_by_client.length * 32)}>
            <BarChart data={revenue_by_client} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="client" tick={{ fontSize: 11 }} width={120} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Overdue report */}
      {overdue_report.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-900/10 p-4">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-4 h-4" /> Relatório de Inadimplência ({overdue_report.length})
          </h3>
          <div className="rounded-lg border border-red-200 dark:border-red-800/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-red-100/50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/30">
                  <th className="text-left py-2 px-3 text-red-700 dark:text-red-400 font-medium text-xs">Cliente</th>
                  <th className="text-left py-2 px-3 text-red-700 dark:text-red-400 font-medium text-xs">Valor</th>
                  <th className="text-left py-2 px-3 text-red-700 dark:text-red-400 font-medium text-xs">Vencimento</th>
                  <th className="text-left py-2 px-3 text-red-700 dark:text-red-400 font-medium text-xs">Dias em Atraso</th>
                  <th className="text-left py-2 px-3 text-red-700 dark:text-red-400 font-medium text-xs">Referência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100 dark:divide-red-800/20">
                {overdue_report.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-gray-800/50">
                    <td className="py-2 px-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.client_name}</p>
                      {r.org_name && <p className="text-xs text-gray-400">{r.org_name}</p>}
                    </td>
                    <td className="py-2 px-3 font-semibold text-gray-900 dark:text-gray-100">{fmtBRL(r.amount)}</td>
                    <td className="py-2 px-3 text-xs text-gray-500">
                      {r.due_date ? new Date(r.due_date).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.days_late > 30
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : r.days_late > 7
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {r.days_late}d
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500 font-mono">{r.period_ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-red-500 dark:text-red-400 mt-2 text-right font-semibold">
            Total em risco: {fmtBRL(overdue_report.reduce((s, r) => s + r.amount, 0))}
          </p>
        </div>
      )}
    </div>
  );
};

export default BillingAnalytics;
