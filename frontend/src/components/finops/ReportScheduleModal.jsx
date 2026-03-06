import { useState } from 'react';
import { X, Mail, CheckCircle, XCircle } from 'lucide-react';
import { WEEK_DAYS, REPORT_TIMEZONES } from '../../utils/finops-constants';

const ReportScheduleModal = ({ onClose, existing, onSave, onDelete, saving, deleting }) => {
  const [form, setForm] = useState({
    name:            existing?.name             ?? 'Relatório Semanal',
    schedule_type:   existing?.schedule_type    ?? 'weekly',
    send_day:        existing?.send_day         ?? 1,
    send_time:       existing?.send_time        ?? '08:00',
    timezone:        existing?.timezone         ?? 'America/Sao_Paulo',
    recipients:      existing?.recipients       ?? [],
    include_costs:   existing?.include_costs    ?? true,
    include_budgets: existing?.include_budgets  ?? true,
    include_finops:  existing?.include_finops   ?? true,
    is_enabled:      existing?.is_enabled       ?? true,
  });
  const [emailInput, setEmailInput] = useState('');
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

  const addEmail = () => {
    const e = emailInput.trim().toLowerCase();
    if (!e || form.recipients.includes(e)) { setEmailInput(''); return; }
    set('recipients', [...form.recipients, e]);
    setEmailInput('');
  };

  const removeEmail = (e) => set('recipients', form.recipients.filter((r) => r !== e));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-indigo-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Relatório Automático</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800 dark:text-slate-200">Ativar relatório automático</span>
            <button
              onClick={() => set('is_enabled', !form.is_enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">Frequência</label>
            <div className="flex gap-2">
              {[{ value: 'weekly', label: 'Semanal' }, { value: 'monthly', label: 'Mensal' }].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => { set('schedule_type', value); set('send_day', 1); }}
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

          {/* Day + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                {form.schedule_type === 'weekly' ? 'Dia da semana' : 'Dia do mês'}
              </label>
              {form.schedule_type === 'weekly' ? (
                <select
                  value={form.send_day}
                  onChange={(e) => set('send_day', parseInt(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
                >
                  {WEEK_DAYS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              ) : (
                <input
                  type="number" min="1" max="28"
                  value={form.send_day}
                  onChange={(e) => set('send_day', parseInt(e.target.value) || 1)}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Horário</label>
              <input
                type="time"
                value={form.send_time}
                onChange={(e) => set('send_time', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Fuso horário</label>
            <select
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
            >
              {REPORT_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Destinatários</label>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                placeholder="email@exemplo.com"
                className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={addEmail}
                className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 dark:hover:border-slate-500 transition-colors"
              >
                Adicionar
              </button>
            </div>
            {form.recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.recipients.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1 rounded-full bg-indigo-600/20 border border-indigo-500/30 px-2 py-0.5 text-xs text-indigo-700 dark:text-indigo-300">
                    {e}
                    <button onClick={() => removeEmail(e)} className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sections */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">Seções do relatório</label>
            <div className="space-y-2">
              {[
                { key: 'include_costs',   label: 'Custos por provedor' },
                { key: 'include_budgets', label: 'Status dos orçamentos' },
                { key: 'include_finops',  label: 'Recomendações FinOps' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={() => set(key, !form[key])}
                    className="rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-indigo-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Last run info */}
          {existing && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-3 py-2 space-y-1 text-xs">
              <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
                <span>Último envio</span>
                <span className="flex items-center gap-1">
                  {existing.last_run_status === 'success' && <CheckCircle size={11} className="text-green-500 dark:text-green-400" />}
                  {existing.last_run_status === 'error' && <XCircle size={11} className="text-red-500 dark:text-red-400" />}
                  {fmtDate(existing.last_run_at)}
                </span>
              </div>
              {existing.next_run_at && (
                <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
                  <span>Próximo envio</span>
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
                disabled={saving || !form.recipients.length}
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

export default ReportScheduleModal;
