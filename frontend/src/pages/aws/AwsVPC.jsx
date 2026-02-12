import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import awsService from '../../services/awsservices';

const AwsVPC = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();

  const { data, isLoading, error } = useQuery({
    queryKey: ['aws-vpc'],
    queryFn: () => awsService.listVPCs(),
    retry: false,
  });

  if (isLoading) return <Layout><LoadingSpinner text="Carregando VPCs..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar VPCs'}</span>
        </div>
      </Layout>
    );
  }

  const vpcs = (data?.vpcs || []).filter(v =>
    !q || v.vpc_id?.toLowerCase().includes(q) || v.name?.toLowerCase().includes(q) || v.cidr?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">VPC — Redes Virtuais</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Região: {data?.region || 'N/A'} · {vpcs.length} VPC(s){q && ` · filtrado por "${q}"`}
        </p>
      </div>

      <div className="card overflow-x-auto">
        {vpcs.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhuma VPC encontrada</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['VPC ID', 'Nome', 'CIDR', 'Estado', 'Padrão', 'Subnets'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {vpcs.map(v => (
                <tr key={v.vpc_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{v.vpc_id}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.name || '—'}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.cidr || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={v.state === 'available' ? 'badge-success' : 'badge-warning'}>{v.state || '—'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {v.is_default ? <span className="badge-gray">Padrão</span> : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.subnets_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
};

export default AwsVPC;
