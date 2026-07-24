import { useQuery } from '@tanstack/react-query';
import { X, CheckCircle2, XCircle, Clock, User, Bot } from 'lucide-react';
import scheduleService from '../../services/scheduleService';

export default function ExecutionHistoryDrawer({ schedule, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['schedule-runs', schedule?.id],
    queryFn: () => scheduleService.getScheduleRuns(schedule.id),
    enabled: !!schedule,
    staleTime: 10_000,
  });

  if (!schedule) return null;

  const runs = data?.runs || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel */}
      <div
        className="relative w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl overflow-y-auto animate-slide-in-right"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Histórico de Execuções
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {schedule.resource_name} · {schedule.action.toUpperCase()}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {isLoading ? (
            <div className="flex flex-col items-center py-12 text-gray-400">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
              <p className="text-sm mt-3">Carregando histórico…</p>
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma execução registrada.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map(run => (
                <div
                  key={run.id}
                  className={`rounded-lg border p-3 ${
                    run.status === 'success'
                      ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10'
                      : 'border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {run.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
                      {run.status === 'success' ? 'Sucesso' : 'Falha'}
                    </span>
                    <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      run.trigger_type === 'manual'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {run.trigger_type === 'manual' ? (
                        <span className="flex items-center gap-0.5"><User className="w-3 h-3" /> Manual</span>
                      ) : (
                        <span className="flex items-center gap-0.5"><Bot className="w-3 h-3" /> Agendado</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {run.triggered_at && new Date(run.triggered_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {run.completed_at && run.triggered_at && (
                      <span className="ml-2 text-gray-400">
                        ({Math.round((new Date(run.completed_at) - new Date(run.triggered_at)) / 1000)}s)
                      </span>
                    )}
                  </div>
                  {run.error && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 bg-red-100/50 dark:bg-red-900/20 rounded px-2 py-1 break-words">
                      {run.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
