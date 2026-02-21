import { useState } from 'react';
import { Clock, Trash2, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, Pencil } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import scheduleService from '../../services/scheduleService';
import PermissionGate from '../common/PermissionGate';

const PROVIDER_BADGE = {
  aws:   'bg-orange-500/20 text-orange-300',
  azure: 'bg-sky-500/20 text-sky-300',
};

const SCHEDULE_TYPE_LABEL = {
  daily:    'Diário',
  weekdays: 'Seg–Sex',
  weekends: 'Sáb–Dom',
};

const ACTION_STYLES = {
  start: 'bg-green-500/20 text-green-300 border border-green-500/30',
  stop:  'bg-red-500/20 text-red-300 border border-red-500/30',
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

const ScheduleCard = ({ schedule, onEdit }) => {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: (enabled) => scheduleService.updateSchedule(schedule.id, { is_enabled: enabled }),
    onSuccess: () => queryClient.invalidateQueries(['schedules']),
  });

  const deleteMutation = useMutation({
    mutationFn: () => scheduleService.deleteSchedule(schedule.id),
    onSuccess: () => queryClient.invalidateQueries(['schedules']),
  });

  const handleToggle = () => {
    toggleMutation.mutate(!schedule.is_enabled);
  };

  const handleDelete = () => {
    if (window.confirm(`Excluir agendamento "${schedule.action}" para "${schedule.resource_name}"?`)) {
      deleteMutation.mutate();
    }
  };

  return (
    <div className={`rounded-xl border transition-colors ${
      schedule.is_enabled
        ? 'border-gray-300 bg-white hover:border-gray-400 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-600'
        : 'border-gray-200 bg-gray-50/50 opacity-60 dark:border-slate-700/40 dark:bg-slate-900/30'
    }`}>
      <div className="flex items-start gap-3 p-4">
        {/* Action badge */}
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${ACTION_STYLES[schedule.action] || ''}`}>
          {schedule.action === 'start' ? '▶ START' : '■ STOP'}
        </span>

        <div className="flex-1 min-w-0">
          {/* Resource info */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PROVIDER_BADGE[schedule.provider] || 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'}`}>
              {schedule.provider?.toUpperCase()}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{schedule.resource_name}</span>
            <span className="text-xs text-gray-500 dark:text-slate-400">({schedule.resource_type})</span>
          </div>

          {/* Schedule */}
          <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
            <Clock size={12} className="text-gray-400 dark:text-slate-500" />
            <span>
              {SCHEDULE_TYPE_LABEL[schedule.schedule_type] || schedule.schedule_type}
              {' · '}
              <span className="font-mono text-gray-700 dark:text-slate-300">{schedule.schedule_time}</span>
              {' UTC'}
              {schedule.timezone !== 'UTC' && (
                <span className="text-gray-400 dark:text-slate-500"> ({schedule.timezone})</span>
              )}
            </span>
          </div>

          {/* Last run */}
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            {schedule.last_run_status === 'success' && (
              <CheckCircle2 size={11} className="text-green-500 dark:text-green-400" />
            )}
            {schedule.last_run_status === 'failed' && (
              <AlertCircle size={11} className="text-red-500 dark:text-red-400" />
            )}
            {schedule.last_run_at && (
              <span>Último: {fmtDateTime(schedule.last_run_at)}</span>
            )}
            {schedule.next_run_at && (
              <span className="text-gray-300 dark:text-slate-600">· Próximo: {fmtDateTime(schedule.next_run_at)}</span>
            )}
          </div>

          {schedule.last_run_error && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400 truncate">{schedule.last_run_error}</p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <PermissionGate permission="resources.start_stop">
            <button
              onClick={onEdit}
              title="Editar"
              className="rounded p-1.5 text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
            >
              <Pencil size={14} />
            </button>

            <button
              onClick={handleToggle}
              disabled={toggleMutation.isPending}
              title={schedule.is_enabled ? 'Desabilitar' : 'Habilitar'}
              className="rounded p-1.5 text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              {schedule.is_enabled
                ? <ToggleRight size={16} className="text-green-500 dark:text-green-400" />
                : <ToggleLeft size={16} />
              }
            </button>

            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              title="Excluir"
              className="rounded p-1.5 text-gray-400 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/40 hover:text-red-500 dark:hover:text-red-300 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          </PermissionGate>
        </div>
      </div>
    </div>
  );
};

export default ScheduleCard;
