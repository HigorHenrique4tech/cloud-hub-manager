import { useState } from 'react';
import { X } from 'lucide-react';

const BudgetModal = ({ onClose, onSave, saving, existing = null }) => {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    name:            existing?.name            ?? '',
    provider:        existing?.provider        ?? 'all',
    amount:          existing?.amount          ?? '',
    period:          existing?.period          ?? 'monthly',
    alert_threshold: existing ? Math.round((existing.alert_threshold ?? 0.8) * 100) : 80,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    const payload = {
      name:            form.name,
      alert_threshold: form.alert_threshold / 100,
      amount:          parseFloat(form.amount),
    };
    if (!isEdit) {
      payload.provider = form.provider;
      payload.period   = form.period;
    }
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Editar Orçamento' : 'Novo Orçamento'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: AWS Production Q1"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-primary focus:outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => set('provider', e.target.value)}
                disabled={isEdit}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-50"
              >
                <option value="all">Todos</option>
                <option value="aws">AWS</option>
                <option value="azure">Azure</option>
                <option value="gcp">GCP</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Período</label>
              <select
                value={form.period}
                onChange={(e) => set('period', e.target.value)}
                disabled={isEdit}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-50"
              >
                <option value="monthly">Mensal</option>
                <option value="quarterly">Trimestral</option>
                <option value="annual">Anual</option>
              </select>
            </div>
          </div>
          {isEdit && (
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">Provider e período não podem ser alterados após a criação.</p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Valor (USD)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="1000.00"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-primary focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Alerta em {form.alert_threshold}% do orçamento
            </label>
            <input
              type="range"
              min="50"
              max="100"
              step="5"
              value={form.alert_threshold}
              onChange={(e) => set('alert_threshold', parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors active:scale-[0.97]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-all active:scale-[0.97]"
            >
              {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Orçamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BudgetModal;
