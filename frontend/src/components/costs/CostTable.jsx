import { Bell, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';

// Convert amount from sourceCurrency to targetCurrency using rate
function _normalize(amount, src, tgt, rate) {
  if (!amount || src === tgt) return amount;
  if (src === 'USD' && tgt === 'BRL' && rate) return amount * rate;
  if (src === 'BRL' && tgt === 'USD' && rate) return amount / rate;
  return amount;
}

/**
 * Calculate current spend normalized to displayCurrency.
 * data.combined values are in each provider's native currency (Azure may bill in BRL).
 * We use data.currencies to know the source currency per provider.
 */
function getCurrentSpendNormalized(alert, costData, displayCurrency, rate) {
  if (!costData || !alert) return null;
  const combined = costData.combined || [];
  if (!combined.length) return null;
  const currencies = costData.currencies || {};

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const normVal = (d) => {
    if (alert.provider === 'all') {
      return (
        _normalize(d.aws   || 0, currencies.aws   || 'USD', displayCurrency, rate) +
        _normalize(d.azure || 0, currencies.azure || 'USD', displayCurrency, rate) +
        _normalize(d.gcp   || 0, currencies.gcp   || 'USD', displayCurrency, rate)
      );
    }
    const raw = d[alert.provider] || 0;
    const src = currencies[alert.provider] || 'USD';
    return _normalize(raw, src, displayCurrency, rate);
  };

  if (alert.period === 'monthly') {
    return combined
      .filter((d) => d.date >= monthStart)
      .reduce((s, d) => s + normVal(d), 0);
  }
  // daily: last entry with data
  const last = [...combined].reverse().find((d) => {
    const v = alert.provider === 'all' ? (d.total || 0) : (d[alert.provider] || 0);
    return v > 0;
  });
  return last ? normVal(last) : 0;
}

function AlertProgressBar({ alert, costData, fmtCost, currency, rate }) {
  if (alert.threshold_type !== 'fixed') return null;

  const current = getCurrentSpendNormalized(alert, costData, currency, rate);
  if (current == null) return null;

  // Threshold stored in USD — normalize to display currency for comparison
  const thresholdDisplay = _normalize(alert.threshold_value, 'USD', currency, rate);
  const pct = Math.min(100, thresholdDisplay > 0 ? (current / thresholdDisplay) * 100 : 0);

  const barColor =
    pct >= 100 ? 'bg-red-500' :
    pct >= 80  ? 'bg-orange-400' :
    pct >= 60  ? 'bg-yellow-400' :
                 'bg-green-500';

  // Both values already in display currency — pass as source = currency to avoid double conversion
  const fmt = (v) => fmtCost(v, currency);

  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
        <span>{fmt(current)} de {fmt(thresholdDisplay)}</span>
        <span className={pct >= 100 ? 'text-red-500 font-semibold' : pct >= 80 ? 'text-orange-500 font-semibold' : ''}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const CostTable = ({ alerts, events, onAddAlert, onDeleteAlert, onMarkEventRead, costData }) => {
  const { fmtCost, currency, rate } = useCurrency();

  return (
    <>
      {/* Alert Management */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <Bell className="w-4 h-4" /> Alertas de Custo
          </h2>
          <button
            onClick={onAddAlert}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Alerta
          </button>
        </div>

        {alerts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
            Nenhum alerta configurado. Crie um para ser notificado quando os custos ultrapassarem um limite.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {['Nome / Progresso', 'Provedor', 'Período', 'Tipo', 'Limite', 'Ativo', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {alerts.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-2.5 min-w-[200px]">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.name}</p>
                      <AlertProgressBar
                        alert={a}
                        costData={costData}
                        fmtCost={fmtCost}
                        currency={currency}
                        rate={rate}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 uppercase">{a.provider}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{a.period === 'daily' ? 'Diário' : 'Mensal'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{a.threshold_type === 'fixed' ? 'Fixo' : '%'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {a.threshold_type === 'fixed'
                        ? fmtCost(a.threshold_value, 'USD')
                        : `${a.threshold_value}%`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={a.is_active ? 'badge-success' : 'badge-gray'}>{a.is_active ? 'Sim' : 'Não'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => onDeleteAlert(a.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
                        title="Remover alerta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alert Events History */}
      {events.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500" /> Histórico de Disparos
          </h2>
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className={`flex items-start gap-3 p-3 rounded-lg border text-sm
                ${ev.is_read
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30'
                  : 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20'
                }`}>
                <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${ev.is_read ? 'text-gray-400' : 'text-orange-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${ev.is_read ? 'text-gray-600 dark:text-gray-400' : 'text-orange-700 dark:text-orange-300'}`}>{ev.message}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {new Date(ev.triggered_at).toLocaleString('pt-BR')}
                    {ev.current_value != null && (
                      <> · Valor: <strong>{fmtCost(ev.current_value, 'USD')}</strong></>
                    )}
                    {ev.threshold_value != null && (
                      <> · Limite: {fmtCost(ev.threshold_value, 'USD')}</>
                    )}
                  </p>
                </div>
                {!ev.is_read && (
                  <button
                    onClick={() => onMarkEventRead(ev.id)}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors"
                    title="Marcar como lido"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default CostTable;
