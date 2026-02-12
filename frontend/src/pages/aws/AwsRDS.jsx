import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import awsService from '../../services/awsservices';

const statusClass = (s) => {
  if (s === 'available') return 'badge-success';
  if (s === 'stopped') return 'badge-danger';
  return 'badge-warning';
};

const AwsRDS = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();

  const { data, isLoading, error } = useQuery({
    queryKey: ['aws-rds'],
    queryFn: () => awsService.listRDSInstances(),
    retry: false,
  });

  if (isLoading) return <Layout><LoadingSpinner text="Carregando instâncias RDS..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar RDS'}</span>
        </div>
      </Layout>
    );
  }

  const instances = (data?.instances || []).filter(i =>
    !q || i.db_instance_id?.toLowerCase().includes(q) || i.engine?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">RDS — Banco de Dados</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Região: {data?.region || 'N/A'} · {instances.length} instância(s){q && ` · filtrado por "${q}"`}
        </p>
      </div>

      <div className="card overflow-x-auto">
        {instances.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhuma instância RDS encontrada</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['ID', 'Engine', 'Versão', 'Classe', 'Status', 'Endpoint', 'AZ', 'Multi-AZ', 'Storage (GB)'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {instances.map(i => (
                <tr key={i.db_instance_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{i.db_instance_id}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{i.engine}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.engine_version || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.db_instance_class}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className={statusClass(i.status)}>{i.status}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono text-xs">{i.endpoint || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.availability_zone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.multi_az ? 'Sim' : 'Não'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.storage_gb ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
};

export default AwsRDS;
