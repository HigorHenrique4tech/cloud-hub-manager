import { useState } from 'react';

const PROVIDERS = ['aws', 'azure', 'all'];
const PERIODS_ALERT = ['daily', 'monthly'];
const THRESHOLD_TYPES = ['fixed', 'percentage'];

const AlertModal = ({ onClose, onSave }) => {
  const [form, setForm] = useState({
    name: '', provider: 'all', service: '',
    threshold_type: 'fixed', threshold_value: '', period: 'monthly',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, threshold_value: parseFloat(form.threshold_value), service: form.service || null });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Novo Alerta de Custo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input
              required value={form.name} onChange={(e) => set('name', e.target.value)}
              className="input w-full" placeholder="Ex: Alerta AWS Mensal"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provedor</label>
              <select value={form.provider} onChange={(e) => set('provider', e.target.value)} className="input w-full">
                {PROVIDERS.map((p) => <option key={p} value={p}>{p === 'all' ? 'Todos' : p.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Período</label>
              <select value={form.period} onChange={(e) => set('period', e.target.value)} className="input w-full">
                {PERIODS_ALERT.map((p) => <option key={p} value={p}>{p === 'daily' ? 'Diário' : 'Mensal'}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Serviço (opcional)</label>
            <input
              value={form.service} onChange={(e) => set('service', e.target.value)}
              className="input w-full" placeholder="Ex: EC2, S3 (deixe vazio para total)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
              <select value={form.threshold_type} onChange={(e) => set('threshold_type', e.target.value)} className="input w-full">
                {THRESHOLD_TYPES.map((t) => <option key={t} value={t}>{t === 'fixed' ? 'Valor fixo ($)' : 'Percentual (%)'}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Limite {form.threshold_type === 'fixed' ? '(USD)' : '(%)'}
              </label>
              <input
                required type="number" min="0" step="0.01"
                value={form.threshold_value} onChange={(e) => set('threshold_value', e.target.value)}
                className="input w-full" placeholder="0.00"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">Criar Alerta</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AlertModal;
