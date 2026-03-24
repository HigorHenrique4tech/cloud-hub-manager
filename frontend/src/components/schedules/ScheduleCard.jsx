import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play, Pencil, Trash2, ToggleLeft, ToggleRight,
  Server, Globe, Cloud, CheckCircle2, XCircle, Clock,
  Loader2, History,
} from 'lucide-react';
import scheduleService from '../../services/scheduleService';
import PermissionGate from '../common/PermissionGate';

const PROVIDER_STYLES = {
  aws:   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  azure: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  gcp:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const RESOURCE_ICONS = {
  ec2: Server,
  vm: Server,
  app_service: Globe,
  instance: Cloud,
};

const DAY_SHORT = { mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom' };

function formatCountdown(isoStr) {
  if (!isoStr) return null;
  const diff = new Date(isoStr) - Date.now();
  if (diff <= 0) return 'agora';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  if (hrs < 24) return `${hrs}h${rm > 0 ? ` ${rm}min` : ''}`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function scheduleLabel(s) {
  if (s.schedule_type === 'custom' && s.custom_days?.length) {
    return s.custom_days.map(d => DAY_SHORT[d] || d).join(', ');
  }
  if (s.schedule_type === 'monthly' && s.monthly_days?.length) {
    return `Dia ${s.monthly_days.join(', ')}`;
  }
  return { daily: 'Diário', weekdays: 'Seg–Sex', weekends: 'Sáb–Dom' }[s.schedule_type] || s.schedule_type;
}

export default function ScheduleCard({ schedule: s, onEdit, onShowHistory }) {
  const qc = useQueryClient();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!s.next_run_at) return;
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, [s.next_run_at]);

  const toggleMut = useMutation({
    mutationFn: () => scheduleService.updateSchedule(s.id, { is_enabled: !s.is_enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => scheduleService.deleteSchedule(s.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });

  const runNowMut = useMutation({
    mutationFn: () => scheduleService.runNow(s.id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['schedules'] }), 3000),
  });

  const handleDelete = () => {
    if (confirm(`Excluir agendamento "${s.resource_name}"?`)) deleteMut.mutate();
  };

  const isStart = s.action === 'start';
  const ResourceIcon = RESOURCE_ICONS[s.resource_type] || Server;
  const countdown = formatCountdown(s.next_run_at);
  const lastRuns = s.last_runs || [];

  return (
    <div
      className={`group bg-white dark:bg-gray-800 border rounded-xl overflow-hidden transition-all hover:shadow-md ${
        !s.is_enabled ? 'opacity-50' : ''
      } ${isStart
        ? 'border-l-4 border-l-emerald-500 border-gray-200 dark:border-gray-700'
        : 'border-l-4 border-l-red-500 border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Resource icon */}
          <div className={`p-2 rounded-lg ${
            isStart ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'
          }`}>
            <ResourceIcon className={`w-4 h-4 ${isStart ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {s.resource_name}
              </h4>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${PROVIDER_STYLES[s.provider] || ''}`}>
                {s.provider}
              </span>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                isStart
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
              }`}>
                {isStart ? '▶ START' : '■ STOP'}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {scheduleLabel(s)} · {s.schedule_time}
              </span>
              <span className="text-gray-300 dark:text-gray-600">({s.timezone})</span>
            </div>

            <div className="flex items-center gap-3 mt-1.5 text-xs">
              {s.is_enabled && countdown && (
                <span className="flex items-center gap-1 text-primary font-medium">
                  <Clock className="w-3 h-3" />
                  Próximo: {countdown}
                </span>
              )}
              {!s.is_enabled && (
                <span className="text-gray-400 dark:text-gray-500 italic">Pausado</span>
              )}
              {s.last_run_at && (
                <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                  {s.last_run_status === 'success' ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-500" />
                  )}
                  {new Date(s.last_run_at).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            {/* Mini execution dots */}
            {lastRuns.length > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-gray-400 mr-1">Últimas:</span>
                {lastRuns.slice(0, 7).map((r, i) => (
                  <div
                    key={r.id || i}
                    title={`${r.status} — ${r.triggered_at ? new Date(r.triggered_at).toLocaleString('pt-BR') : ''} (${r.trigger_type})`}
                    className={`w-2 h-2 rounded-full ${
                      r.status === 'success' ? 'bg-emerald-500' :
                      r.status === 'failed' ? 'bg-red-500' :
                      'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            )}

            {s.last_run_error && (
              <p className="mt-2 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded px-2 py-1 line-clamp-2">
                {s.last_run_error}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <PermissionGate permission="resources.start_stop">
              <button
                onClick={() => toggleMut.mutate()}
                disabled={toggleMut.isPending}
                className="transition-colors"
                title={s.is_enabled ? 'Pausar' : 'Ativar'}
              >
                {s.is_enabled ? (
                  <ToggleRight className="w-7 h-7 text-emerald-500 hover:text-emerald-600" />
                ) : (
                  <ToggleLeft className="w-7 h-7 text-gray-400 hover:text-gray-500" />
                )}
              </button>

              <button
                onClick={() => runNowMut.mutate()}
                disabled={runNowMut.isPending}
                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 hover:text-blue-600 transition-colors"
                title="Executar agora"
              >
                {runNowMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>

              <button
                onClick={() => onEdit?.(s)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Editar"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleDelete}
                disabled={deleteMut.isPending}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                title="Excluir"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </PermissionGate>
          </div>
        </div>
      </div>

      {/* History link */}
      {lastRuns.length > 0 && (
        <button
          onClick={() => onShowHistory?.(s)}
          className="w-full flex items-center justify-center gap-1 py-1.5 border-t border-gray-100 dark:border-gray-700/50 text-[11px] text-gray-400 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
        >
          <History className="w-3 h-3" />
          Ver histórico completo ({lastRuns.length >= 7 ? '7+' : lastRuns.length} execuções)
        </button>
      )}
    </div>
  );
}
