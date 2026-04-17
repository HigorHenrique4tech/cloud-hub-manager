import { Bell, Check, CheckCheck } from 'lucide-react';

const fmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const AlertEventsPanel = ({ events = [], onMarkRead, onEvaluate, isEvaluating }) => {
  const unread = events.filter((e) => !e.is_read).length;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-yellow-500" />
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
            Eventos de Alerta
          </span>
          {unread > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5">
              {unread}
            </span>
          )}
        </div>
        <button
          onClick={onEvaluate}
          disabled={isEvaluating}
          className="btn-secondary text-xs py-1 px-2"
        >
          {isEvaluating ? 'Avaliando...' : 'Avaliar agora'}
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          Nenhum evento registrado.
        </p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {events.map((ev) => (
            <li
              key={ev.id}
              className={`flex items-start justify-between gap-2 p-2 rounded-lg text-sm transition-colors ${
                ev.is_read
                  ? 'bg-gray-50 dark:bg-gray-700/40'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 dark:text-gray-200 font-medium truncate">
                  {ev.message || 'Alerta disparado'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {fmt(ev.triggered_at)}
                  {ev.current_value != null && (
                    <span className="ml-2">
                      Valor: <strong>${Number(ev.current_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </span>
                  )}
                </p>
              </div>
              {!ev.is_read && onMarkRead && (
                <button
                  onClick={() => onMarkRead(ev.id)}
                  className="shrink-0 text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors"
                  title="Marcar como lido"
                >
                  <Check size={14} />
                </button>
              )}
              {ev.is_read && (
                <CheckCheck size={14} className="shrink-0 text-gray-400" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AlertEventsPanel;
