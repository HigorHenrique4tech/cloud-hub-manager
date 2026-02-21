import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import costService from '../../../services/costService';
import { useOrgWorkspace } from '../../../contexts/OrgWorkspaceContext';

const today  = new Date();
const end30  = today.toISOString().slice(0, 10);
const start30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CostWidget = () => {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const wsReady = !!currentOrg && !!currentWorkspace;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-costs', start30, end30],
    queryFn: () => costService.getCombinedCosts(start30, end30, 'DAILY'),
    enabled: wsReady,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const hasAws   = !!data?.aws;
  const hasAzure = !!data?.azure;
  const hasData  = (data?.combined?.length || 0) > 0;

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Cost Forecast
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
      ) : !hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500 text-sm gap-2">
          <TrendingUp className="w-8 h-8 opacity-25" />
          <p>Configure credenciais AWS/Azure para ver custos</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-0.5">
            {fmtUSD(data?.total)}
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
                  formatter={(v, name) => [fmtUSD(v), name]}
                />
                {hasAws   && <Line type="monotone" dataKey="aws"   name="AWS"   stroke="#f97316" strokeWidth={2} dot={false} />}
                {hasAzure && <Line type="monotone" dataKey="azure" name="Azure" stroke="#0ea5e9" strokeWidth={2} dot={false} />}
                <Line type="monotone" dataKey="total" name="Total" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
              Total {fmtUSD(data?.total)}
            </span>
            {hasAws && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                AWS {fmtUSD(data?.aws?.total)}
              </span>
            )}
            {hasAzure && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 px-3 py-1 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
                Azure {fmtUSD(data?.azure?.total)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CostWidget;
