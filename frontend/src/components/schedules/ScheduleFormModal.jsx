import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import scheduleService from '../../services/scheduleService';

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Fortaleza',
  'America/Belem',
  'America/Noronha',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
];

const SCHEDULE_TYPES = [
  { value: 'daily',    label: 'Diário' },
  { value: 'weekdays', label: 'Seg – Sex' },
  { value: 'weekends', label: 'Sáb – Dom' },
];

const empty = {
  provider: 'aws',
  resource_id: '',
  resource_name: '',
  resource_type: 'ec2',
  action: 'stop',
  schedule_type: 'weekdays',
  schedule_time: '19:00',
  timezone: 'America/Sao_Paulo',
  is_enabled: true,
};

/**
 * ScheduleFormModal
 *
 * Props:
 *   isOpen        — boolean
 *   onClose       — () => void
 *   initialData   — partial schedule object (for pre-fill from FinOps recommendation or edit)
 *
 * Internally handles both create and update based on initialData.id presence.
 */
const ScheduleFormModal = ({ isOpen, onClose, initialData = null }) => {
  const queryClient = useQueryClient();
  const isEdit = Boolean(initialData?.id);

  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      if (initialData) {
        setForm({ ...empty, ...initialData });
      } else {
        setForm(empty);
      }
    }
  }, [isOpen, initialData]);

  const createMutation = useMutation({
    mutationFn: (data) => scheduleService.createSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['schedules']);
      onClose();
    },
    onError: (err) => {
      setError(err?.response?.data?.detail || 'Erro ao criar agendamento');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data) => scheduleService.updateSchedule(initialData.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['schedules']);
      onClose();
    },
    onError: (err) => {
      setError(err?.response?.data?.detail || 'Erro ao atualizar agendamento');
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (isEdit) {
      updateMutation.mutate({
        schedule_type: form.schedule_type,
        schedule_time: form.schedule_time,
        timezone: form.timezone,
        resource_name: form.resource_name,
        is_enabled: form.is_enabled,
      });
    } else {
      createMutation.mutate(form);
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setDirect = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">
            {isEdit ? 'Editar Agendamento' : 'Novo Agendamento'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Provider + resource type (create only) */}
          {!isEdit && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Provedor</label>
                  <select
                    value={form.provider}
                    onChange={set('provider')}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="aws">AWS</option>
                    <option value="azure">Azure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tipo</label>
                  <select
                    value={form.resource_type}
                    onChange={set('resource_type')}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                  >
                    {form.provider === 'aws'
                      ? <option value="ec2">EC2</option>
                      : <>
                          <option value="vm">VM</option>
                          <option value="app_service">App Service</option>
                        </>
                    }
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Resource ID
                  {form.provider === 'azure' && <span className="text-slate-500 ml-1">(resource_group/nome)</span>}
                </label>
                <input
                  type="text"
                  value={form.resource_id}
                  onChange={set('resource_id')}
                  required
                  placeholder={form.provider === 'aws' ? 'i-0abc12345' : 'meu-rg/minha-vm'}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Nome do Recurso</label>
            <input
              type="text"
              value={form.resource_name}
              onChange={set('resource_name')}
              required
              placeholder="meu-servidor-dev"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Action (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Ação</label>
              <div className="flex gap-2">
                {['start', 'stop'].map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setDirect('action', a)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                      form.action === a
                        ? a === 'start'
                          ? 'border-green-500 bg-green-500/20 text-green-300'
                          : 'border-red-500 bg-red-500/20 text-red-300'
                        : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {a === 'start' ? '▶ Ligar' : '■ Desligar'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Schedule type */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Dias</label>
            <div className="flex gap-2">
              {SCHEDULE_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDirect('schedule_type', value)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                    form.schedule_type === value
                      ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                      : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Time + timezone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Horário (UTC)</label>
              <input
                type="time"
                value={form.schedule_time}
                onChange={set('schedule_time')}
                required
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Fuso horário</label>
              <select
                value={form.timezone}
                onChange={set('timezone')}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-900/30 border border-red-700/40 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar Agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScheduleFormModal;
