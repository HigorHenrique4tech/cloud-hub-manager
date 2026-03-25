import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { X, Server, HardDrive, Globe, TrendingUp, AlertTriangle } from 'lucide-react';
import costService from '../../services/costService';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Parse provider + raw service name from the combined "AWS / Amazon EC2" format */
function parseServiceKey(fullName) {
  const match = fullName.match(/^(AWS|Azure|GCP)\s*\/\s*(.+)$/i);
  if (!match) return { provider: null, service: fullName };
  return { provider: match[1].toLowerCase(), service: match[2].trim() };
}

const PROVIDER_COLORS = { aws: '#f97316', azure: '#0ea5e9', gcp: '#10b981' };

const MiniTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 shadow-lg text-xs">
      <p className="text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{fmtUSD(payload[0]?.value)}</p>
    </div>
  );
};

const ServiceDrilldownDrawer = ({ service, startDate, endDate, totalCost, onClose }) => {
  const { provider, service: serviceName } = parseServiceKey(service);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cost-resources', provider, serviceName, startDate, endDate],
    queryFn: () => costService.getServiceResources(provider, serviceName, startDate, endDate),
    enabled: !!provider && !!serviceName,
    retry: 1,
    staleTime: 300_000,
  });

  const resources = data?.resources || [];
  const daily = data?.daily || [];
  const lineColor = PROVIDER_COLORS[provider] || '#6366f1';
  const pctOfTotal = totalCost > 0 ? ((data?.total || 0) / totalCost * 100).toFixed(1) : '0';

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col animate-slide-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: lineColor }}>
              {provider?.toUpperCase()} — Drill-down
            </p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate mt-0.5">{serviceName}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{fmtUSD(data?.total)}</span>
              <span className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{pctOfTotal}% do total</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Daily trend chart */}
          {daily.length > 1 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-3">
                <TrendingUp className="w-4 h-4" /> Evolução Diária
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={50} />
                    <Tooltip content={<MiniTooltip />} />
                    <Line type="monotone" dataKey="total" stroke={lineColor} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Resources table */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-3">
              <Server className="w-4 h-4" /> Recursos ({resources.length})
            </h3>

            {isLoading && (
              <div className="space-y-2">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="h-16 skeleton rounded-lg" />
                ))}
              </div>
            )}

            {isError && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium">Erro ao carregar recursos</span>
                </div>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-6">
                  {error?.response?.data?.detail || 'A conta pode não ter permissão para consultar custos por recurso. Verifique se o Service Principal tem a role "Cost Management Reader" na subscription.'}
                </p>
              </div>
            )}

            {!isLoading && !isError && resources.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Detalhamento por recurso não disponível para este serviço.</p>
                {daily.length > 0 && (
                  <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">O gráfico de evolução diária está disponível acima.</p>
                )}
              </div>
            )}

            {!isLoading && resources.length > 0 && (
              <div className="space-y-2">
                {resources.map((res, idx) => {
                  const pct = data?.total > 0 ? (res.amount / data.total * 100) : 0;
                  return (
                    <div
                      key={res.id || idx}
                      className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={res.id}>
                            {res.name || res.id}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {res.type && (
                              <span className="text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                {res.type}
                              </span>
                            )}
                            {res.region && (
                              <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-0.5">
                                <Globe className="w-3 h-3" /> {res.region}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
                            {fmtUSD(res.amount)}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">{pct.toFixed(1)}%</p>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: lineColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Estimated badge for GCP */}
          {data?.estimated && (
            <p className="text-xs text-center text-green-500 dark:text-green-400 py-2">
              * Valores estimados a partir dos recursos ativos
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Período: {startDate} → {endDate}
          </p>
        </div>
      </div>
    </>
  );
};

export default ServiceDrilldownDrawer;
