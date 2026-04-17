import { useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { RefreshCw, TrendingDown, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useReservations } from '../../hooks/useReservations';
import { useCurrency } from '../../hooks/useCurrency';

const TABS = ['Cobertura', 'Utilização', 'Recomendações'];
const STATUS_COLORS = { good: 'text-green-600', warning: 'text-yellow-500', underutilized: 'text-red-500' };
const STATUS_ICONS = {
  good: <CheckCircle size={16} className="text-green-500" />,
  warning: <AlertTriangle size={16} className="text-yellow-500" />,
  underutilized: <XCircle size={16} className="text-red-500" />,
};

const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

const CoveragePie = ({ item, fmtCost }) => {
  const pieData = [
    { name: 'Coberto', value: Number(item.coverage_pct || 0) },
    { name: 'On-Demand', value: Number(item.on_demand_pct || 100) },
  ];
  const label = item.coverage_type === 'savings_plan' ? 'Savings Plan' : 'Reserved';
  return (
    <div className="card p-4 flex flex-col items-center gap-2">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {item.provider?.toUpperCase()} — {label}
      </p>
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={60}
            dataKey="value"
          >
            <Cell fill="#3b82f6" />
            <Cell fill="#e2e8f0" />
          </Pie>
          <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
        </PieChart>
      </ResponsiveContainer>
      <div className="text-center">
        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
          {fmtPct(item.coverage_pct)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">coberto por reservas</p>
      </div>
      {item.details?.covered_spend != null && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Coberto: <strong>{fmtCost(item.details.covered_spend)}</strong>
        </p>
      )}
      {item.error && (
        <p className="text-xs text-red-500">Sem dados</p>
      )}
    </div>
  );
};

const ReservationsTab = () => {
  const { fmtCost } = useCurrency();
  const [activeTab, setActiveTab] = useState(0);
  const { coverage, utilization, recommendations, isLoadingCoverage, isLoadingUtilization, isLoadingRecs, generateRecs } = useReservations();

  const totalPotential = recommendations.reduce((s, r) => s + (r.estimated_saving_monthly || 0), 0);

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              activeTab === i
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab}
            {tab === 'Recomendações' && recommendations.length > 0 && (
              <span className="ml-1.5 bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {recommendations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Coverage */}
      {activeTab === 0 && (
        <div>
          {isLoadingCoverage ? (
            <div className="card p-8 text-center text-gray-500 dark:text-gray-400">Carregando cobertura...</div>
          ) : coverage.length === 0 ? (
            <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
              Nenhum dado de cobertura disponível. Configure contas AWS ou Azure com permissões de Cost Explorer.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {coverage.map((item, i) => (
                <CoveragePie key={i} item={item} fmtCost={fmtCost} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Utilization */}
      {activeTab === 1 && (
        <div>
          {isLoadingUtilization ? (
            <div className="card p-8 text-center text-gray-500 dark:text-gray-400">Carregando utilização...</div>
          ) : utilization.length === 0 ? (
            <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
              Nenhum dado de utilização. Garanta que existam RIs ou Savings Plans ativos.
            </div>
          ) : (
            <div className="space-y-3">
              {utilization.map((item, i) => (
                <div key={i} className="card p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {STATUS_ICONS[item.status || 'warning']}
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {item.provider?.toUpperCase()} — {item.type === 'savings_plan' ? 'Savings Plan' : 'Reserved Instance'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Utilização: <span className={STATUS_COLORS[item.status || 'warning'] + ' font-semibold'}>
                          {fmtPct(item.utilization_pct)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                      {item.net_savings ? `${fmtCost(item.net_savings)}/mês` : '—'}
                    </p>
                    <p className="text-xs text-gray-400">economia líquida</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {activeTab === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              {totalPotential > 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Potencial de economia: <strong className="text-green-600 dark:text-green-400">
                    {fmtCost(totalPotential)}/mês
                  </strong>
                </p>
              )}
            </div>
            <button
              onClick={() => generateRecs.mutate()}
              disabled={generateRecs.isPending}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <RefreshCw size={14} className={generateRecs.isPending ? 'animate-spin' : ''} />
              {generateRecs.isPending ? 'Gerando...' : 'Gerar Recomendações'}
            </button>
          </div>

          {isLoadingRecs ? (
            <div className="card p-8 text-center text-gray-500 dark:text-gray-400">Carregando...</div>
          ) : recommendations.length === 0 ? (
            <div className="card p-8 text-center">
              <TrendingDown size={32} className="mx-auto text-gray-400 mb-2" />
              <p className="text-gray-500 dark:text-gray-400">
                Nenhuma recomendação de reserva. Clique em "Gerar Recomendações" para analisar.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div key={rec.id} className="card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {rec.resource_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {rec.provider?.toUpperCase()} ·{' '}
                        <span className={`capitalize ${
                          rec.severity === 'high' ? 'text-red-500' : 'text-yellow-500'
                        }`}>
                          {rec.severity === 'high' ? 'Alta' : 'Média'} prioridade
                        </span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                        {fmtCost(rec.estimated_saving_monthly)}/mês
                      </p>
                      <p className="text-xs text-gray-400">economia estimada</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{rec.reasoning}</p>
                  <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-500">
                    <span>Atual: {rec.current_spec}</span>
                    <span className="text-blue-500">→ {rec.recommended_spec}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReservationsTab;
