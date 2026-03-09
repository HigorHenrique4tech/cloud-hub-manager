import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, BarChart2, DollarSign } from 'lucide-react';
import { RoleGate } from '../common/PermissionGate';
import costService from '../../services/costService';

const PERIODS = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m',  days: 180 },
];

const COLORS = [
  '#6366f1', '#f97316', '#0ea5e9', '#10b981', '#f59e0b',
  '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#84cc16',
];

const fmtUSD = (v) =>
  v == null || v === 0 ? '$0.00' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmt = (d) => d.toISOString().slice(0, 10);

function DeltaBadge({ delta }) {
  if (delta == null) return <span className="text-xs text-gray-400">—</span>;
  const isUp = delta >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
      isUp ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
           : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
    }`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

const WorkspaceCostComparison = ({ orgSlug, workspaces = [] }) => {
  const [periodIdx, setPeriodIdx] = useState(0);

  const today = new Date();
  const { days } = PERIODS[periodIdx];
  const endDate   = fmt(today);
  const startDate = fmt(new Date(today.getTime() - days * 86400000));

  // Previous period for delta
  const prevEndDate   = fmt(new Date(today.getTime() - days * 86400000 - 86400000));
  const prevStartDate = fmt(new Date(today.getTime() - days * 2 * 86400000 - 86400000));

  // Fetch costs for ALL workspaces in parallel (current period)
  const costQueries = useQueries({
    queries: workspaces.map((ws) => ({
      queryKey: ['ws-costs-compare', ws.id, startDate, endDate],
      queryFn: () => costService.getCombinedCostsForWorkspace(orgSlug, ws.id, startDate, endDate),
      retry: false,
      staleTime: 300_000,
    })),
  });

  // Fetch costs for ALL workspaces in parallel (previous period)
  const prevCostQueries = useQueries({
    queries: workspaces.map((ws) => ({
      queryKey: ['ws-costs-compare-prev', ws.id, prevStartDate, prevEndDate],
      queryFn: () => costService.getCombinedCostsForWorkspace(orgSlug, ws.id, prevStartDate, prevEndDate),
      retry: false,
      staleTime: 600_000,
    })),
  });

  const isLoading = costQueries.some((q) => q.isLoading);

  // Build rows
  const rows = workspaces.map((ws, i) => {
    const data     = costQueries[i]?.data;
    const prevData = prevCostQueries[i]?.data;
    const total     = data?.total     ?? null;
    const prevTotal = prevData?.total ?? null;
    const delta = total != null && prevTotal != null && prevTotal > 0
      ? ((total - prevTotal) / prevTotal) * 100
      : null;
    return {
      ws,
      total,
      aws_total:   data?.aws_total   ?? 0,
      azure_total: data?.azure_total ?? 0,
      gcp_total:   data?.gcp_total   ?? 0,
      delta,
      loading: costQueries[i]?.isLoading,
    };
  }).sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  const grandTotal = rows.reduce((s, r) => s + (r.total ?? 0), 0);

  // Chart data
  const chartData = rows
    .filter((r) => r.total != null && r.total > 0)
    .map((r) => ({
      name: r.ws.name,
      AWS:   +r.aws_total.toFixed(2),
      Azure: +r.azure_total.toFixed(2),
      GCP:   +r.gcp_total.toFixed(2),
    }));

  if (workspaces.length === 0) return null;

  return (
    <RoleGate allowed={['owner', 'admin']}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Comparação de Custos por Workspace
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Custo total por provedor em cada workspace no período selecionado
              </p>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {PERIODS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setPeriodIdx(i)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === periodIdx
                    ? 'bg-primary text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grand total banner */}
        {!isLoading && grandTotal > 0 && (
          <div className="flex items-center gap-2 mb-5 px-4 py-2.5 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/20">
            <DollarSign className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Total da organização nos últimos <strong>{PERIODS[periodIdx].label}</strong>:
            </span>
            <span className="text-base font-bold text-primary ml-auto">{fmtUSD(grandTotal)}</span>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {['Workspace', 'AWS', 'Azure', 'GCP', 'Total', 'vs Período Anterior', '% do Total'].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: Math.min(workspaces.length, 4) }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="py-3 px-3">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.map((r, i) => {
                const sharePct = grandTotal > 0 && r.total != null
                  ? ((r.total / grandTotal) * 100).toFixed(1)
                  : null;
                return (
                  <tr key={r.ws.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-medium text-gray-800 dark:text-gray-200">{r.ws.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-orange-500 font-mono text-xs">{r.loading ? '...' : fmtUSD(r.aws_total)}</td>
                    <td className="py-3 px-3 text-sky-500 font-mono text-xs">{r.loading ? '...' : fmtUSD(r.azure_total)}</td>
                    <td className="py-3 px-3 text-emerald-500 font-mono text-xs">{r.loading ? '...' : fmtUSD(r.gcp_total)}</td>
                    <td className="py-3 px-3 font-semibold text-gray-900 dark:text-gray-100 font-mono">
                      {r.loading ? '...' : fmtUSD(r.total)}
                    </td>
                    <td className="py-3 px-3">
                      {r.loading ? '...' : <DeltaBadge delta={r.delta} />}
                    </td>
                    <td className="py-3 px-3">
                      {r.loading || sharePct == null ? '...' : (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${sharePct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-8">{sharePct}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!isLoading && grandTotal > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                  <td className="py-2.5 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</td>
                  <td className="py-2.5 px-3 text-orange-500 font-mono text-xs font-semibold">
                    {fmtUSD(rows.reduce((s, r) => s + r.aws_total, 0))}
                  </td>
                  <td className="py-2.5 px-3 text-sky-500 font-mono text-xs font-semibold">
                    {fmtUSD(rows.reduce((s, r) => s + r.azure_total, 0))}
                  </td>
                  <td className="py-2.5 px-3 text-emerald-500 font-mono text-xs font-semibold">
                    {fmtUSD(rows.reduce((s, r) => s + r.gcp_total, 0))}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-gray-900 dark:text-gray-100 font-mono">{fmtUSD(grandTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Bar chart */}
        {!isLoading && chartData.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Distribuição por Provedor
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={65} />
                <Tooltip formatter={(v, name) => [fmtUSD(v), name]} />
                <Legend />
                <Bar dataKey="AWS"   stackId="s" fill="#f97316" radius={[0,0,0,0]} />
                <Bar dataKey="Azure" stackId="s" fill="#0ea5e9" radius={[0,0,0,0]} />
                <Bar dataKey="GCP"   stackId="s" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {!isLoading && grandTotal === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
            Nenhum dado de custo disponível para os workspaces no período selecionado.
          </p>
        )}
      </div>
    </RoleGate>
  );
};

export default WorkspaceCostComparison;
