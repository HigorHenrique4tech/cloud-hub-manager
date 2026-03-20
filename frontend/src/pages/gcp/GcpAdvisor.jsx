import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield, Zap, Heart, Settings2, RefreshCw, AlertTriangle,
  ChevronDown, ChevronUp, DollarSign, Filter,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import LoadingSpinner from '../../components/common/loadingspinner';
import EmptyState from '../../components/common/emptystate';
import gcpService from '../../services/gcpService';

const CATEGORIES = [
  { key: null, label: 'Todas', icon: Filter },
  { key: 'security', label: 'Segurança', icon: Shield, color: 'red' },
  { key: 'performance', label: 'Desempenho', icon: Zap, color: 'purple' },
  { key: 'operational_excellence', label: 'Excelência Operacional', icon: Settings2, color: 'blue' },
];

const IMPACT_BADGE = {
  high: 'bg-red-100 text-red-700 dark:bg-red-800/30 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-800/30 dark:text-amber-300',
  low: 'bg-blue-100 text-blue-600 dark:bg-blue-800/30 dark:text-blue-300',
};

const CATEGORY_ICON = {
  security: { icon: Shield, color: 'text-red-500' },
  performance: { icon: Zap, color: 'text-purple-500' },
  operational_excellence: { icon: Settings2, color: 'text-blue-500' },
  cost: { icon: DollarSign, color: 'text-green-500' },
};

const CATEGORY_LABELS = {
  security: 'Segurança',
  performance: 'Desempenho',
  operational_excellence: 'Excelência Operacional',
  cost: 'Custo',
};

const RecommendationCard = ({ rec }) => {
  const [expanded, setExpanded] = useState(false);
  const catInfo = CATEGORY_ICON[rec.category] || CATEGORY_ICON.security;
  const CatIcon = catInfo.icon;

  return (
    <div className="card group">
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`mt-0.5 ${catInfo.color}`}>
          <CatIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${IMPACT_BADGE[rec.impact] || IMPACT_BADGE.low}`}>
              {rec.impact === 'high' ? 'Alta' : rec.impact === 'medium' ? 'Média' : 'Baixa'}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">
              {CATEGORY_LABELS[rec.category] || rec.category}
            </span>
            {rec.estimated_saving_monthly > 0 && (
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                ~${rec.estimated_saving_monthly.toFixed(2)}/mês
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
            {rec.problem || rec.resource_name || rec.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {rec.resource_name}
            {rec.resource_type && ` · ${rec.resource_type}`}
            {rec.region && ` · ${rec.region}`}
          </p>
        </div>
        <div className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 space-y-3">
          {rec.solution && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Solução Recomendada</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{rec.solution}</p>
            </div>
          )}

          {rec.resource_id && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Recurso</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">{rec.resource_id}</p>
            </div>
          )}

          {rec.extended_properties && Object.keys(rec.extended_properties).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Detalhes</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {Object.entries(rec.extended_properties).slice(0, 10).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400 truncate">{k}:</span>
                    <span className="text-gray-700 dark:text-gray-300 font-medium truncate ml-2">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ icon: Icon, label, count, color }) => (
  <div className="card flex items-center gap-3">
    <div className={`p-2.5 rounded-lg ${color}`}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{count}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  </div>
);

const GcpAdvisor = () => {
  const [selectedCategory, setSelectedCategory] = useState(null);

  const summaryQ = useQuery({
    queryKey: ['gcp-advisor-summary'],
    queryFn: () => gcpService.getAdvisorSummary(),
    retry: false,
    staleTime: 300_000,
  });

  const recsQ = useQuery({
    queryKey: ['gcp-advisor-recs', selectedCategory],
    queryFn: () => gcpService.getAdvisorRecommendations(selectedCategory),
    retry: false,
    staleTime: 300_000,
  });

  if (summaryQ.error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="gcp" /></Layout>;
  }

  const summary = summaryQ.data;
  const recs = recsQ.data?.recommendations || [];

  // Filter out cost recs (they go to FinOps)
  const filteredRecs = recs.filter(r => r.category !== 'cost');

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">GCP Recommender</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Recomendações do Google Cloud — segurança, desempenho e excelência operacional
          </p>
        </div>
        <button
          onClick={() => { summaryQ.refetch(); recsQ.refetch(); }}
          disabled={summaryQ.isFetching || recsQ.isFetching}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${(summaryQ.isFetching || recsQ.isFetching) ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Summary Cards */}
      {summaryQ.isLoading ? (
        <div className="flex justify-center py-8"><LoadingSpinner /></div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <SummaryCard icon={Shield} label="Segurança" count={summary.by_category?.security || 0} color="bg-red-500" />
          <SummaryCard icon={Zap} label="Desempenho" count={summary.by_category?.performance || 0} color="bg-purple-500" />
          <SummaryCard icon={Settings2} label="Excelência Operacional" count={summary.by_category?.operational_excellence || 0} color="bg-blue-500" />
        </div>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => setSelectedCategory(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              selectedCategory === key
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Impact summary bar */}
      {summary && (
        <div className="flex items-center gap-4 mb-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" /> {summary.by_impact?.high || 0} alta
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> {summary.by_impact?.medium || 0} média
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> {summary.by_impact?.low || 0} baixa
          </span>
          {summary.estimated_total_savings_monthly > 0 && (
            <span className="ml-auto text-green-600 dark:text-green-400 font-medium">
              Economia potencial: ${summary.estimated_total_savings_monthly.toFixed(2)}/mês
            </span>
          )}
        </div>
      )}

      {/* Recommendations list */}
      {recsQ.isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : recsQ.isError ? (
        <div className="card">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Erro ao carregar recomendações. Verifique se a Service Account tem permissão de recommender.viewer.</span>
          </div>
        </div>
      ) : filteredRecs.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Nenhuma recomendação encontrada"
          description={selectedCategory
            ? 'Nenhuma recomendação nesta categoria.'
            : 'Nenhuma recomendação disponível. O GCP Recommender analisa seus recursos e gera recomendações automaticamente.'}
        />
      ) : (
        <div className="space-y-3">
          {filteredRecs.map((rec, i) => (
            <RecommendationCard key={rec.advisor_id || i} rec={rec} />
          ))}
        </div>
      )}
    </Layout>
  );
};

export default GcpAdvisor;
