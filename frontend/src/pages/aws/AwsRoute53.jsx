import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network, RefreshCw, ChevronDown, ChevronRight, Lock, Globe } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import awsService from '../../services/awsservices';

const RECORD_COLOR = {
  A: 'text-blue-600 dark:text-blue-400', AAAA: 'text-indigo-600 dark:text-indigo-400',
  CNAME: 'text-purple-600 dark:text-purple-400', MX: 'text-amber-600 dark:text-amber-400',
  TXT: 'text-gray-500', NS: 'text-teal-600 dark:text-teal-400',
};

const ZoneRow = ({ zone }) => {
  const [open, setOpen] = useState(false);
  const recordsQ = useQuery({
    queryKey: ['aws-route53-records', zone.id],
    queryFn: () => awsService.listRoute53Records(zone.id),
    enabled: open, retry: false,
  });
  const records = recordsQ.data?.records || [];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        {zone.private ? <Lock size={14} className="text-amber-500" /> : <Globe size={14} className="text-teal-500" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{zone.name}</p>
          {zone.comment && <p className="text-[11px] text-gray-400 truncate">{zone.comment}</p>}
        </div>
        <span className="text-xs text-gray-500">{zone.record_count} registros</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 px-4 py-2">
          {recordsQ.isLoading ? (
            <div className="py-4 flex justify-center"><LoadingSpinner /></div>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-gray-400">
                <th className="py-1.5 font-medium">Nome</th><th className="py-1.5 font-medium">Tipo</th>
                <th className="py-1.5 font-medium">TTL</th><th className="py-1.5 font-medium">Valor</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {records.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1.5 font-mono text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{r.name}</td>
                    <td className={`py-1.5 font-semibold ${RECORD_COLOR[r.type] || 'text-gray-500'}`}>{r.type}</td>
                    <td className="py-1.5 text-gray-400">{r.ttl || '—'}</td>
                    <td className="py-1.5 font-mono text-gray-500 max-w-[280px] truncate">{(r.values || []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

const AwsRoute53 = () => {
  const q = useQuery({ queryKey: ['aws-route53'], queryFn: () => awsService.listRoute53Zones(), retry: false });
  if (q.error?.response?.status === 400) return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  const zones = q.data?.zones || [];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Network size={20} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Route 53</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{zones.length} hosted zone(s)</p>
            </div>
          </div>
          <button onClick={() => q.refetch()} disabled={q.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner text="Carregando zonas..." /></div>
        ) : zones.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhuma hosted zone encontrada.</p>
        ) : (
          <div className="space-y-2">
            {zones.map((z) => <ZoneRow key={z.id} zone={z} />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AwsRoute53;
