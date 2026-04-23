import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Zap, ChevronRight, TrendingDown, AlertTriangle, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import finopsService from '../../../services/finopsService';
import { useOrgWorkspace } from '../../../contexts/OrgWorkspaceContext';
import { useCurrency } from '../../../hooks/useCurrency';

const PLAN_ORDER = { free: 0, basic: 1, standard: 2, enterprise_e1: 3, enterprise_e2: 4, enterprise_e3: 5, enterprise_migration: 6 };

const FinOpsWidget = () => {
  const navigate = useNavigate();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const { fmtCost } = useCurrency();
  const plan = (currentOrg?.effective_plan || currentOrg?.plan_tier || 'free').toLowerCase();
  const isPro = (PLAN_ORDER[plan] ?? 0) >= 1;
  const wsReady = !!currentOrg && !!currentWorkspace;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finops-summary', currentWorkspace?.id],
    queryFn: finopsService.getSummary,
    enabled: wsReady && isPro,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  if (!isPro) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-yellow-400" />
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Resumo FinOps</h2>
        </div>
        <div className="rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-5 text-center">
          <p className="text-sm text-primary-dark dark:text-primary-light font-medium mb-1">Recurso Pro</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Faça upgrade para ver análise de custos e recomendações FinOps.</p>
          <button
            onClick={() => navigate('/billing')}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            Ver planos <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          Resumo FinOps
        </h2>
        <button
          onClick={() => navigate('/finops')}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          FinOps <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[72px] bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <AlertCircle className="w-7 h-7 text-red-400 opacity-60" />
          <p className="text-sm text-red-500 dark:text-red-400">Erro ao carregar dados FinOps</p>
          <button onClick={() => refetch()} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <RefreshCw className="w-3 h-3" /> Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-green-500" />
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">Economia potencial</p>
              </div>
              <p className="text-lg font-bold text-green-700 dark:text-green-300">
                {fmtCost(data?.potential_saving_monthly)}<span className="text-xs font-normal text-green-600 dark:text-green-500">/mês</span>
              </p>
            </div>

            <button
              onClick={() => navigate('/finops')}
              className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 p-3 text-left hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-blue-500" />
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Recomendações</p>
              </div>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                {data?.recommendations?.pending ?? 0}
                <span className="text-xs font-normal text-blue-600 dark:text-blue-500 ml-1">pendentes</span>
              </p>
            </button>

            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">Anomalias</p>
              </div>
              <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                {data?.open_anomalies ?? 0}
                <span className="text-xs font-normal text-yellow-600 dark:text-yellow-500 ml-1">abertas</span>
              </p>
            </div>

            <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />
                <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Economia realizada</p>
              </div>
              <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                {fmtCost(data?.realized_saving_30d)}
                <span className="text-xs font-normal text-purple-600 dark:text-purple-500 ml-1">30d</span>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FinOpsWidget;
