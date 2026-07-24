import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { Tag, Download } from 'lucide-react';
import { useCostAllocation } from '../../hooks/useCostAllocation';
import { useCurrency } from '../../hooks/useCurrency';

const PROVIDER_COLORS = { aws: '#f59e0b', azure: '#3b82f6', gcp: '#10b981' };

const fmt = (v, fmtCost) => fmtCost(v);

const CostAllocationTab = ({ startDate, endDate }) => {
  const { fmtCost } = useCurrency();
  const [tagKey, setTagKey] = useState('');
  const [inputKey, setInputKey] = useState('');

  const { breakdown, grandTotal, isLoading, availableTagKeys } = useCostAllocation({
    tagKey,
    startDate,
    endDate,
    enabled: !!tagKey,
  });

  const handleSearch = (e) => {
    e.preventDefault();
    setTagKey(inputKey.trim());
  };

  const exportCsv = () => {
    if (!breakdown.length) return;
    const headers = ['Tag Value', 'AWS', 'Azure', 'GCP', 'Total'];
    const rows = breakdown.map((r) => [
      r.tag_value === '__untagged__' ? '(sem tag)' : r.tag_value,
      r.aws.toFixed(4),
      r.azure.toFixed(4),
      r.gcp.toFixed(4),
      r.total.toFixed(4),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cost-allocation-${tagKey}-${startDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chartData = breakdown
    .filter((r) => !r.is_untagged)
    .slice(0, 15)
    .map((r) => ({
      name: r.tag_value.length > 20 ? r.tag_value.slice(0, 18) + '…' : r.tag_value,
      fullName: r.tag_value,
      aws: r.aws,
      azure: r.azure,
      gcp: r.gcp,
    }));

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Chave de Tag
            </label>
            {availableTagKeys.length > 0 ? (
              <select
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                className="input w-full"
              >
                <option value="">Selecionar tag...</option>
                {availableTagKeys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            ) : (
              <input
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                className="input w-full"
                placeholder="ex: cost-center, project, team"
              />
            )}
          </div>
          <button
            type="submit"
            disabled={!inputKey.trim()}
            className="btn-primary flex items-center gap-2"
          >
            <Tag size={14} />
            Analisar
          </button>
          {breakdown.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="btn-secondary flex items-center gap-2"
            >
              <Download size={14} />
              Exportar CSV
            </button>
          )}
        </form>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
          Carregando alocação por tag...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tagKey && breakdown.length === 0 && (
        <div className="card p-8 text-center">
          <Tag size={32} className="mx-auto text-gray-400 mb-2" />
          <p className="text-gray-500 dark:text-gray-400">
            Nenhum custo encontrado para a tag <strong>{tagKey}</strong> no período selecionado.
          </p>
        </div>
      )}

      {/* Chart */}
      {!isLoading && chartData.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Custos por <code className="text-sm bg-gray-100 dark:bg-gray-700 px-1 rounded">{tagKey}</code>
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Total: <strong>{fmtCost(grandTotal)}</strong>
            </span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 60 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748b' }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tickFormatter={(v) => fmtCost(v)}
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={80}
              />
              <Tooltip
                formatter={(value, name) => [fmtCost(value), name.toUpperCase()]}
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload?.fullName || label
                }
              />
              <Legend />
              <Bar dataKey="aws" stackId="a" fill={PROVIDER_COLORS.aws} name="AWS" radius={[0, 0, 0, 0]} />
              <Bar dataKey="azure" stackId="a" fill={PROVIDER_COLORS.azure} name="Azure" />
              <Bar dataKey="gcp" stackId="a" fill={PROVIDER_COLORS.gcp} name="GCP" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      {!isLoading && breakdown.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Valor da Tag</th>
                <th className="px-4 py-3 font-medium text-yellow-600">AWS</th>
                <th className="px-4 py-3 font-medium text-blue-600">Azure</th>
                <th className="px-4 py-3 font-medium text-green-600">GCP</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {breakdown.map((row) => (
                <tr
                  key={row.tag_value}
                  className={`table-row-hover ${row.is_untagged ? 'text-gray-400 dark:text-gray-500 italic' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    {row.is_untagged ? '(sem tag)' : row.tag_value}
                  </td>
                  <td className="px-4 py-2.5">{row.aws > 0 ? fmtCost(row.aws) : '—'}</td>
                  <td className="px-4 py-2.5">{row.azure > 0 ? fmtCost(row.azure) : '—'}</td>
                  <td className="px-4 py-2.5">{row.gcp > 0 ? fmtCost(row.gcp) : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmtCost(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-700/50 font-semibold">
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">Total</td>
                <td className="px-4 py-2.5">{fmtCost(breakdown.reduce((s, r) => s + r.aws, 0))}</td>
                <td className="px-4 py-2.5">{fmtCost(breakdown.reduce((s, r) => s + r.azure, 0))}</td>
                <td className="px-4 py-2.5">{fmtCost(breakdown.reduce((s, r) => s + r.gcp, 0))}</td>
                <td className="px-4 py-2.5 text-right">{fmtCost(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default CostAllocationTab;
