import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { X, Download, TrendingUp, DollarSign, FileText, Loader2 } from 'lucide-react';
import ReportSuggestions, { generateSuggestions } from './ReportSuggestions';
import { useBranding } from '../../contexts/BrandingContext';
import { useCurrency } from '../../hooks/useCurrency';
import api, { wsUrl } from '../../services/api';

const PROVIDER_COLORS = { aws: '#f97316', azure: '#0ea5e9', gcp: '#10b981' };

/* ── sub-components ──────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  const fmt = formatter || ((v) => `$${Number(v).toFixed(2)}`);
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm text-gray-800">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

/* ── Main component ──────────────────────────────────────── */
const CostReportModal = ({ data, metrics, startDate, endDate, periodLabel, days, onClose }) => {
  const branding = useBranding();
  const { fmtCost, currencyLabel, currency } = useCurrency();
  // fmt wraps fmtCost passing the display currency so values already in display
  // currency (from metrics) are not double-converted (e.g. BRL * rate again)
  const fmt = (v) => fmtCost(v, currency);
  const [exporting, setExporting] = useState(false);
  const hasAws   = !!data?.aws;
  const hasAzure = !!data?.azure;
  const hasGcp   = !!data?.gcp;

  // Use normalized totals from metrics (currency-converted) rather than raw data values
  const awsTotal   = metrics?.awsTotal   ?? data?.aws?.total   ?? 0;
  const azureTotal = metrics?.azureTotal ?? data?.azure?.total ?? 0;
  const gcpTotal   = metrics?.gcpTotal   ?? data?.gcp?.total   ?? 0;
  const grandTotal = metrics?.total      ?? data?.total        ?? 0;

  // Use normalized daily combined from metrics
  const combinedData = metrics?.combined?.length ? metrics.combined : (data?.combined || []);
  const generatedAt = new Date().toLocaleString('pt-BR');

  const suggestions = useMemo(() => generateSuggestions(data, days), [data, days]);
  const totalSaving = suggestions.reduce((a, s) => a + (s.saving || 0), 0);

  const topServices = useMemo(() =>
    (data.by_service || []).slice(0, 10).map((s) => ({
      ...s,
      pct: grandTotal ? +((s.amount / grandTotal) * 100).toFixed(1) : 0,
    })), [data, grandTotal]);

  const pieData = useMemo(() =>
    [
      hasAws   && { name: 'AWS',   value: awsTotal,   color: PROVIDER_COLORS.aws   },
      hasAzure && { name: 'Azure', value: azureTotal, color: PROVIDER_COLORS.azure },
      hasGcp   && { name: 'GCP',   value: gcpTotal,   color: PROVIDER_COLORS.gcp   },
    ].filter(Boolean).filter((d) => d.value > 0), [awsTotal, azureTotal, gcpTotal, hasAws, hasAzure, hasGcp]);

  const downloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const url = wsUrl(`/costs/report?start_date=${startDate}&end_date=${endDate}&format=pdf`);
      const response = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
      link.download = `custos-cloud-${dateStr}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="cost-report-overlay fixed inset-0 z-50 bg-black/60 overflow-y-auto">
      <div
        id="cost-report-print"
        className="min-h-screen bg-white dark:bg-gray-900 max-w-5xl mx-auto my-6 rounded-xl shadow-2xl"
      >
        {/* Toolbar */}
        <div className="no-print sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-t-xl">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Relatório Detalhado de Custos
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadPdf}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-60 transition-colors"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Baixar PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">

          {/* ── Print header with logo ── */}
          <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 mb-2 print:mb-4">
            <span>{generatedAt}</span>
            <div className="flex items-center gap-2">
              <img
                src={branding.logo_dark_url || branding.logo_light_url || '/logo.png'}
                alt={branding.platform_name}
                className="h-5 w-auto object-contain"
              />
              <span className="font-semibold text-gray-600 dark:text-gray-300">{branding.platform_name}</span>
            </div>
          </div>

          {/* ── Report header ── */}
          <div className="flex items-start justify-between border-b-2 border-primary pb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Relatório de Custos Cloud</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Período: <strong className="text-gray-700 dark:text-gray-300">{startDate}</strong> →{' '}
                <strong className="text-gray-700 dark:text-gray-300">{endDate}</strong>{' '}
                <span className="text-gray-400">({periodLabel})</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Gerado em: {generatedAt}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest text-primary font-semibold">{branding.platform_name}</p>
              <p className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 mt-1">{fmt(grandTotal)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">total no período</p>
            </div>
          </div>

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total do Período', value: fmt(metrics.total),      sub: periodLabel,                   color: 'text-primary-dark dark:text-primary-light' },
              { label: 'Média Diária',     value: fmt(metrics.avgDaily),    sub: `${days} dias`,                color: 'text-green-600 dark:text-green-400'   },
              { label: 'Projeção Mensal',  value: fmt(metrics.projection),  sub: 'baseado na média',            color: 'text-purple-600 dark:text-purple-400' },
              {
                label: 'Maior Serviço',
                value: metrics.topService ? fmt(metrics.topService.amount) : '—',
                sub:   metrics.topService?.name || '—',
                color: 'text-orange-600 dark:text-orange-400',
              },
            ].map((c) => (
              <div key={c.label} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{c.label}</p>
                <p className={`text-xl font-bold mt-1 ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Cloud breakdown ── */}
          {(hasAws || hasAzure || hasGcp) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {hasAws && (
                <div className="border border-orange-200 dark:border-orange-800 rounded-lg p-4 bg-orange-50/50 dark:bg-orange-900/10">
                  <span className="text-xs font-bold uppercase bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">AWS</span>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{fmt(awsTotal)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {grandTotal ? ((awsTotal / grandTotal) * 100).toFixed(1) : 0}% do total
                  </p>
                </div>
              )}
              {hasAzure && (
                <div className="border border-sky-200 dark:border-sky-800 rounded-lg p-4 bg-sky-50/50 dark:bg-sky-900/10">
                  <span className="text-xs font-bold uppercase bg-sky-100 dark:bg-sky-800 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded">Azure</span>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{fmt(azureTotal)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {grandTotal ? ((azureTotal / grandTotal) * 100).toFixed(1) : 0}% do total
                  </p>
                </div>
              )}
              {hasGcp && (
                <div className="border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 bg-emerald-50/50 dark:bg-emerald-900/10">
                  <span className="text-xs font-bold uppercase bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                    GCP
                    {data.gcp?.estimated && <span className="font-normal normal-case text-[10px]">(estimado)</span>}
                  </span>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{fmt(gcpTotal)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {grandTotal ? ((gcpTotal / grandTotal) * 100).toFixed(1) : 0}% do total
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Daily trend chart ── */}
          {combinedData.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Evolução Diária de Gastos
              </h2>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/30 dark:bg-gray-800/30">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={combinedData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v)} width={65} />
                    <Tooltip content={<ChartTooltip formatter={fmt} />} />
                    <Legend />
                    {hasAws   && <Line type="monotone" dataKey="aws"   name="AWS"   stroke="#f97316" strokeWidth={2} dot={false} />}
                    {hasAzure && <Line type="monotone" dataKey="azure" name="Azure" stroke="#0ea5e9" strokeWidth={2} dot={false} />}
                    {hasGcp   && <Line type="monotone" dataKey="gcp"   name="GCP"   stroke="#10b981" strokeWidth={2} dot={false} />}
                    <Line type="monotone" dataKey="total" name="Total" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Top services ── */}
          {topServices.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                Breakdown por Serviço (Top {topServices.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Bar chart */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/30 dark:bg-gray-800/30">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topServices.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip formatter={fmt} />} />
                      <Bar dataKey="amount" name="Custo" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Table */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Serviço</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Custo</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                      {topServices.map((s, i) => (
                        <tr key={s.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{s.name}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmt(s.amount)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="w-12 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                <div
                                  className="bg-primary h-1.5 rounded-full"
                                  style={{ width: `${Math.min(100, s.pct)}%` }}
                                />
                              </div>
                              <span className="text-gray-600 dark:text-gray-300 tabular-nums">{s.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-800 font-bold border-t border-gray-200 dark:border-gray-700">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wide">Total</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmt(grandTotal)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Provider distribution pie ── */}
          {pieData.length > 1 && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Distribuição por Provedor</h2>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/30 dark:bg-gray-800/30 flex justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [fmt(v)]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Smart suggestions ── */}
          <ReportSuggestions suggestions={suggestions} totalSaving={totalSaving} />

          {/* ── Daily data table ── */}
          {combinedData.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Dados Diários Completos</h2>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data</th>
                        {hasAws   && <th className="px-3 py-2 text-right font-medium text-orange-500 dark:text-orange-400 uppercase tracking-wider">AWS</th>}
                        {hasAzure && <th className="px-3 py-2 text-right font-medium text-sky-500 dark:text-sky-400 uppercase tracking-wider">Azure</th>}
                        {hasGcp   && <th className="px-3 py-2 text-right font-medium text-emerald-500 dark:text-emerald-400 uppercase tracking-wider">GCP</th>}
                        <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                      {combinedData.map((d) => (
                        <tr key={d.date} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{d.date}</td>
                          {hasAws   && <td className="px-3 py-1.5 text-right font-mono text-orange-600 dark:text-orange-400">{fmt(d.aws)}</td>}
                          {hasAzure && <td className="px-3 py-1.5 text-right font-mono text-sky-600 dark:text-sky-400">{fmt(d.azure)}</td>}
                          {hasGcp   && <td className="px-3 py-1.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmt(d.gcp)}</td>}
                          <td className="px-3 py-1.5 text-right font-mono font-semibold text-gray-900 dark:text-gray-100">{fmt(d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-800 font-bold border-t-2 border-gray-300 dark:border-gray-600">
                      <tr>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 uppercase tracking-wide text-xs">Total</td>
                        {hasAws   && <td className="px-3 py-2 text-right font-mono text-orange-700 dark:text-orange-300">{fmt(awsTotal)}</td>}
                        {hasAzure && <td className="px-3 py-2 text-right font-mono text-sky-700 dark:text-sky-300">{fmt(azureTotal)}</td>}
                        {hasGcp   && <td className="px-3 py-2 text-right font-mono text-emerald-700 dark:text-emerald-300">{fmt(gcpTotal)}</td>}
                        <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmt(grandTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <img
              src={branding.logo_dark_url || branding.logo_light_url || '/logo.png'}
              alt={branding.platform_name}
              className="h-4 w-auto object-contain opacity-60"
            />
            Relatório gerado automaticamente pelo <strong className="text-gray-500 dark:text-gray-400">{branding.platform_name}</strong> · {generatedAt}
          </div>

        </div>
      </div>
    </div>
  );
};

export default CostReportModal;
