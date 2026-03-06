import { Download, Printer, FileText } from 'lucide-react';

const CostExport = ({ data, startDate, endDate, hasAny, onShowReport }) => {
  const exportCSV = () => {
    if (!data) return;
    const date = new Date().toLocaleDateString('pt-BR');
    const rows = [
      ['Relatório de Custos CloudAtlas', '', ''],
      [`Período: ${startDate} a ${endDate}`, '', ''],
      [`Gerado em: ${date}`, '', ''],
      [''],
      ['Data', 'AWS (USD)', 'Azure (USD)', 'GCP (USD)', 'Total (USD)'],
      ...(data.combined || []).map((d) => [d.date, d.aws?.toFixed(4) || 0, d.azure?.toFixed(4) || 0, d.gcp?.toFixed(4) || 0, d.total?.toFixed(4) || 0]),
      [''],
      ['Serviço', 'Valor (USD)', ''],
      ...(data.by_service || []).map((s) => [s.name, s.amount?.toFixed(4), '']),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custos-cloud-${date.replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        onClick={() => onShowReport(true)}
        disabled={!hasAny}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
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
