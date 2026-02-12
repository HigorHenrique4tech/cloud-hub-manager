import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { HardDrive, ShieldAlert, ShieldCheck, AlertCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import awsService from '../../services/awsservices';

const AwsS3 = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();

  const { data, isLoading, error } = useQuery({
    queryKey: ['aws-s3'],
    queryFn: () => awsService.listS3Buckets(),
    retry: false,
  });

  if (isLoading) return <Layout><LoadingSpinner text="Carregando buckets S3..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar S3'}</span>
        </div>
      </Layout>
    );
  }

  const buckets = (data?.buckets || []).filter(b =>
    !q || b.name?.toLowerCase().includes(q) || b.region?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">S3 — Buckets</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {buckets.length} bucket(s){q && ` · filtrado por "${q}"`}
        </p>
      </div>

      <div className="card overflow-x-auto">
        {buckets.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhum bucket encontrado</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['Nome', 'Região', 'Criado em', 'Acesso Público'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {buckets.map(b => (
                <tr key={b.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{b.region || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {b.creation_date ? new Date(b.creation_date).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {b.public_access === null ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : b.public_access ? (
                      <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                        <ShieldAlert className="w-3.5 h-3.5" /> Público
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <ShieldCheck className="w-3.5 h-3.5" /> Bloqueado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
};

export default AwsS3;
