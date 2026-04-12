import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Loader2, X, Save, Calendar, Bell, AlertTriangle, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import adminService from '../../services/adminService';

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

const Toggle = ({ checked, onChange, label, description }) => (
  <label className="flex items-start gap-3 cursor-pointer group">
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`mt-0.5 flex-shrink-0 w-10 h-5.5 rounded-full transition-colors relative ${
        checked ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`} />
    </button>
    <div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">{label}</span>
      {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
    </div>
  </label>
);

const BillingConfigModal = ({ onClose }) => {
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['billing-config'],
    queryFn: () => adminService.getBillingConfig(),
  });

  const [form, setForm] = useState(null);

  // Initialize form when data arrives
  if (config && !form) {
    setForm({ ...config });
  }

  const saveMut = useMutation({
    mutationFn: (data) => adminService.updateBillingConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-config'] });
      onClose();
    },
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form) return;
    saveMut.mutate({
      auto_generate_enabled: form.auto_generate_enabled,
      default_amount: form.default_amount ? parseFloat(form.default_amount) : null,
      default_due_day: parseInt(form.default_due_day, 10),
      default_period_type: form.default_period_type,
      reminder_days_before: parseInt(form.reminder_days_before, 10),
      reminder_days_after: parseInt(form.reminder_days_after, 10),
      auto_overdue_enabled: form.auto_overdue_enabled,
      auto_overdue_days: parseInt(form.auto_overdue_days, 10),
      notes_template: form.notes_template || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Settings className="w-4 h-4 text-primary-dark dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Configuração de Faturamento</h2>
              <p className="text-xs text-gray-400">Valores padrão e automação de cobranças</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {isLoading || !form ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Auto-generate */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-primary" /> Geração Automática
              </h3>
              <Toggle
                checked={form.auto_generate_enabled}
                onChange={(v) => set('auto_generate_enabled', v)}
                label="Gerar cobranças automaticamente"
                description="Cria cobranças recorrentes no início de cada período"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Valor Padrão (R$)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.default_amount || ''}
                    onChange={(e) => set('default_amount', e.target.value)}
                    placeholder="Ex: 497.00"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Dia de Vencimento</label>
                  <input
                    type="number" min="1" max="28"
                    value={form.default_due_day}
                    onChange={(e) => set('default_due_day', e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Máximo: dia 28</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo de Período Padrão</label>
                <select value={form.default_period_type} onChange={(e) => set('default_period_type', e.target.value)} className={inputCls}>
                  <option value="monthly">Mensal</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
            </div>

            {/* Reminders */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-amber-500" /> Lembretes
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Dias antes do vencimento</label>
                  <input
                    type="number" min="0" max="30"
                    value={form.reminder_days_before}
                    onChange={(e) => set('reminder_days_before', e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">0 = desativado</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Dias após atraso</label>
                  <input
                    type="number" min="0" max="30"
                    value={form.reminder_days_after}
                    onChange={(e) => set('reminder_days_after', e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">0 = desativado</p>
                </div>
              </div>
            </div>

            {/* Auto overdue */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" /> Atraso Automático
              </h3>
              <Toggle
                checked={form.auto_overdue_enabled}
                onChange={(v) => set('auto_overdue_enabled', v)}
                label="Marcar como atrasado automaticamente"
                description="Altera status para 'Em atraso' após a data de vencimento"
              />
              {form.auto_overdue_enabled && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Dias de tolerância após vencimento</label>
                  <input
                    type="number" min="0" max="30"
                    value={form.auto_overdue_days}
                    onChange={(e) => set('auto_overdue_days', e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
            </div>

            {/* Notes template */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-gray-500" /> Template de Observações
              </h3>
              <textarea
                value={form.notes_template || ''}
                onChange={(e) => set('notes_template', e.target.value)}
                rows={3}
                placeholder="Texto padrão para novas cobranças..."
                className={`${inputCls} resize-none`}
              />
              <p className="text-[10px] text-gray-400">Será preenchido automaticamente no campo de observações ao criar nova cobrança</p>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              {config?.updated_at && (
                <p className="text-[10px] text-gray-400">
                  Atualizado: {new Date(config.updated_at).toLocaleString('pt-BR')}
                </p>
              )}
              <div className="flex items-center gap-3 ml-auto">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saveMut.isPending}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.97]">
                  {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saveMut.isPending ? 'Salvando...' : 'Salvar Configuração'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BillingConfigModal;
