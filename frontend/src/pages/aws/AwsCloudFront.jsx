import { useQuery } from '@tanstack/react-query';
import { Globe, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import awsService from '../../services/awsservices';

const AwsCloudFront = () => {
  const q = useQuery({ queryKey: ['aws-cloudfront'], queryFn: () => awsService.listCloudFront(), retry: false });

  if (q.error?.response?.status === 400) return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  const dists = q.data?.distributions || [];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Globe size={20} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">CloudFront</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{dists.length} distribuição(ões)</p>
            </div>
          </div>
          <button onClick={() => q.refetch()} disabled={q.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner text="Carregando distribuições..." /></div>
        ) : dists.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhuma distribuição CloudFront encontrada.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {dists.map((d) => (
              <div key={d.id} className="card rounded-xl p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <p className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">{d.domain_name}</p>
                  {d.enabled
                    ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 size={9} /> Habilitada</span>
                    : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"><XCircle size={9} /> Desabilitada</span>}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${d.status === 'Deployed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>{d.status}</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p><span className="text-gray-400">ID:</span> <span className="font-mono">{d.id}</span> · {d.price_class?.replace('PriceClass_', '') || ''}</p>
                  {d.aliases?.length > 0 && <p><span className="text-gray-400">Aliases:</span> {d.aliases.join(', ')}</p>}
                  <p><span className="text-gray-400">Origens:</span> {(d.origins || []).join(', ') || '—'}</p>
                  {d.comment && <p className="text-gray-400 italic truncate">{d.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AwsCloudFront;
