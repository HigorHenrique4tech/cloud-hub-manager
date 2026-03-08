import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Calendar, X } from 'lucide-react';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import CostReportModal from '../components/finops/CostReportModal';
import MetricCard from '../components/costs/MetricCard';
import AlertModal from '../components/costs/AlertModal';
import CostCharts from '../components/costs/CostCharts';
import CostTable from '../components/costs/CostTable';
import CostExport from '../components/costs/CostExport';
import CostHeatmap from '../components/costs/CostHeatmap';
import costService from '../services/costService';
import alertService from '../services/alertService';

const today = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);
const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PERIODS = [
  { label: '30d',   days: 30  },
  { label: '90d',   days: 90  },
  { label: '6m',    days: 180 },
  { label: '1 ano', days: 365 },
];

const PROVIDER_FILTERS = [
  { key: 'all',   label: 'Todos' },
  { key: 'aws',   label: 'AWS',   color: 'text-orange-500' },
  { key: 'azure', label: 'Azure', color: 'text-sky-500' },
  { key: 'gcp',   label: 'GCP',   color: 'text-emerald-500' },
];

function calcDelta(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const Costs = () => {
  const [periodIdx, setPeriodIdx]         = useState(0);
  const [isCustom, setIsCustom]           = useState(false);
  const [customStart, setCustomStart]     = useState('');
  const [customEnd, setCustomEnd]         = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [showModal, setShowModal]         = useState(false);
  const [showReport, setShowReport]       = useState(false);
  const qc = useQueryClient();

  // ── Date range ─────────────────────────────────────────────────────────────
  const { days } = PERIODS[periodIdx];
  const endDate   = isCustom && customEnd   ? customEnd   : fmt(today);
  const startDate = isCustom && customStart ? customStart : fmt(new Date(today.getTime() - days * 86400000));

  // Previous period (same duration, shifted back)
  const periodMs = (new Date(endDate) - new Date(startDate));
  const prevEndDate   = fmt(new Date(new Date(startDate).getTime() - 86400000));
  const prevStartDate = fmt(new Date(new Date(startDate).getTime() - periodMs - 86400000));

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['combined-costs', startDate, endDate],
    queryFn: () => costService.getCombinedCosts(startDate, endDate, 'DAILY'),
    retry: false,
  });

  const { data: prevData } = useQuery({
    queryKey: ['combined-costs', prevStartDate, prevEndDate],
    queryFn: () => costService.getCombinedCosts(prevStartDate, prevEndDate, 'DAILY'),
    retry: false,
    staleTime: 600_000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertService.listAlerts(),
    retry: false,
  });

  const { data: eventsData } = useQuery({
    queryKey: ['alert-events'],
    queryFn: () => alertService.getEvents({ unread_only: false, limit: 10 }),
    retry: false,
  });
  const events = eventsData?.events || eventsData || [];

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (d) => alertService.createAlert(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); setShowModal(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => alertService.deleteAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => alertService.markEventRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-events'] });
      qc.invalidateQueries({ queryKey: ['alert-events-unread'] });
    },
  });

  // ── Metrics + deltas ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    if (!data) return null;
    const total = data.total || 0;
    const avgDaily = data.combined?.length ? total / data.combined.length : 0;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - today.getDate();
    const projection = ((data.aws?.total || 0) + (data.azure?.total || 0) + (data.gcp?.total || 0)) > 0
      ? avgDaily * daysLeft + total
      : 0;
    const topService = data.by_service?.[0];

    // Deltas vs previous period
    const prevTotal    = prevData?.total || 0;
    const prevAvg      = prevData?.combined?.length ? prevTotal / prevData.combined.length : 0;
    const deltaTotal   = calcDelta(total, prevTotal);
    const deltaAvgDay  = calcDelta(avgDaily, prevAvg);

    return { total, avgDaily, projection, topService, deltaTotal, deltaAvgDay };
  }, [data, prevData]);

  if (isLoading) return <Layout><LoadingSpinner text="Carregando dados de custos..." /></Layout>;

  const hasAws   = !!data?.aws;
  const hasAzure = !!data?.azure;
  const hasGcp   = !!data?.gcp;
  const hasAny   = hasAws || hasAzure || hasGcp;

  const activePeriodLabel = isCustom
    ? `${customStart} → ${customEnd}`
    : PERIODS[periodIdx].label;

  return (
    <Layout>
      {showModal && (
        <AlertModal
          onClose={() => setShowModal(false)}
          onSave={(d) => createMutation.mutate(d)}
        />
      )}

      {showReport && data && metrics && (
        <CostReportModal
          data={data} metrics={metrics}
          startDate={startDate} endDate={endDate}
          periodLabel={activePeriodLabel} days={days}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Análise de Custos</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {startDate} → {endDate}
            {!hasAws   && <span className="ml-2 text-yellow-600 dark:text-yellow-400">(sem dados AWS)</span>}
            {!hasAzure && <span className="ml-2 text-yellow-600 dark:text-yellow-400">(sem dados Azure)</span>}
            {hasGcp && data?.gcp?.estimated && <span className="ml-2 text-green-600 dark:text-green-400">(GCP estimado)</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap no-print">
          {/* Preset period buttons */}
          {!isCustom && (
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {PERIODS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => setPeriodIdx(i)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    i === periodIdx
                      ? 'bg-primary text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Custom date picker */}
          {isCustom ? (
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="text-sm bg-transparent text-gray-700 dark:text-gray-300 border-none outline-none"
              />
              <span className="text-gray-400 text-xs">→</span>
              <input
                type="date"
                value={customEnd}
                max={fmt(today)}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="text-sm bg-transparent text-gray-700 dark:text-gray-300 border-none outline-none"
              />
              <button
                onClick={() => { setIsCustom(false); setCustomStart(''); setCustomEnd(''); }}
                className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                title="Remover filtro customizado"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setIsCustom(true); setCustomStart(startDate); setCustomEnd(endDate); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Período personalizado"
            >
              <Calendar className="w-4 h-4" /> Personalizado
            </button>
          )}

          <CostExport
            data={data} startDate={startDate} endDate={endDate}
            hasAny={hasAny} onShowReport={setShowReport}
          />
        </div>
      </div>

      {/* Provider filter chips */}
      {hasAny && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">Filtrar:</span>
          {PROVIDER_FILTERS.map(({ key, label, color }) => {
            const disabled = key !== 'all' && (
              (key === 'aws'   && !hasAws)   ||
              (key === 'azure' && !hasAzure) ||
              (key === 'gcp'   && !hasGcp)
            );
            if (disabled) return null;
            return (
              <button
                key={key}
                onClick={() => setProviderFilter(key)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                  providerFilter === key
                    ? 'border-primary bg-primary/10 text-primary dark:text-primary'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                } ${color || ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* No credentials warning */}
      {!hasAny && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">Nenhum dado de custo disponível. Configure credenciais AWS e/ou Azure em <strong>Configurações</strong> e verifique as permissões para Cost Explorer / Cost Management.</span>
        </div>
      )}

      {/* Metric Cards */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={DollarSign}
            label={`Total (${activePeriodLabel})`}
            value={fmtUSD(metrics.total)}
            color="blue"
            delta={metrics.deltaTotal}
          />
          <MetricCard
            icon={TrendingUp}
            label="Média Diária"
            value={fmtUSD(metrics.avgDaily)}
            color="green"
            delta={metrics.deltaAvgDay}
          />
          <MetricCard
            icon={TrendingDown}
            label="Projeção do Mês"
            value={fmtUSD(metrics.projection)}
            sub="baseado na média diária"
            color="purple"
          />
          <MetricCard
            icon={AlertCircle}
            label="Maior Serviço"
            value={metrics.topService ? fmtUSD(metrics.topService.amount) : '—'}
            sub={metrics.topService?.name || ''}
            color="orange"
          />
        </div>
      )}

      {/* Charts */}
      {hasAny && data?.combined?.length > 0 && (
        <CostCharts
          data={data}
          hasAws={hasAws} hasAzure={hasAzure} hasGcp={hasGcp}
          providerFilter={providerFilter}
        />
      )}

      {/* Heatmap */}
      {hasAny && data?.combined?.length > 0 && (
        <CostHeatmap combined={data.combined} providerFilter={providerFilter} />
      )}

      {/* Alerts Table + Events */}
      <CostTable
        alerts={alerts}
        events={events}
        costData={data}
        onAddAlert={() => setShowModal(true)}
        onDeleteAlert={(id) => deleteMutation.mutate(id)}
        onMarkEventRead={(id) => markReadMutation.mutate(id)}
      />
    </Layout>
  );
};

export default Costs;
