import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MonitorPlay, HardDrive, Database, Zap, Network, AlertCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import ResourceMetricsPanel from '../../components/monitoring/ResourceMetricsPanel';
import awsService from '../../services/awsservices';

const serviceCards = [
  { key: 'ec2', label: 'EC2', icon: MonitorPlay, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', to: '/aws/ec2' },
  { key: 's3', label: 'S3', icon: HardDrive, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20', to: '/aws/s3' },
  { key: 'rds', label: 'RDS', icon: Database, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', to: '/aws/rds' },
  { key: 'lambda', label: 'Lambda', icon: Zap, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', to: '/aws/lambda' },
  { key: 'vpc', label: 'VPC', icon: Network, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', to: '/aws/vpc' },
];

const AwsOverview = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
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

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AWS — Visão Geral</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Região: {data?.region || 'N/A'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {serviceCards.map(({ key, label, icon: Icon, color, bg, to }) => {
          const svc = resources[key] || {};
          return (
            <Link
              key={key}
              to={to}
              className="card hover:shadow-lg transition-shadow group"
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
