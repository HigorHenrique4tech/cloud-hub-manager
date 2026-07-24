import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MonitorPlay, HardDrive, Database, Zap, Network, AlertCircle, RefreshCw } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import ResourceMetricsPanel from '../../components/monitoring/ResourceMetricsPanel';
import gcpService from '../../services/gcpService';

// ── Stat Card com design premium ──────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'green' }) {
  const colors = {
    green:   { bg: 'bg-green-50 dark:bg-green-900/20',    icon: 'text-green-600',   border: 'border-green-100 dark:border-green-800/30' },
    yellow:  { bg: 'bg-yellow-50 dark:bg-yellow-900/20',  icon: 'text-yellow-600',  border: 'border-yellow-100 dark:border-yellow-800/30' },
    blue:    { bg: 'bg-blue-50 dark:bg-blue-900/20',      icon: 'text-blue-600',    border: 'border-blue-100 dark:border-blue-800/30' },
    purple:  { bg: 'bg-purple-50 dark:bg-purple-900/20',  icon: 'text-purple-600',  border: 'border-purple-100 dark:border-purple-800/30' },
    teal:    { bg: 'bg-teal-50 dark:bg-teal-900/20',      icon: 'text-teal-600',    border: 'border-teal-100 dark:border-teal-800/30' },
  };
  const c = colors[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4 flex items-center gap-4`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 dark:bg-gray-800/50 flex-shrink-0`}>
        <Icon size={20} className={c.icon} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value ?? '—'}</p>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{label}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const serviceCards = [
  {
    label: 'Compute Engine',
    icon: MonitorPlay,
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-900/20',
    to: '/gcp/compute',
    countKey: 'compute_instances',
    subKey: 'compute_running',
    subLabel: 'em execução',
  },
  {
    label: 'Cloud Storage',
    icon: HardDrive,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    to: '/gcp/storage',
    countKey: 'storage_buckets',
  },
  {
    label: 'Cloud SQL',
    icon: Database,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    to: '/gcp/sql',
    countKey: 'sql_instances',
  },
  {
    label: 'Cloud Functions',
    icon: Zap,
    color: 'text-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    to: '/gcp/functions',
    countKey: 'functions',
  },
  {
    label: 'VPC Networks',
    icon: Network,
    color: 'text-teal-600',
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    to: '/gcp/networks',
    countKey: 'networks',
  },
];

const GcpOverview = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['gcp-overview'],
    queryFn: () => gcpService.getOverview(),
    retry: false,
  });

  const metricsQ = useQuery({
    queryKey: ['gcp-metrics'],
    queryFn: () => gcpService.getMetrics(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !error,
  });

  if (isLoading) return <Layout><LoadingSpinner text="Carregando GCP..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="gcp" /></Layout>;
  }
  if (error?.response?.status === 403) {
    return (
      <Layout>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">API não habilitada</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
            {error.response?.data?.detail || 'A API necessária não está habilitada no projeto GCP. Ative-a no Google Cloud Console e aguarde alguns minutos.'}
          </p>
          <button onClick={() => refetch()} className="mt-2 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-primary border border-primary/30 hover:bg-primary/5 transition-colors">
            Tentar novamente
          </button>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.response?.data?.detail || error.message || 'Erro ao carregar dados GCP'}</span>
        </div>
      </Layout>
    );
  }

  const totalInstances = (data?.compute_instances || 0) + (data?.functions || 0) + (data?.sql_instances || 0);
  const runningInstances = data?.compute_running || 0;

  return (
    <Layout>
      {/* Header com resumo */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">GCP — Visão Geral</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {totalInstances} instâncias · {runningInstances} em execução
            {data?.project_id && <span className="font-mono ml-3">Projeto: {data.project_id}</span>}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors"
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {/* Stat Cards premium */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total de Instâncias"
          value={totalInstances}
          icon={MonitorPlay}
          color="green"
        />
        <StatCard
          label="Em Execução"
          value={runningInstances}
          sub="Compute Engine"
          icon={MonitorPlay}
          color="teal"
        />
        <StatCard
          label="Bancos de Dados"
          value={data?.sql_instances || 0}
          icon={Database}
          color="blue"
        />
        <StatCard
          label="Functions"
          value={data?.functions || 0}
          icon={Zap}
          color="purple"
        />
      </div>

      {/* Service Cards */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <Network size={16} className="text-green-600" />
          Serviços
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {serviceCards.map(({ label, icon: Icon, color, bg, to, countKey, subKey, subLabel }) => (
            <Link
              key={to}
              to={to}
              className="card hover:shadow-lg hover:bg-green-50/30 dark:hover:bg-gray-800 transition-all group"
            >
              <div className={`${bg} rounded-lg p-3 w-fit mb-3`}>
                <Icon className={`w-6 h-6 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-primary transition-colors">
                {data?.[countKey] ?? '—'}
              </p>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5">{label}</p>
              {subKey && data?.[subKey] !== undefined && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  {data[subKey]} {subLabel}
                </p>
              )}
            </Link>
          ))}
        </div>
      </section>

      <ResourceMetricsPanel
        resources={metricsQ.data?.resources}
        isLoading={metricsQ.isLoading}
        isError={metricsQ.isError}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['gcp-metrics'] })}
      />
    </Layout>
  );
};

export default GcpOverview;
