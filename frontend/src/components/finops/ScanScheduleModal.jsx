import { useState } from 'react';
import { X, Clock, CheckCircle, XCircle } from 'lucide-react';
import { TIMEZONES, SCHED_TYPES } from '../../utils/finops-constants';

const ScanScheduleModal = ({ onClose, existing, onSave, onDelete, saving, deleting }) => {
  const [form, setForm] = useState({
    is_enabled:    existing?.is_enabled    ?? true,
    schedule_type: existing?.schedule_type ?? 'daily',
    schedule_time: existing?.schedule_time ?? '02:00',
    timezone:      existing?.timezone      ?? 'America/Sao_Paulo',
    provider:      existing?.provider      ?? 'all',
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-indigo-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Análise Automática</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800 dark:text-slate-200">Ativar análise automática</span>
            <button
              onClick={() => set('is_enabled', !form.is_enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Frequência</label>
            <div className="flex gap-2">
              {SCHED_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => set('schedule_type', value)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                    form.schedule_type === value
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-700 dark:text-indigo-300'
                      : 'border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-400 dark:hover:border-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Time + Timezone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Horário</label>
              <input
                type="time"
                value={form.schedule_time}
                onChange={(e) => set('schedule_time', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Fuso horário</label>
              <select
                value={form.timezone}
                onChange={(e) => set('timezone', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
              >
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => set('provider', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
            >
              <option value="all">Todos</option>
              <option value="aws">AWS</option>
              <option value="azure">Azure</option>
              <option value="gcp">GCP</option>
            </select>
          </div>

          {/* Last run info */}
          {existing && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-3 py-2 space-y-1 text-xs">
              <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
                <span>Último scan</span>
                <span className="flex items-center gap-1">
                  {existing.last_run_status === 'success' && <CheckCircle size={11} className="text-green-500 dark:text-green-400" />}
                  {existing.last_run_status === 'failed' && <XCircle size={11} className="text-red-500 dark:text-red-400" />}
                  {fmtDate(existing.last_run_at)}
                </span>
              </div>
              {existing.next_run_at && (
                <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
                  <span>Próxima execução</span>
                  <span>{fmtDate(existing.next_run_at)}</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            {existing ? (
              <button
                onClick={onDelete}
                disabled={deleting}
                className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Removendo…' : 'Remover agendamento'}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors active:scale-[0.97]"
              >
                Cancelar
              </button>
              <button
                onClick={() => onSave(form)}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-all active:scale-[0.97]"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScanScheduleModal;
