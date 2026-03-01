import { useEffect, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  X, Printer, Lightbulb, TrendingUp, DollarSign,
  AlertTriangle, CheckCircle2, Info, FileText,
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────── */
const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PROVIDER_COLORS = { aws: '#f97316', azure: '#0ea5e9', gcp: '#10b981' };

/* ── rule-based suggestions ─────────────────────────────── */
const generateSuggestions = (data, days) => {
  const suggestions = [];
  const total = data.total || 0;
  if (total === 0) return suggestions;

  const services = data.by_service || [];

  // Compute: EC2, VM, Compute
  const computeSvcs = services.filter((s) => /EC2|Compute|Virtual Machine|VMs?/i.test(s.name));
  const computeTotal = computeSvcs.reduce((a, s) => a + s.amount, 0);
  if (computeTotal / total > 0.35) {
    suggestions.push({
      type: 'warning', icon: AlertTriangle,
      title: 'Alto gasto em computação',
      description: `${((computeTotal / total) * 100).toFixed(0)}% do custo (${fmtUSD(computeTotal)}) está em instâncias de computação. Considere Reserved Instances ou Savings Plans para economizar até 60%.`,
      saving: computeTotal * 0.4,
    });
  }

  // Storage: S3, Blob, Disk
  const storageSvcs = services.filter((s) => /S3|Storage|Blob|Disk/i.test(s.name));
  const storageTotal = storageSvcs.reduce((a, s) => a + s.amount, 0);
  if (storageTotal / total > 0.20) {
    suggestions.push({
      type: 'info', icon: Info,
      title: 'Custo de armazenamento elevado',
      description: `${fmtUSD(storageTotal)} em armazenamento (${((storageTotal / total) * 100).toFixed(0)}% do total). Políticas de ciclo de vida, compressão e camadas inteligentes podem reduzir até 40%.`,
      saving: storageTotal * 0.3,
    });
  }

  // Data transfer
  const transferSvcs = services.filter((s) => /Data Transfer|Bandwidth|Egress|Network/i.test(s.name));
  const transferTotal = transferSvcs.reduce((a, s) => a + s.amount, 0);
  if (transferTotal / total > 0.10) {
    suggestions.push({
      type: 'info', icon: Info,
      title: 'Custo de transferência de dados',
      description: `${fmtUSD(transferTotal)} em transferência de dados. Use CDN (CloudFront/Akamai), VPC endpoints e revise o tráfego inter-regiões para reduzir até 25%.`,
      saving: transferTotal * 0.25,
    });
  }

  // Databases: RDS, SQL, Aurora, Cosmos
  const dbSvcs = services.filter((s) => /RDS|SQL|Database|Aurora|Cosmos/i.test(s.name));
  const dbTotal = dbSvcs.reduce((a, s) => a + s.amount, 0);
  if (dbTotal / total > 0.20) {
    suggestions.push({
      type: 'warning', icon: AlertTriangle,
      title: 'Alto custo em bancos de dados',
      description: `${fmtUSD(dbTotal)} em banco de dados. Avalie Aurora Serverless, Reserved Instances para RDS ou migração para DynamoDB onde aplicável.`,
      saving: dbTotal * 0.35,
    });
  }

  // Single cloud provider (when only one provider has data)
  const activeProviders = [data.aws && 'AWS', data.azure && 'Azure', data.gcp && 'GCP'].filter(Boolean);
  if (activeProviders.length === 1) {
    suggestions.push({
      type: 'info', icon: Info,
      title: 'Dependência de único provedor',
      description: `Todo o gasto está concentrado em ${activeProviders[0]}. Avaliar outros provedores para workloads específicos pode aumentar resiliência e abrir negociação de volume.`,
      saving: null,
    });
  }

  // High average daily cost — tag recommendation
  const avgDaily = total / days;
  if (avgDaily > 200) {
    suggestions.push({
      type: 'success', icon: CheckCircle2,
      title: 'Implantar tagging e alocação de custos',
      description: `Com gasto médio de ${fmtUSD(avgDaily)}/dia, tags de ambiente (prod/dev/staging) permitem identificar e eliminar recursos desnecessários em ambientes de desenvolvimento.`,
      saving: avgDaily * 0.10 * 30,
    });
  }

  // Top service > 60% of total
  const top1 = services[0];
  if (top1 && top1.amount / total > 0.60) {
    suggestions.push({
      type: 'warning', icon: AlertTriangle,
      title: 'Concentração excessiva em um serviço',
      description: `"${top1.name}" representa ${((top1.amount / total) * 100).toFixed(0)}% do custo total. Revisar dimensionamento e utilização deste serviço deve ser prioridade.`,
      saving: top1.amount * 0.15,
    });
  }

  return suggestions.slice(0, 5);
};

/* ── sub-components ──────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm text-gray-800">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtUSD(p.value)}
        </p>
      ))}
    </div>
  );
};

const SuggestionCard = ({ suggestion }) => {
  const { icon: Icon, type, title, description, saving } = suggestion;
  const s = {
    warning: { border: 'border-amber-200 dark:border-amber-800', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400', title: 'text-amber-800 dark:text-amber-300' },
    info:    { border: 'border-blue-200 dark:border-blue-800',   bg: 'bg-blue-50 dark:bg-blue-900/20',   icon: 'text-blue-600 dark:text-blue-400',   title: 'text-blue-800 dark:text-blue-300' },
    success: { border: 'border-green-200 dark:border-green-800', bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400', title: 'text-green-800 dark:text-green-300' },
  }[type] || { border: 'border-gray-200', bg: 'bg-gray-50', icon: 'text-gray-600', title: 'text-gray-800' };

  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${s.border} ${s.bg}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.icon}`} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${s.title}`}>{title}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{description}</p>
        {saving != null && (
          <p className="text-xs text-green-700 dark:text-green-400 font-medium mt-1.5">
            Economia potencial estimada: ~{fmtUSD(saving)}/mês
          </p>
        )}
      </div>
    </div>
  );
};

/* ── Main component ──────────────────────────────────────── */
const CostReportModal = ({ data, metrics, startDate, endDate, periodLabel, days, onClose }) => {
  const hasAws   = !!data?.aws;
  const hasAzure = !!data?.azure;
  const hasGcp   = !!data?.gcp;
  const generatedAt = new Date().toLocaleString('pt-BR');

  const suggestions = useMemo(() => generateSuggestions(data, days), [data, days]);
  const totalSaving = suggestions.reduce((a, s) => a + (s.saving || 0), 0);

  const topServices = useMemo(() =>
    (data.by_service || []).slice(0, 10).map((s) => ({
      ...s,
      pct: data.total ? +((s.amount / data.total) * 100).toFixed(1) : 0,
    })), [data]);

  const pieData = useMemo(() =>
    [
      hasAws   && { name: 'AWS',   value: data.aws?.total   || 0, color: PROVIDER_COLORS.aws   },
      hasAzure && { name: 'Azure', value: data.azure?.total || 0, color: PROVIDER_COLORS.azure },
      hasGcp   && { name: 'GCP',   value: data.gcp?.total   || 0, color: PROVIDER_COLORS.gcp   },
    ].filter(Boolean).filter((d) => d.value > 0), [data, hasAws, hasAzure, hasGcp]);

  // Inject print CSS — hide everything except the report modal
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'cost-report-print-style';
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        .cost-report-overlay {
          position: static !important;
          background: transparent !important;
          overflow: visible !important;
        }
        #cost-report-print, #cost-report-print * { visibility: visible !important; }
        #cost-report-print {
          position: absolute !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important; max-width: 100% !important;
          overflow: visible !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          background: white !important;
          margin: 0 !important;
          min-height: auto !important;
        }
        .no-print { display: none !important; }
        @page { margin: 1.5cm; size: A4 portrait; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div className="cost-report-overlay fixed inset-0 z-50 bg-black/60 overflow-y-auto">
      <div
        id="cost-report-print"
        className="min-h-screen bg-white dark:bg-gray-900 max-w-5xl mx-auto my-6 rounded-xl shadow-2xl"
      >
        {/* Toolbar */}
        <div className="no-print sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-t-xl">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            Relatório Detalhado de Custos
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
            >
              <Printer className="w-4 h-4" /> Imprimir / PDF
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

          {/* ── Report header ── */}
          <div className="flex items-start justify-between border-b-2 border-indigo-600 pb-4">
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
              <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold">CloudAtlas</p>
              <p className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 mt-1">{fmtUSD(data.total)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">total no período</p>
            </div>
          </div>

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total do Período', value: fmtUSD(metrics.total),      sub: periodLabel,                   color: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Média Diária',     value: fmtUSD(metrics.avgDaily),    sub: `${days} dias`,                color: 'text-green-600 dark:text-green-400'   },
              { label: 'Projeção Mensal',  value: fmtUSD(metrics.projection),  sub: 'baseado na média',            color: 'text-purple-600 dark:text-purple-400' },
              {
                label: 'Maior Serviço',
                value: metrics.topService ? fmtUSD(metrics.topService.amount) : '—',
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
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{fmtUSD(data.aws.total)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {data.total ? ((data.aws.total / data.total) * 100).toFixed(1) : 0}% do total
                  </p>
                </div>
              )}
              {hasAzure && (
                <div className="border border-sky-200 dark:border-sky-800 rounded-lg p-4 bg-sky-50/50 dark:bg-sky-900/10">
                  <span className="text-xs font-bold uppercase bg-sky-100 dark:bg-sky-800 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded">Azure</span>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{fmtUSD(data.azure.total)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {data.total ? ((data.azure.total / data.total) * 100).toFixed(1) : 0}% do total
                  </p>
                </div>
              )}
              {hasGcp && (
                <div className="border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 bg-emerald-50/50 dark:bg-emerald-900/10">
                  <span className="text-xs font-bold uppercase bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                    GCP
                    {data.gcp?.estimated && <span className="font-normal normal-case text-[10px]">(estimado)</span>}
                  </span>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{fmtUSD(data.gcp.total)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {data.total ? ((data.gcp.total / data.total) * 100).toFixed(1) : 0}% do total
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Daily trend chart ── */}
          {data.combined?.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                Evolução Diária de Gastos
              </h2>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/30 dark:bg-gray-800/30">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.combined} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={55} />
                    <Tooltip content={<ChartTooltip />} />
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
                <DollarSign className="w-4 h-4 text-indigo-500" />
                Breakdown por Serviço (Top {topServices.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Bar chart */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/30 dark:bg-gray-800/30">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topServices.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
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
                          <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtUSD(s.amount)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="w-12 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                <div
                                  className="bg-indigo-500 h-1.5 rounded-full"
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
                        <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtUSD(data.total)}</td>
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
                    <Tooltip formatter={(v) => fmtUSD(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Smart suggestions ── */}
          {suggestions.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                Sugestões de Otimização
              </h2>
              {totalSaving > 0 && (
                <p className="text-sm text-green-600 dark:text-green-400 mb-3">
                  Economia potencial total estimada:{' '}
                  <strong>{fmtUSD(totalSaving)}/mês</strong>
                </p>
              )}
              <div className="space-y-3">
                {suggestions.map((s, i) => <SuggestionCard key={i} suggestion={s} />)}
              </div>
            </div>
          )}

          {/* ── Daily data table ── */}
          {data.combined?.length > 0 && (
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
                      {data.combined.map((d) => (
                        <tr key={d.date} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{d.date}</td>
                          {hasAws   && <td className="px-3 py-1.5 text-right font-mono text-orange-600 dark:text-orange-400">{fmtUSD(d.aws)}</td>}
                          {hasAzure && <td className="px-3 py-1.5 text-right font-mono text-sky-600 dark:text-sky-400">{fmtUSD(d.azure)}</td>}
                          {hasGcp   && <td className="px-3 py-1.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtUSD(d.gcp)}</td>}
                          <td className="px-3 py-1.5 text-right font-mono font-semibold text-gray-900 dark:text-gray-100">{fmtUSD(d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-800 font-bold border-t-2 border-gray-300 dark:border-gray-600">
                      <tr>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 uppercase tracking-wide text-xs">Total</td>
                        {hasAws   && <td className="px-3 py-2 text-right font-mono text-orange-700 dark:text-orange-300">{fmtUSD(data.aws?.total)}</td>}
                        {hasAzure && <td className="px-3 py-2 text-right font-mono text-sky-700 dark:text-sky-300">{fmtUSD(data.azure?.total)}</td>}
                        {hasGcp   && <td className="px-3 py-2 text-right font-mono text-emerald-700 dark:text-emerald-300">{fmtUSD(data.gcp?.total)}</td>}
                        <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtUSD(data.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 text-center text-xs text-gray-400 dark:text-gray-500">
            Relatório gerado automaticamente pelo <strong className="text-gray-500 dark:text-gray-400">CloudAtlas</strong> · {generatedAt}
          </div>

        </div>
      </div>
    </div>
  );
};

export default CostReportModal;
