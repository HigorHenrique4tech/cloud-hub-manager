import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import scheduleService from '../../services/scheduleService';
import awsService from '../../services/awsservices';
import azureService from '../../services/azureservices';

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

/* ── Fetch resources based on provider + type ───────────────── */
async function fetchResources(provider, resource_type) {
  if (provider === 'aws' && resource_type === 'ec2') {
    return awsService.listEC2Instances();
  }
  if (provider === 'azure' && resource_type === 'vm') {
    return azureService.listVMs();
  }
  if (provider === 'azure' && resource_type === 'app_service') {
    return azureService.listAppServices();
  }
  return null;
}

/* ── Normalize API response into common option list ────────── */
function toOptions(provider, resource_type, data) {
  if (!data) return [];
  if (provider === 'aws' && resource_type === 'ec2') {
    return (data.instances || []).map((i) => ({
      resource_id:   i.instance_id,
      resource_name: i.name || i.instance_id,
      label:         i.name || i.instance_id,
      sublabel:      `${i.instance_type} · ${i.state}`,
    }));
  }
  if (provider === 'azure' && resource_type === 'vm') {
    return (data.virtual_machines || []).map((v) => ({
      resource_id:   `${v.resource_group}/${v.name}`,
      resource_name: v.name,
      label:         v.name,
      sublabel:      `${v.resource_group} · ${v.power_state || v.status || ''}`,
    }));
  }
  if (provider === 'azure' && resource_type === 'app_service') {
    const items = data.app_services || data.apps || (Array.isArray(data) ? data : []);
    return items.map((a) => ({
      resource_id:   `${a.resource_group}/${a.name}`,
      resource_name: a.name,
      label:         a.name,
      sublabel:      `${a.resource_group} · ${a.state || a.status || ''}`,
    }));
  }
  return [];
}

/* ── Main component ─────────────────────────────────────────── */
const ScheduleFormModal = ({ isOpen, onClose, initialData = null }) => {
  const queryClient = useQueryClient();
  const isEdit = Boolean(initialData?.id);

  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setForm(initialData ? { ...empty, ...initialData } : empty);
    }
  }, [isOpen, initialData]);

  /* Reset resource fields when provider or type changes */
  const handleProviderChange = (e) => {
    const provider = e.target.value;
    const resource_type = provider === 'aws' ? 'ec2' : 'vm';
    setForm((f) => ({ ...f, provider, resource_type, resource_id: '', resource_name: '' }));
  };

  const handleTypeChange = (e) => {
    setForm((f) => ({ ...f, resource_type: e.target.value, resource_id: '', resource_name: '' }));
  };

  /* Fetch resource list */
  const {
    data: resourceData,
    isLoading: resourcesLoading,
    isError: resourcesError,
  } = useQuery({
    queryKey: ['resources-picker', form.provider, form.resource_type],
    queryFn: () => fetchResources(form.provider, form.resource_type),
    enabled: isOpen && !isEdit,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const options = useMemo(
    () => toOptions(form.provider, form.resource_type, resourceData),
    [form.provider, form.resource_type, resourceData],
  );

  const handleResourceSelect = (e) => {
    const selected = options.find((o) => o.resource_id === e.target.value);
    if (selected) {
      setForm((f) => ({
        ...f,
        resource_id:   selected.resource_id,
        resource_name: selected.resource_name,
      }));
    } else {
      setForm((f) => ({ ...f, resource_id: '', resource_name: '' }));
    }
  };

  /* Mutations */
  const createMutation = useMutation({
    mutationFn: (data) => scheduleService.createSchedule(data),
    onSuccess: () => { queryClient.invalidateQueries(['schedules']); onClose(); },
    onError:   (err) => setError(err?.response?.data?.detail || 'Erro ao criar agendamento'),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => scheduleService.updateSchedule(initialData.id, data),
    onSuccess: () => { queryClient.invalidateQueries(['schedules']); onClose(); },
    onError:   (err) => setError(err?.response?.data?.detail || 'Erro ao atualizar agendamento'),
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (isEdit) {
      updateMutation.mutate({
        schedule_type: form.schedule_type,
        schedule_time: form.schedule_time,
        timezone:      form.timezone,
        resource_name: form.resource_name,
        is_enabled:    form.is_enabled,
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

          {/* ── Create-only fields ───────────────────────────────── */}
          {!isEdit && (
            <>
              {/* Provider + type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Provedor</label>
                  <select
                    value={form.provider}
                    onChange={handleProviderChange}
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
                    onChange={handleTypeChange}
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

              {/* Resource picker */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Recurso</label>

                {resourcesLoading ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-600 bg-slate-800 text-slate-500 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando recursos…
                  </div>
                ) : resourcesError || options.length === 0 ? (
                  /* Fallback: manual text input */
                  <div className="space-y-2">
                    {resourcesError && (
                      <div className="flex items-center gap-1.5 text-xs text-yellow-400">
                        <AlertCircle size={12} />
                        Não foi possível listar recursos. Insira manualmente.
                      </div>
                    )}
                    {options.length === 0 && !resourcesError && (
                      <p className="text-xs text-slate-500">Nenhum recurso encontrado. Insira o ID manualmente.</p>
                    )}
                    <input
                      type="text"
                      value={form.resource_id}
                      onChange={set('resource_id')}
                      required
                      placeholder={form.provider === 'aws' ? 'i-0abc12345' : 'meu-rg/minha-vm'}
                      className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                ) : (
                  <select
                    value={form.resource_id}
                    onChange={handleResourceSelect}
                    required
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Selecionar recurso…</option>
                    {options.map((o) => (
                      <option key={o.resource_id} value={o.resource_id}>
                        {o.label}{o.sublabel ? ` — ${o.sublabel}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}

          {/* Resource name — auto-filled on select, editable */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Nome do Recurso
              {!isEdit && form.resource_id && (
                <span className="ml-1 text-slate-600">(editável)</span>
              )}
            </label>
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
              <label className="block text-xs font-medium text-slate-400 mb-1">Horário</label>
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

          {/* Submit */}
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
