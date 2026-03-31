import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useBranding } from '../../contexts/BrandingContext';
import api, { wsUrl } from '../../services/api';

const CostExport = ({ data, startDate, endDate, hasAny, onShowReport }) => {
  const branding = useBranding();
  const [exporting, setExporting] = useState(null); // 'pdf' | 'csv' | null

  const downloadReport = async (format) => {
    if (exporting) return;
    setExporting(format);
    try {
      const url = wsUrl(`/costs/report?start_date=${startDate}&end_date=${endDate}&format=${format}`);
      const response = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
      link.download = `custos-cloud-${dateStr}.${format}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error(`Erro ao exportar ${format}:`, err);
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <button
        onClick={() => onShowReport(true)}
        disabled={!hasAny}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-40 transition-colors"
      >
        <FileText className="w-4 h-4" /> Relatorio
      </button>
      <button
        onClick={() => downloadReport('pdf')}
        disabled={!hasAny || exporting === 'pdf'}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
      >
        {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} PDF
      </button>
      <button
        onClick={() => downloadReport('csv')}
        disabled={!hasAny || exporting === 'csv'}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
      >
        {exporting === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} CSV
      </button>
    </>
  );
};

export default CostExport;
