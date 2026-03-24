import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
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
  { value: 'weekdays', label: 'Seg–Sex' },
  { value: 'weekends', label: 'Sáb–Dom' },
  { value: 'custom',   label: 'Personalizado' },
  { value: 'monthly',  label: 'Mensal' },
];

const WEEKDAYS = [
  { value: 'mon', label: 'Seg' },
  { value: 'tue', label: 'Ter' },
  { value: 'wed', label: 'Qua' },
  { value: 'thu', label: 'Qui' },
  { value: 'fri', label: 'Sex' },
  { value: 'sat', label: 'Sáb' },
  { value: 'sun', label: 'Dom' },
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
  custom_days: [],
  monthly_days: [],
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
  if (provider === 'gcp' && resource_type === 'instance') {
    // Dynamically import to avoid issues if not available
    try {
      const gcpService = (await import('../../services/gcpService')).default;
      return gcpService.listInstances();
    } catch { return null; }
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
  if (provider === 'gcp' && resource_type === 'instance') {
    const items = data.instances || data.vms || (Array.isArray(data) ? data : []);
    return items.map((i) => ({
      resource_id:   `${i.zone || 'unknown'}/${i.name}`,
      resource_name: i.name,
      label:         i.name,
      sublabel:      `${i.zone || ''} · ${i.machine_type || ''} · ${i.status || ''}`,
    }));
  }
  return [];
}

/* ── Main component ─────────────────────────────────────────── */
const ScheduleFormModal = ({ isOpen, onClose, initialData = null, existingSchedules = [] }) => {
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
    const resource_type = provider === 'aws' ? 'ec2' : provider === 'gcp' ? 'instance' : 'vm';
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

  /* Conflict detection */
  const conflict = useMemo(() => {
    if (!form.resource_id || isEdit) return null;
    const same = existingSchedules.filter(s => s.resource_id === form.resource_id && s.provider === form.provider);
    if (same.length === 0) return null;
    const hasOpposite = same.some(s => s.action !== form.action);
    const hasSame = same.some(s => s.action === form.action);
    if (hasSame) return { type: 'duplicate', msg: `Já existe um agendamento de ${form.action.toUpperCase()} para este recurso.` };
    if (!hasOpposite) return { type: 'missing', msg: `Este recurso tem ${same[0].action.toUpperCase()} mas nenhum ${form.action.toUpperCase()} correspondente. Considere criar ambos.` };
    return null;
  }, [form.resource_id, form.provider, form.action, existingSchedules, isEdit]);

  /* Custom days toggle */
  const toggleCustomDay = (day) => {
    setForm(f => {
      const days = f.custom_days || [];
      return { ...f, custom_days: days.includes(day) ? days.filter(d => d !== day) : [...days, day] };
    });
  };

  /* Monthly days toggle */
  const toggleMonthlyDay = (day) => {
    setForm(f => {
      const days = f.monthly_days || [];
      return { ...f, monthly_days: days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a,b) => a-b) };
    });
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
        custom_days:   form.schedule_type === 'custom' ? form.custom_days : null,
        monthly_days:  form.schedule_type === 'monthly' ? form.monthly_days : null,
      });
    } else {
      createMutation.mutate({
        ...form,
        custom_days:  form.schedule_type === 'custom' ? form.custom_days : null,
        monthly_days: form.schedule_type === 'monthly' ? form.monthly_days : null,
      });
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setDirect = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  if (!isOpen) return null;

  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-primary focus:outline-none';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4 bg-white dark:bg-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Editar Agendamento' : 'Novo Agendamento'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
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
                  <label className={labelCls}>Provedor</label>
                  <select value={form.provider} onChange={handleProviderChange} className={inputCls}>
                    <option value="aws">AWS</option>
                    <option value="azure">Azure</option>
                    <option value="gcp">GCP</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select value={form.resource_type} onChange={handleTypeChange} className={inputCls}>
                    {form.provider === 'aws' && <option value="ec2">EC2</option>}
                    {form.provider === 'azure' && (
                      <>
                        <option value="vm">VM</option>
                        <option value="app_service">App Service</option>
                      </>
                    )}
                    {form.provider === 'gcp' && <option value="instance">Compute Engine</option>}
                  </select>
                </div>
              </div>

              {/* Resource picker */}
              <div>
                <label className={labelCls}>Recurso</label>
                {resourcesLoading ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-500 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando recursos…
                  </div>
                ) : resourcesError || options.length === 0 ? (
                  <div className="space-y-2">
                    {resourcesError && (
                      <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
                        <AlertCircle size={12} />
                        Não foi possível listar recursos. Insira manualmente.
                      </div>
                    )}
                    {options.length === 0 && !resourcesError && (
                      <p className="text-xs text-gray-500">Nenhum recurso encontrado. Insira o ID manualmente.</p>
                    )}
                    <input
                      type="text"
                      value={form.resource_id}
                      onChange={set('resource_id')}
                      required
                      placeholder={
                        form.provider === 'aws' ? 'i-0abc12345' :
                        form.provider === 'gcp' ? 'us-central1-a/minha-vm' :
                        'meu-rg/minha-vm'
                      }
                      className={inputCls}
                    />
                  </div>
                ) : (
                  <select value={form.resource_id} onChange={handleResourceSelect} required className={inputCls}>
                    <option value="">Selecionar recurso…</option>
                    {options.map((o) => (
                      <option key={o.resource_id} value={o.resource_id}>
                        {o.label}{o.sublabel ? ` — ${o.sublabel}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Conflict warning */}
              {conflict && (
                <div className={`flex items-start gap-2 text-xs p-2.5 rounded-lg border ${
                  conflict.type === 'duplicate'
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50 text-amber-700 dark:text-amber-400'
                    : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/50 text-blue-700 dark:text-blue-400'
                }`}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {conflict.msg}
                </div>
              )}
            </>
          )}

          {/* Resource name */}
          <div>
            <label className={labelCls}>
              Nome do Recurso
              {!isEdit && form.resource_id && (
                <span className="ml-1 text-gray-400">(editável)</span>
              )}
            </label>
            <input
              type="text"
              value={form.resource_name}
              onChange={set('resource_name')}
              required
              placeholder="meu-servidor-dev"
              className={inputCls}
            />
          </div>

          {/* Action (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Ação</label>
              <div className="flex gap-2">
                {['start', 'stop'].map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setDirect('action', a)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                      form.action === a
                        ? a === 'start'
                          ? 'border-green-500 bg-green-500/20 text-green-700 dark:text-green-300'
                          : 'border-red-500 bg-red-500/20 text-red-700 dark:text-red-300'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400'
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
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Dias</label>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDirect('schedule_type', value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    form.schedule_type === value
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom days picker */}
          {form.schedule_type === 'custom' && (
            <div>
              <label className={labelCls}>Selecione os dias</label>
              <div className="flex gap-1.5">
                {WEEKDAYS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleCustomDay(value)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                      (form.custom_days || []).includes(value)
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(form.custom_days || []).length === 0 && (
                <p className="text-[11px] text-amber-500 mt-1">Selecione ao menos um dia.</p>
              )}
            </div>
          )}

          {/* Monthly days picker */}
          {form.schedule_type === 'monthly' && (
            <div>
              <label className={labelCls}>Dias do mês</label>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleMonthlyDay(d)}
                    className={`rounded-md py-1 text-xs font-medium transition-colors ${
                      (form.monthly_days || []).includes(d)
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {(form.monthly_days || []).length === 0 && (
                <p className="text-[11px] text-amber-500 mt-1">Selecione ao menos um dia do mês.</p>
              )}
              {(form.monthly_days || []).some(d => d > 28) && (
                <p className="text-[11px] text-gray-400 mt-1">Dia 29+ pula em meses com menos dias.</p>
              )}
            </div>
          )}

          {/* Time + timezone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Horário</label>
              <input type="time" value={form.schedule_time} onChange={set('schedule_time')} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fuso horário</label>
              <select value={form.timezone} onChange={set('timezone')} className={inputCls}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
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
