import { Download, Printer, FileText } from 'lucide-react';
import { useBranding } from '../../contexts/BrandingContext';

const fmt2 = (v) => (v == null ? '0.00' : Number(v).toFixed(2));
const fmtVal = (v) => (v == null || v === 0 ? '—' : Number(v).toFixed(2));

const CostExport = ({ data, startDate, endDate, hasAny, onShowReport }) => {
  const branding = useBranding();
  const exportCSV = () => {
    if (!data) return;

    const genDate = new Date().toLocaleDateString('pt-BR');
    const daily = data.combined || [];
    const services = data.by_service || [];

    // ── Aggregate totals ────────────────────────────────────────────────────
    const totals = daily.reduce(
      (acc, d) => ({
        aws:   acc.aws   + (d.aws   ?? 0),
        azure: acc.azure + (d.azure ?? 0),
        gcp:   acc.gcp   + (d.gcp   ?? 0),
        total: acc.total + (d.total ?? 0),
      }),
      { aws: 0, azure: 0, gcp: 0, total: 0 }
    );
    const days = daily.length || 1;
    const avgDaily = totals.total / days;
    const projected = avgDaily * 30;
    const serviceTotal = services.reduce((s, sv) => s + (sv.amount ?? 0), 0);

    // ── Build rows ──────────────────────────────────────────────────────────
    const rows = [
      // Header metadata
      [`Relatório de Custos ${branding.platform_name}`, '', '', '', ''],
      [`Período: ${startDate} a ${endDate}`, '', '', '', ''],
      [`Gerado em: ${genDate}`, '', '', '', ''],
      ['', '', '', '', ''],

      // Summary block
      ['=== RESUMO ===', '', '', '', ''],
      [`Custo Total (USD)`, fmt2(totals.total), '', '', ''],
      [`Média Diária (USD)`, fmt2(avgDaily), '', '', ''],
      [`Projeção 30 dias (USD)`, fmt2(projected), '', '', ''],
      [`Total de dias no período`, String(days), '', '', ''],
      ['', '', '', '', ''],

      // Daily costs table
      ['=== CUSTOS DIÁRIOS ===', '', '', '', ''],
      ['Data', 'AWS (USD)', 'Azure (USD)', 'GCP (USD)', 'Total (USD)'],
      ...daily.map((d) => [
        d.date,
        fmtVal(d.aws),
        fmtVal(d.azure),
        fmtVal(d.gcp),
        fmt2(d.total),
      ]),
      // Totals row
      [
        'TOTAL',
        fmtVal(totals.aws),
        fmtVal(totals.azure),
        fmtVal(totals.gcp),
        fmt2(totals.total),
      ],
      ['', '', '', '', ''],

      // Services breakdown table
      ['=== CUSTOS POR SERVIÇO ===', '', '', '', ''],
      ['Serviço', 'Valor (USD)', '% do Total', '', ''],
      ...services.map((s) => {
        const pct = serviceTotal > 0
          ? ((s.amount ?? 0) / serviceTotal * 100).toFixed(1) + '%'
          : '—';
        return [s.name, fmt2(s.amount), pct, '', ''];
      }),
      // Services total row
      ['TOTAL', fmt2(serviceTotal), '100.0%', '', ''],
    ];

    const csv = rows.map((r) => r.map((cell) => {
      // Wrap cells containing commas or quotes in double quotes
      const str = String(cell ?? '');
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custos-cloud-${genDate.replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        onClick={() => onShowReport(true)}
        disabled={!hasAny}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-40 transition-colors"
      >
        <FileText className="w-4 h-4" /> Relatório Detalhado
      </button>
      <button
        onClick={exportCSV}
        disabled={!hasAny}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
      >
        <Download className="w-4 h-4" /> CSV
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <Printer className="w-4 h-4" /> PDF
      </button>
    </>
  );
};

export default CostExport;
