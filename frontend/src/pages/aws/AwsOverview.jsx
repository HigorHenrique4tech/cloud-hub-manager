import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MonitorPlay, HardDrive, Database, Zap, Network, AlertCircle, RefreshCw } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import ResourceMetricsPanel from '../../components/monitoring/ResourceMetricsPanel';
import awsService from '../../services/awsservices';

// ── Stat Card com design premium ──────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'orange' }) {
  const colors = {
    orange:  { bg: 'bg-orange-50 dark:bg-orange-900/20',  icon: 'text-orange-500',  border: 'border-orange-100 dark:border-orange-800/30' },
    yellow:  { bg: 'bg-yellow-50 dark:bg-yellow-900/20',  icon: 'text-yellow-500',  border: 'border-yellow-100 dark:border-yellow-800/30' },
    blue:    { bg: 'bg-blue-50 dark:bg-blue-900/20',      icon: 'text-blue-500',    border: 'border-blue-100 dark:border-blue-800/30' },
    purple:  { bg: 'bg-purple-50 dark:bg-purple-900/20',  icon: 'text-purple-500',  border: 'border-purple-100 dark:border-purple-800/30' },
    green:   { bg: 'bg-green-50 dark:bg-green-900/20',    icon: 'text-green-500',   border: 'border-green-100 dark:border-green-800/30' },
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
  { key: 'ec2', label: 'EC2', icon: MonitorPlay, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', to: '/aws/ec2' },
  { key: 's3', label: 'S3', icon: HardDrive, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20', to: '/aws/s3' },
  { key: 'rds', label: 'RDS', icon: Database, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', to: '/aws/rds' },
  { key: 'lambda', label: 'Lambda', icon: Zap, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', to: '/aws/lambda' },
  { key: 'vpc', label: 'VPC', icon: Network, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', to: '/aws/vpc' },
];

const AwsOverview = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['aws-overview'],
    queryFn: () => awsService.getOverview(),
    retry: false,
  });

  const metricsQ = useQuery({
    queryKey: ['aws-metrics'],
    queryFn: () => awsService.getMetrics(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !error,
  });

  if (isLoading) return <Layout><LoadingSpinner text="Carregando visão geral AWS..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar dados AWS'}</span>
        </div>
      </Layout>
    );
  }

  const resources = data?.resources || {};
  const totalInstances = (resources.ec2?.total || 0) + (resources.rds?.total || 0) + (resources.lambda?.total || 0);
  const runningInstances = resources.ec2?.running || 0;

  return (
    <Layout>
      {/* Header com resumo */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AWS — Visão Geral</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {totalInstances} instâncias · {runningInstances} em execução · Região: {data?.region || 'N/A'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-orange-500 hover:bg-orange-600 transition-colors"
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
          color="orange"
        />
        <StatCard
          label="Em Execução"
          value={runningInstances}
          sub="EC2 ativas"
          icon={MonitorPlay}
          color="green"
        />
        <StatCard
          label="Bancos de Dados"
          value={resources.rds?.total || 0}
          icon={Database}
          color="blue"
        />
        <StatCard
          label="Functions"
          value={resources.lambda?.total || 0}
          icon={Zap}
          color="purple"
        />
      </div>

      {/* Service Cards */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <Network size={16} className="text-orange-500" />
          Serviços
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {serviceCards.map(({ key, label, icon: Icon, color, bg, to }) => {
            const svc = resources[key] || {};
            return (
              <Link
                key={key}
                to={to}
                className="card hover:shadow-lg hover:bg-orange-50/30 dark:hover:bg-gray-800 transition-all group"
              >
                <div className={`${bg} rounded-lg p-3 w-fit mb-3`}>
                  <Icon className={`w-6 h-6 ${color}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-primary transition-colors">
                  {svc.total ?? '—'}
                </p>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5">{label}</p>
                {key === 'ec2' && svc.running !== undefined && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">{svc.running} em execução</p>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <ResourceMetricsPanel
        resources={metricsQ.data?.resources}
        isLoading={metricsQ.isLoading}
        isError={metricsQ.isError}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['aws-metrics'] })}
      />
    </Layout>
  );
};

export default AwsOverview;
