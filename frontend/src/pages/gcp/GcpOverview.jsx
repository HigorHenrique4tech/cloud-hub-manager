import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MonitorPlay, HardDrive, Database, Zap, Network, AlertCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import gcpService from '../../services/gcpService';

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
  const { data, isLoading, error } = useQuery({
    queryKey: ['gcp-overview'],
    queryFn: () => gcpService.getOverview(),
    retry: false,
  });

  if (isLoading) return <Layout><LoadingSpinner text="Carregando GCP..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="gcp" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar dados GCP'}</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">GCP — Visão Geral</h1>
        {data?.project_id && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">
            Projeto: {data.project_id}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {serviceCards.map(({ label, icon: Icon, color, bg, to, countKey, subKey, subLabel }) => (
          <Link
            key={to}
            to={to}
            className="card hover:shadow-lg transition-shadow group"
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
    </Layout>
  );
};

export default GcpOverview;
