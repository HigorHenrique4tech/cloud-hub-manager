import { Bell, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Calculate current spend for a given alert using cost data
function getCurrentSpend(alert, costData) {
  if (!costData || !alert) return null;
  const combined = costData.combined || [];
  if (!combined.length) return null;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const getVal = (d) => {
    if (alert.provider === 'all') return d.total || 0;
    return d[alert.provider] || 0;
  };

  if (alert.period === 'monthly') {
    return combined
      .filter((d) => d.date >= monthStart)
      .reduce((s, d) => s + getVal(d), 0);
  } else {
    // daily: use the last day in dataset
    const last = [...combined].reverse().find((d) => getVal(d) > 0);
    return last ? getVal(last) : 0;
  }
}

function AlertProgressBar({ alert, costData }) {
  if (alert.threshold_type !== 'fixed') return null;
  const current = getCurrentSpend(alert, costData);
  if (current == null) return null;

  const pct = Math.min(100, (current / alert.threshold_value) * 100);
  const barColor =
    pct >= 100 ? 'bg-red-500' :
    pct >= 80  ? 'bg-orange-400' :
    pct >= 60  ? 'bg-yellow-400' :
                 'bg-green-500';

  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
        <span>{fmtUSD(current)} consumido</span>
        <span className={pct >= 100 ? 'text-red-500 font-semibold' : ''}>{pct.toFixed(0)}%</span>
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

const CostTable = ({ alerts, events, onAddAlert, onDeleteAlert, onMarkEventRead, costData }) => (
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
                  <td className="px-4 py-2.5 min-w-[180px]">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.name}</p>
                    <AlertProgressBar alert={a} costData={costData} />
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 uppercase">{a.provider}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{a.period === 'daily' ? 'Diário' : 'Mensal'}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{a.threshold_type === 'fixed' ? 'Fixo' : '%'}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 font-mono">
                    {a.threshold_type === 'fixed' ? fmtUSD(a.threshold_value) : `${a.threshold_value}%`}
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
                  {new Date(ev.triggered_at).toLocaleString('pt-BR')} · Valor: {fmtUSD(ev.current_value)} · Limite: {fmtUSD(ev.threshold_value)}
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

export default CostTable;
