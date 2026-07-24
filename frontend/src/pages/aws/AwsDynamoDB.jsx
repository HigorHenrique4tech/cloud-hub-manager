import { useQuery } from '@tanstack/react-query';
import { Database, RefreshCw, Key } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import awsService from '../../services/awsservices';

function fmtBytes(b) {
  if (!b) return '0 B';
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

const AwsDynamoDB = () => {
  const q = useQuery({ queryKey: ['aws-dynamodb'], queryFn: () => awsService.listDynamoTables(), retry: false });

  if (q.error?.response?.status === 400) return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  const tables = q.data?.tables || [];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Database size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">DynamoDB</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {q.data?.region || ''} · {tables.length} tabela(s)
              </p>
            </div>
          </div>
          <button onClick={() => q.refetch()} disabled={q.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner text="Carregando tabelas..." /></div>
        ) : tables.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhuma tabela DynamoDB encontrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/80">
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  {['Tabela', 'Status', 'Itens', 'Tamanho', 'Partition Key', 'Sort Key', 'Billing', 'GSIs'].map(h =>
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {tables.map((t, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{t.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        t.status === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>{t.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{(t.item_count || 0).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2.5 text-gray-500">{fmtBytes(t.size_bytes)}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300"><Key size={10} className="text-amber-500" /> {t.partition_key || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{t.sort_key || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{t.billing_mode}</td>
                    <td className="px-4 py-2.5 text-gray-500">{t.gsi_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AwsDynamoDB;
