import { useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Calendar, X, Tag } from 'lucide-react';
import Layout from '../components/layout/layout';
import { SkeletonCard, SkeletonChart } from '../components/common/SkeletonLoader';
import CostReportModal from '../components/finops/CostReportModal';
import MetricCard from '../components/costs/MetricCard';
import AlertModal from '../components/costs/AlertModal';
import AlertEventsPanel from '../components/costs/AlertEventsPanel';
import CostAllocationTab from '../components/costs/CostAllocationTab';
import CostCharts from '../components/costs/CostCharts';
import CostTable from '../components/costs/CostTable';
import CostExport from '../components/costs/CostExport';
import CostHeatmap from '../components/costs/CostHeatmap';
import ServiceDrilldownDrawer from '../components/costs/ServiceDrilldownDrawer';
import { useCosts } from '../hooks/useCosts';
import { useCurrency } from '../hooks/useCurrency';

const today = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);

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

const Costs = () => {
  const { fmtCost, currency } = useCurrency();
  const [periodIdx, setPeriodIdx]           = useState(0);
  const [isCustom, setIsCustom]             = useState(false);
  const [customStart, setCustomStart]       = useState('');
  const [customEnd, setCustomEnd]           = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [showModal, setShowModal]           = useState(false);
  const [showReport, setShowReport]         = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [drilldownService, setDrilldownService] = useState(null);
  const [showAllocation, setShowAllocation] = useState(false);

  // ── Date range ─────────────────────────────────────────────────────────────
  const { days } = PERIODS[periodIdx];
  const endDate   = isCustom && customEnd   ? customEnd   : fmt(today);
  const startDate = isCustom && customStart ? customStart : fmt(new Date(today.getTime() - days * 86400000));

  // ── Hook ───────────────────────────────────────────────────────────────────
  const {
    data, prevData, metrics, anomalies, isLoading,
    hasAws, hasAzure, hasGcp, hasAny,
    alerts, events,
    createAlert, deleteAlert, markEventRead, evaluateAlerts,
  } = useCosts({ startDate, endDate, providerFilter });

  const activePeriodLabel = isCustom
    ? `${customStart} → ${customEnd}`
    : PERIODS[periodIdx].label;

  return (
    <Layout>
      {showModal && (
        <AlertModal
          onClose={() => setShowModal(false)}
          onSave={(d) => { createAlert.mutate(d); setShowModal(false); }}
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
            {!isLoading && !hasAws   && <span className="ml-2 text-yellow-600 dark:text-yellow-400">(sem dados AWS)</span>}
            {!isLoading && !hasAzure && <span className="ml-2 text-yellow-600 dark:text-yellow-400">(sem dados Azure)</span>}
            {!isLoading && hasGcp && data?.gcp?.estimated && <span className="ml-2 text-green-600 dark:text-green-400">(GCP estimado)</span>}
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

      {/* Provider filter chips + comparison toggle */}
      {(hasAny || isLoading) && (
        <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 dark:text-gray-400">Filtrar:</span>
            {PROVIDER_FILTERS.map(({ key, label, color }) => {
              const disabled = !isLoading && key !== 'all' && (
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

          <div className="flex items-center gap-2">
            {/* Comparison toggle */}
            <button
              onClick={() => setShowComparison((v) => !v)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-all no-print ${
                showComparison
                  ? 'border-violet-400 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {showComparison ? 'Comparação ON' : 'Comparar período anterior'}
            </button>
            {/* Allocation by tag toggle */}
            <button
              onClick={() => setShowAllocation((v) => !v)}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full border transition-all no-print ${
                showAllocation
                  ? 'border-emerald-400 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Tag size={11} />
              Alocação por Tag
            </button>
          </div>
        </div>
      )}

      {/* No credentials warning */}
      {!isLoading && !hasAny && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">Nenhum dado de custo disponível. Configure credenciais AWS e/ou Azure em <strong>Configurações</strong> e verifique as permissões para Cost Explorer / Cost Management.</span>
        </div>
      )}

      {/* Metric Cards — skeleton while loading */}
      {isLoading ? (
        <div className="mb-6">
          <SkeletonCard count={4} />
        </div>
      ) : metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={DollarSign}
            label={`Total (${activePeriodLabel})`}
            value={fmtCost(metrics.total, currency)}
            color="blue"
            delta={metrics.deltaTotal}
            sparkline={metrics.sparkline}
            delay={0}
          />
          <MetricCard
            icon={TrendingUp}
            label="Média Diária"
            value={fmtCost(metrics.avgDaily, currency)}
            color="green"
            delta={metrics.deltaAvgDay}
            delay={1}
          />
          <MetricCard
            icon={TrendingDown}
            label="Projeção do Mês"
            value={fmtCost(metrics.projection, currency)}
            sub="baseado na média diária"
            color="purple"
            delay={2}
          />
          <MetricCard
            icon={AlertCircle}
            label="Maior Serviço"
            value={metrics.topService ? fmtCost(metrics.topService.amount, currency) : '—'}
            sub={metrics.topService?.name || ''}
            color="orange"
            delay={3}
          />
        </div>
      )}

      {/* Charts — skeleton while loading */}
      {isLoading ? (
        <div className="mb-6 space-y-6">
          <SkeletonChart type="line" height={280} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><SkeletonChart type="bar" height={260} /></div>
            <SkeletonChart type="bar" height={220} />
          </div>
        </div>
      ) : hasAny && data?.combined?.length > 0 ? (
        <CostCharts
          data={data}
          prevData={showComparison ? prevData : null}
          hasAws={hasAws} hasAzure={hasAzure} hasGcp={hasGcp}
          providerFilter={providerFilter}
          anomalies={anomalies}
          onServiceClick={setDrilldownService}
        />
      ) : !isLoading && hasAny && (
        <div className="card mb-6 flex flex-col items-center justify-center py-16 text-center animate-fade-in">
          <DollarSign className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sem dados de custo para o período selecionado</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Tente ampliar o intervalo de datas</p>
        </div>
      )}

      {/* Heatmap */}
      {!isLoading && hasAny && data?.combined?.length > 0 && (
        <CostHeatmap combined={data.combined} providerFilter={providerFilter} anomalies={anomalies} />
      )}

      {/* Cost Allocation by Tag */}
      {showAllocation && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Tag size={18} className="text-emerald-500" />
            Alocação por Tag
          </h2>
          <CostAllocationTab startDate={startDate} endDate={endDate} />
        </div>
      )}

      {/* Alerts Table + Events */}
      {!isLoading && (
        <CostTable
          alerts={alerts}
          events={events}
          costData={data}
          onAddAlert={() => setShowModal(true)}
          onDeleteAlert={(id) => deleteAlert.mutate(id)}
          onMarkEventRead={(id) => markEventRead.mutate(id)}
        />
      )}

      {events.length > 0 && (
        <div className="mt-4">
          <AlertEventsPanel
            events={events}
            onMarkRead={(id) => markEventRead.mutate(id)}
            onEvaluate={() => evaluateAlerts.mutate()}
            isEvaluating={evaluateAlerts.isPending}
          />
        </div>
      )}

      {/* Service Drill-down Drawer */}
      {drilldownService && (
        <ServiceDrilldownDrawer
          service={drilldownService}
          startDate={startDate}
          endDate={endDate}
          totalCost={data?.total || 0}
          onClose={() => setDrilldownService(null)}
        />
      )}
    </Layout>
  );
};

export default Costs;
