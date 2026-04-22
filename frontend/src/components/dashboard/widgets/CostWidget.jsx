import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import costService from '../../../services/costService';
import orgService from '../../../services/orgService';
import { useOrgWorkspace } from '../../../contexts/OrgWorkspaceContext';
import { fmtBRL, fmtUSD } from '../../../utils/formatters';

const today   = new Date();
const end30   = today.toISOString().slice(0, 10);
const start30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

const CostWidget = () => {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const wsReady = !!currentOrg && !!currentWorkspace;
  const slug = currentOrg?.slug;

  // Always fetch exchange rate so we can convert USD → BRL regardless of user's display setting
  const { data: rateData } = useQuery({
    queryKey: ['exchange-rate', slug],
    queryFn: () => orgService.getExchangeRate(slug),
    enabled: !!slug,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const rate = rateData?.exchange_rate_brl || rateData?.bcb_rate || null;

  const { data: rawData, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-costs', start30, end30],
    queryFn: () => costService.getCombinedCosts(start30, end30, 'DAILY'),
    enabled: wsReady,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Always normalize to BRL. Cloud values come in USD by default.
  const toBRL = (v, srcCurrency = 'USD') => {
    if (!v) return 0;
    const src = (srcCurrency || 'USD').toUpperCase();
    if (src === 'BRL') return v;
    if (src === 'USD' && rate) return v * rate;
    return v; // fallback: no rate yet, keep as-is
  };

  const fmt = (v) => rate ? fmtBRL(v) : fmtUSD(v);

  const data = rawData ? (() => {
    const cs = rawData.currencies || {};
    const awsT   = toBRL(rawData.aws?.total,   cs.aws);
    const azureT = toBRL(rawData.azure?.total,  cs.azure);
    const gcpT   = toBRL(rawData.gcp?.total,    cs.gcp);
    return {
      ...rawData,
      aws:   rawData.aws   ? { ...rawData.aws,   total: awsT }   : null,
      azure: rawData.azure ? { ...rawData.azure, total: azureT } : null,
      gcp:   rawData.gcp   ? { ...rawData.gcp,   total: gcpT }   : null,
      total: awsT + azureT + gcpT,
      combined: (rawData.combined || []).map(d => {
        const a  = toBRL(d.aws   || 0, cs.aws);
        const az = toBRL(d.azure || 0, cs.azure);
        const g  = toBRL(d.gcp  || 0, cs.gcp);
        return { ...d, aws: a, azure: az, gcp: g, total: a + az + g };
      }),
    };
  })() : null;

  const hasAws   = !!data?.aws;
  const hasAzure = !!data?.azure;
  const hasGcp   = !!data?.gcp;
  const hasData  = (data?.combined?.length || 0) > 0;

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Previsão de Custos
        </h2>
        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">30d</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col gap-3 animate-pulse">
          <div className="h-8 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="flex gap-2">
            <div className="h-7 w-28 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
        </div>
      ) : isError ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 gap-2">
          <AlertCircle className="w-8 h-8 text-red-400 opacity-60" />
          <p className="text-sm text-red-500 dark:text-red-400">Erro ao carregar custos</p>
          <button onClick={() => refetch()} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <RefreshCw className="w-3 h-3" /> Tentar novamente
          </button>
        </div>
      ) : !hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500 text-sm gap-2">
          <TrendingUp className="w-8 h-8 opacity-25" />
          <p>Configure credenciais AWS/Azure/GCP para ver custos</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-0.5">
            {fmt(data?.total)}
          </p>
          <p className="text-xs text-gray-400 mb-4">{start30} → {end30}</p>

          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.combined} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: '#1f2937',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 11,
                    padding: '6px 10px',
                    color: '#f9fafb',
                  }}
                  labelStyle={{ color: '#d1d5db', marginBottom: 2 }}
                  formatter={(v, name) => [fmt(v), name]}
                />
                {hasAws   && <Line type="monotone" dataKey="aws"   name="AWS"   stroke="#f97316" strokeWidth={2} dot={false} />}
                {hasAzure && <Line type="monotone" dataKey="azure" name="Azure" stroke="#0ea5e9" strokeWidth={2} dot={false} />}
                {hasGcp   && <Line type="monotone" dataKey="gcp"   name="GCP"   stroke="#22c55e" strokeWidth={2} dot={false} />}
                <Line type="monotone" dataKey="total" name="Total" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
              Total {fmt(data?.total)}
            </span>
            {hasAws && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                AWS {fmt(data?.aws?.total)}
              </span>
            )}
            {hasAzure && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 px-3 py-1 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
                Azure {fmt(data?.azure?.total)}
              </span>
            )}
            {hasGcp && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-3 py-1 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                GCP {fmt(data?.gcp?.total)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CostWidget;
