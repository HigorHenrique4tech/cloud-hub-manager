import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import webhookService from '../../services/webhookService';

function statusIcon(status) {
  if (status === 'success') return <CheckCircle2 size={14} className="text-green-500" />;
  if (status === 'failed')  return <XCircle      size={14} className="text-red-500"   />;
  return                           <Clock        size={14} className="text-yellow-500" />;
}

function httpBadge(code) {
  if (!code) return null;
  const color = code < 300 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-mono ${color}`}>{code}</span>;
}

const DeliveryHistory = ({ webhookId }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['webhook-deliveries', webhookId, page],
    queryFn: () => webhookService.deliveries(webhookId, page),
  });

  if (isLoading) return <p className="text-xs text-gray-500 dark:text-gray-500 py-2 text-center">Carregando…</p>;

  const items = data?.items || [];
  if (items.length === 0) return <p className="text-xs text-gray-500 dark:text-gray-500 py-2 text-center">Sem entregas ainda.</p>;

  return (
    <div className="space-y-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-1 pr-3 font-medium">Evento</th>
            <th className="text-left py-1 pr-3 font-medium">Status</th>
            <th className="text-left py-1 pr-3 font-medium">HTTP</th>
            <th className="text-left py-1 font-medium">Entregue em</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((d) => (
            <tr key={d.id}>
              <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{d.event_type}</td>
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-1">
                  {statusIcon(d.status)}
                  <span className={
                    d.status === 'success' ? 'text-green-600 dark:text-green-400'
                    : d.status === 'failed' ? 'text-red-600 dark:text-red-400'
                    : 'text-yellow-600 dark:text-yellow-400'
                  }>{d.status}</span>
                </div>
              </td>
              <td className="py-1.5 pr-3">{httpBadge(d.http_status)}</td>
              <td className="py-1.5 text-gray-500 dark:text-gray-500">
                {d.delivered_at ? new Date(d.delivered_at).toLocaleString('pt-BR') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {data?.pages > 1 && (
        <div className="flex items-center gap-2 pt-1 justify-end">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
            ← Anterior
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-500">{page}/{data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
};

export default DeliveryHistory;
