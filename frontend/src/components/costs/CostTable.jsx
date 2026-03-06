import { Bell, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CostTable = ({ alerts, events, onAddAlert, onDeleteAlert, onMarkEventRead }) => (
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
                {['Nome', 'Provedor', 'Período', 'Tipo', 'Limite', 'Ativo', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {alerts.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">{a.name}</td>
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
