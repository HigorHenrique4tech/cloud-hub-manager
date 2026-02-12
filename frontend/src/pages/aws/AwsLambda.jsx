import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import awsService from '../../services/awsservices';

const AwsLambda = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();

  const { data, isLoading, error } = useQuery({
    queryKey: ['aws-lambda'],
    queryFn: () => awsService.listLambdaFunctions(),
    retry: false,
  });

  if (isLoading) return <Layout><LoadingSpinner text="Carregando funções Lambda..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar Lambda'}</span>
        </div>
      </Layout>
    );
  }

  const fns = (data?.functions || []).filter(f =>
    !q || f.name?.toLowerCase().includes(q) || f.runtime?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Lambda — Funções</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Região: {data?.region || 'N/A'} · {fns.length} função(ões){q && ` · filtrado por "${q}"`}
        </p>
      </div>

      <div className="card overflow-x-auto">
        {fns.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhuma função Lambda encontrada</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['Nome', 'Runtime', 'Handler', 'Memória (MB)', 'Timeout (s)', 'Código (KB)', 'Última modificação'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {fns.map(f => (
                <tr key={f.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{f.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="badge-gray text-xs">{f.runtime || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono text-xs whitespace-nowrap">{f.handler || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{f.memory_mb ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{f.timeout_sec ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {f.code_size_bytes ? Math.round(f.code_size_bytes / 1024) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {f.last_modified ? new Date(f.last_modified).toLocaleDateString('pt-BR') : '—'}
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

export default AwsLambda;
