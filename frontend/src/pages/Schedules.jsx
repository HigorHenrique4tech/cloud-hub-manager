import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Plus, Zap, Shield, Power, PowerOff,
  Trash2, ScrollText, X, Filter, Pencil,
  DollarSign, TrendingUp, Activity, Cpu, MemoryStick, AlertTriangle,
  Bell, ShieldCheck, Square, CalendarOff,
  BarChart3, CheckCircle2, XCircle, History,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import PlanGate from '../components/common/PlanGate';
import PermissionGate from '../components/common/PermissionGate';
import LoadingSpinner from '../components/common/loadingspinner';
import ScheduleCard from '../components/schedules/ScheduleCard';
import ScheduleFormModal from '../components/schedules/ScheduleFormModal';
import ScheduleStats from '../components/schedules/ScheduleStats';
import DailyTimeline from '../components/schedules/DailyTimeline';
import ExecutionHistoryDrawer from '../components/schedules/ExecutionHistoryDrawer';
import scheduleService from '../services/scheduleService';
import policyService from '../services/policyService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';

const PLAN_ORDER = { free: 0, pro: 1, enterprise: 2 };

const TABS = [
  { id: 'schedules', label: 'Agendamentos', icon: Clock },
  { id: 'policies',  label: 'Políticas',    icon: Shield },
];

const PROVIDER_FILTERS = [
  { id: 'all',   label: 'Todos' },
  { id: 'aws',   label: 'AWS',   color: 'text-orange-600 dark:text-orange-400' },
  { id: 'azure', label: 'Azure', color: 'text-sky-600 dark:text-sky-400' },
  { id: 'gcp',   label: 'GCP',   color: 'text-green-600 dark:text-green-400' },
];

// ── Metric labels ─────────────────────────────────────────────────────────────

const METRIC_LABELS = {
  cost_increase_pct: 'Aumento de custo (%)',
  cost_absolute:     'Custo diário (US$)',
  instance_count:    'Qtd. instâncias rodando',
  anomaly_detected:  'Desvio de anomalia (%)',
  cpu_usage_pct:     'Uso de CPU (%)',
  memory_usage_pct:  'Uso de memória (%)',
};

// Metrics that require selecting a specific resource
const RESOURCE_METRICS = new Set(['cpu_usage_pct', 'memory_usage_pct']);

const OPERATOR_LABELS = {
  gt:           'maior que',
  gte:          'maior ou igual a',
  lt:           'menor que',
  lte:          'menor ou igual a',
  increase_pct: 'aumentou mais de',
};

const ACTION_LABELS = {
  notify:           'Notificar',
  create_approval:  'Criar aprovação',
  stop_instance:    'Parar instância',
  disable_schedule: 'Desativar agendamento',
};

const METRIC_ICONS = {
  cost_increase_pct: TrendingUp,
  cost_absolute:     DollarSign,
  instance_count:    BarChart3,
  anomaly_detected:  AlertTriangle,
  cpu_usage_pct:     Cpu,
  memory_usage_pct:  MemoryStick,
};

const METRIC_COLORS = {
  cost_increase_pct: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
  cost_absolute:     'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
  instance_count:    'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
  anomaly_detected:  'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  cpu_usage_pct:     'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
  memory_usage_pct:  'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20',
};

const ACTION_COLORS = {
  notify:           'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
  create_approval:  'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
  stop_instance:    'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  disable_schedule: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20',
};

const ACTION_ICONS = {
  notify:           Bell,
  create_approval:  ShieldCheck,
  stop_instance:    Square,
  disable_schedule: CalendarOff,
};

// ── Policy form modal ─────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';

function PolicyModal({ initial, onClose, onSave, isSaving }) {
  const [form, setForm] = useState(initial || {
    name: '',
    description: '',
    provider: 'all',
    conditions: { metric: 'cost_increase_pct', operator: 'gt', threshold: 30, window_hours: 24, resource_id: '', resource_name: '' },
    action: { type: 'notify', params: {}, also_notify: true },
  });

  const set = (path, value) => {
    setForm(prev => {
      const next = { ...prev };
      const parts = path.split('.');
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const isResourceMetric = RESOURCE_METRICS.has(form.conditions.metric);
  const canLoadResources = isResourceMetric && form.provider !== 'all';

  // Load resources when provider + metric trigger it
  const resourcesQ = useQuery({
    queryKey: ['policy-resources', form.provider],
    queryFn: () => policyService.getResources(form.provider),
    enabled: canLoadResources,
    staleTime: 60000,
  });
  const resources = resourcesQ.data?.resources || [];

  // Clear resource_id when metric or provider changes
  useEffect(() => {
    if (!isResourceMetric) {
      set('conditions.resource_id', '');
      set('conditions.resource_name', '');
    }
  }, [form.conditions.metric]);

  useEffect(() => {
    set('conditions.resource_id', '');
    set('conditions.resource_name', '');
  }, [form.provider]);

  const handleResourceSelect = (e) => {
    const selected = resources.find(r => r.id === e.target.value);
    set('conditions.resource_id', e.target.value);
    set('conditions.resource_name', selected?.name || e.target.value);
  };

  const canSave = form.name && (!isResourceMetric || (form.provider !== 'all' && form.conditions.resource_id));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {initial ? 'Editar Política' : 'Nova Política'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className={INPUT_CLS} placeholder="Ex: Alerta CPU alta — servidor web" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição <span className="text-gray-400 font-normal">(opcional)</span></label>
            <textarea value={form.description || ''} onChange={e => set('description', e.target.value)}
              className={INPUT_CLS + ' resize-none'} rows={2} placeholder="Descreva o objetivo desta política..." />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provedor</label>
            <select value={form.provider} onChange={e => set('provider', e.target.value)} className={INPUT_CLS}>
              {['all', 'aws', 'azure', 'gcp'].map(p => (
                <option key={p} value={p}>{p === 'all' ? 'Todos' : p.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Condition */}
          <fieldset className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-1 uppercase">Condição</legend>
            <div className="space-y-3 mt-1">
              {/* Metric */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Métrica</label>
                <select value={form.conditions.metric} onChange={e => set('conditions.metric', e.target.value)} className={INPUT_CLS}>
                  <optgroup label="Workspace">
                    {['cost_increase_pct', 'cost_absolute', 'instance_count', 'anomaly_detected'].map(k => (
                      <option key={k} value={k}>{METRIC_LABELS[k]}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Recurso específico">
                    {['cpu_usage_pct', 'memory_usage_pct'].map(k => (
                      <option key={k} value={k}>{METRIC_LABELS[k]}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Resource picker — only for resource metrics */}
              {isResourceMetric && (
                <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 p-3 space-y-2">
                  <p className="text-xs font-medium text-primary-dark dark:text-primary-light">Recurso alvo</p>

                  {form.provider === 'all' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Selecione um provedor específico para escolher o recurso.
                    </p>
                  )}

                  {canLoadResources && (
                    <>
                      {resourcesQ.isLoading && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Carregando instâncias...</p>
                      )}
                      {resourcesQ.isError && (
                        <p className="text-xs text-red-500 dark:text-red-400">Erro ao carregar recursos.</p>
                      )}
                      {!resourcesQ.isLoading && resources.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Nenhuma instância encontrada.</p>
                      )}
                      {resources.length > 0 && (
                        <select
                          value={form.conditions.resource_id}
                          onChange={handleResourceSelect}
                          className={INPUT_CLS}
                        >
                          <option value="">— Selecione uma instância —</option>
                          {resources.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.name}{r.state ? ` (${r.state})` : ''}{r.type ? ` · ${r.type}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  )}

                  {form.conditions.resource_id && (
                    <p className="text-xs text-indigo-600 dark:text-primary-light font-mono truncate">
                      ID: {form.conditions.resource_id}
                    </p>
                  )}
                </div>
              )}

              {/* Operator + Threshold */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Operador</label>
                  <select value={form.conditions.operator} onChange={e => set('conditions.operator', e.target.value)} className={INPUT_CLS}>
                    {Object.entries(OPERATOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Limite {isResourceMetric ? '(%)' : ''}
                  </label>
                  <input type="number" min="0" max={isResourceMetric ? 100 : undefined}
                    value={form.conditions.threshold}
                    onChange={e => set('conditions.threshold', parseFloat(e.target.value) || 0)}
                    className={INPUT_CLS} />
                </div>
              </div>

              {/* Window hours */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Janela de análise (horas)</label>
                <select value={form.conditions.window_hours || 24} onChange={e => set('conditions.window_hours', parseInt(e.target.value))} className={INPUT_CLS}>
                  {[1, 6, 12, 24, 48, 72, 168].map(h => (
                    <option key={h} value={h}>{h === 1 ? '1 hora' : h < 24 ? `${h} horas` : h === 24 ? '24 horas (1 dia)' : h === 48 ? '48 horas (2 dias)' : h === 72 ? '72 horas (3 dias)' : '168 horas (7 dias)'}</option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>

          {/* Action */}
          <fieldset className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-1 uppercase">Ação</legend>
            <div className="space-y-3 mt-1">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo de ação</label>
                <select value={form.action.type} onChange={e => set('action.type', e.target.value)} className={INPUT_CLS}>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.action.also_notify}
                  onChange={e => set('action.also_notify', e.target.checked)}
                  className="accent-indigo-600 h-4 w-4" />
                Também enviar notificação
              </label>
            </div>
          </fieldset>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={() => onSave(form)} disabled={isSaving || !canSave}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors disabled:opacity-50">
            {isSaving ? 'Salvando...' : initial ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Policy logs drawer ────────────────────────────────────────────────────────

function PolicyLogsDrawer({ policyId, policyName, onClose }) {
  const logsQ = useQuery({
    queryKey: ['policy-logs', policyId],
    queryFn: () => policyService.getLogs(policyId),
  });

  const logs = logsQ.data?.logs || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Histórico de disparos</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{policyName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {logsQ.isLoading && <LoadingSpinner />}
          {logs.length === 0 && !logsQ.isLoading && (
            <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-8">Nenhum disparo registrado.</p>
          )}
          {logs.map(log => (
            <div key={log.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className={`font-medium ${log.result === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {log.result === 'success' ? '✓' : '✗'} {log.action_taken}
                </span>
                <span className="text-gray-400 dark:text-gray-500">
                  {new Date(log.triggered_at).toLocaleString('pt-BR')}
                </span>
              </div>
              {log.condition_snapshot && (
                <div className="text-gray-500 dark:text-gray-400">
                  Valor real: <strong>{log.condition_snapshot.actual_value?.toFixed(2)}</strong>
                  {' '}(limite: {log.condition_snapshot.threshold})
                </div>
              )}
              {log.error && <p className="text-red-500 dark:text-red-400 mt-1">{log.error}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Policy card ───────────────────────────────────────────────────────────────

function PolicyCard({ policy, onEdit, onDelete, onToggle, onShowLogs }) {
  const cond = policy.conditions || {};
  const action = policy.action || {};
  const MetricIcon = METRIC_ICONS[cond.metric] || Activity;
  const metricColor = METRIC_COLORS[cond.metric] || 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-700';
  const ActionIcon = ACTION_ICONS[action.type] || Bell;
  const actionColor = ACTION_COLORS[action.type] || 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-700';

  const providerBadge = {
    all:   'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    aws:   'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    azure: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400',
    gcp:   'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  };

  return (
    <div className={`card group transition-all ${policy.is_active ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        {/* Metric icon */}
        <div className={`flex-shrink-0 p-2 rounded-lg ${metricColor}`}>
          <MetricIcon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${policy.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{policy.name}</span>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${providerBadge[policy.provider] || providerBadge.all}`}>
                {policy.provider === 'all' ? 'TODOS' : policy.provider.toUpperCase()}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onToggle(policy.id)}
                className={`p-1.5 rounded-md transition-colors ${policy.is_active ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title={policy.is_active ? 'Desativar' : 'Ativar'}>
                {policy.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
              </button>
              <button onClick={() => onShowLogs(policy)}
                className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors"
                title="Histórico de disparos">
                <ScrollText className="w-4 h-4" />
              </button>
              <button onClick={() => onEdit(policy)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                title="Editar">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(policy.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                title="Excluir">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Description */}
          {policy.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{policy.description}</p>
          )}

          {/* Condition + Action row */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {cond.resource_name && (
              <span className="text-xs text-indigo-600 dark:text-primary-light font-medium bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded">
                {cond.resource_name}
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Se <strong className="text-gray-700 dark:text-gray-300">{METRIC_LABELS[cond.metric] || cond.metric}</strong>
              {' '}{OPERATOR_LABELS[cond.operator] || cond.operator}{' '}
              <strong className="text-gray-700 dark:text-gray-300">{cond.threshold}{RESOURCE_METRICS.has(cond.metric) ? '%' : ''}</strong>
              {cond.window_hours && cond.window_hours !== 24 && <span className="text-gray-400"> (janela: {cond.window_hours}h)</span>}
            </span>
          </div>

          {/* Action badge */}
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${actionColor}`}>
              <ActionIcon className="w-3 h-3" />
              {ACTION_LABELS[action.type] || action.type}
            </span>
            {action.also_notify && action.type !== 'notify' && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                <Bell className="w-3 h-3" /> Notificar
              </span>
            )}
          </div>

          {/* Trigger info */}
          {policy.last_triggered_at && (
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1">
                <History className="w-3 h-3" />
                {new Date(policy.last_triggered_at).toLocaleString('pt-BR')}
              </span>
              <span>·</span>
              <span>{policy.trigger_count}x disparos</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Policies tab ──────────────────────────────────────────────────────────────

function PoliciesTab({ isPro }) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [logsFor, setLogsFor] = useState(null);

  const policiesQ = useQuery({
    queryKey: ['policies'],
    queryFn: policyService.list,
    enabled: isPro,
  });

  const createMut = useMutation({
    mutationFn: policyService.create,
    onSuccess: () => { qc.invalidateQueries(['policies']); setShowModal(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => policyService.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['policies']); setShowModal(false); setEditTarget(null); },
  });

  const deleteMut = useMutation({
    mutationFn: policyService.delete,
    onSuccess: () => qc.invalidateQueries(['policies']),
  });

  const toggleMut = useMutation({
    mutationFn: policyService.toggle,
    onSuccess: () => qc.invalidateQueries(['policies']),
  });

  const handleSave = (form) => {
    if (editTarget) {
      updateMut.mutate({ id: editTarget.id, ...form });
    } else {
      createMut.mutate(form);
    }
  };

  const policies = policiesQ.data?.policies || [];
  const [providerFilter, setProviderFilter] = useState('all');

  const filtered = useMemo(() =>
    providerFilter === 'all' ? policies : policies.filter(p => p.provider === providerFilter),
    [policies, providerFilter]
  );

  const stats = useMemo(() => ({
    total: policies.length,
    active: policies.filter(p => p.is_active).length,
    triggers: policies.reduce((sum, p) => sum + (p.trigger_count || 0), 0),
    recent: policies.filter(p => {
      if (!p.last_triggered_at) return false;
      const diff = Date.now() - new Date(p.last_triggered_at).getTime();
      return diff < 24 * 60 * 60 * 1000;
    }).length,
  }), [policies]);

  if (!isPro) {
    return (
      <PlanGate minPlan="pro" feature="Policy Engine">
        <span />
      </PlanGate>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      {policies.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card flex items-center gap-3 p-3">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.total}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Total</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-3">
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.active}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Ativas</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-3">
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.triggers}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Disparos</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-3">
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
              <Activity className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.recent}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Últimas 24h</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Políticas de automação avaliadas a cada 15 minutos.
        </p>
        <PermissionGate permission="resources.manage">
          <button onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors">
            <Plus className="w-4 h-4" /> Nova Política
          </button>
        </PermissionGate>
      </div>

      {/* Provider filter */}
      {policies.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <div className="flex gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {PROVIDER_FILTERS.map(f => {
              const count = f.id === 'all' ? policies.length : policies.filter(p => p.provider === f.id).length;
              if (f.id !== 'all' && count === 0) return null;
              return (
                <button
                  key={f.id}
                  onClick={() => setProviderFilter(f.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    providerFilter === f.id
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {f.label}
                  <span className="ml-1 text-[10px] opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {policiesQ.isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}

      {!policiesQ.isLoading && policies.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 py-12 text-center">
          <Shield className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Nenhuma política configurada</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 max-w-xs">
            Crie políticas para automatizar ações quando custos ou métricas ultrapassarem limites.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(p => (
          <PolicyCard
            key={p.id}
            policy={p}
            onEdit={(pol) => { setEditTarget(pol); setShowModal(true); }}
            onDelete={(id) => { if (confirm('Deletar esta política?')) deleteMut.mutate(id); }}
            onToggle={(id) => toggleMut.mutate(id)}
            onShowLogs={(pol) => setLogsFor(pol)}
          />
        ))}
      </div>

      {showModal && (
        <PolicyModal
          initial={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
          onSave={handleSave}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {logsFor && (
        <PolicyLogsDrawer
          policyId={logsFor.id}
          policyName={logsFor.name}
          onClose={() => setLogsFor(null)}
        />
      )}
    </div>
  );
}

// ── Schedules tab ─────────────────────────────────────────────────────────────

function SchedulesTab({ isPro, schedules, isLoading, error, onEdit, onCreate }) {
  const [providerFilter, setProviderFilter] = useState('all');
  const [historyTarget, setHistoryTarget] = useState(null);

  if (!isPro) {
    return (
      <PlanGate minPlan="pro" feature="Agendamentos de recursos">
        <span />
      </PlanGate>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 dark:border-red-700/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        Erro ao carregar agendamentos: {error?.response?.data?.detail || error.message}
      </div>
    );
  }

  const filtered = providerFilter === 'all'
    ? schedules
    : schedules.filter(s => s.provider === providerFilter);

  const startSchedules = filtered.filter(s => s.action === 'start');
  const stopSchedules = filtered.filter(s => s.action === 'stop');

  return (
    <div className="space-y-5">
      {/* Stats */}
      <ScheduleStats schedules={schedules} />

      {/* Timeline */}
      <DailyTimeline schedules={filtered} />

      {/* Provider filter */}
      {schedules.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <div className="flex gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {PROVIDER_FILTERS.map(f => {
              const count = f.id === 'all' ? schedules.length : schedules.filter(s => s.provider === f.id).length;
              if (f.id !== 'all' && count === 0) return null;
              return (
                <button
                  key={f.id}
                  onClick={() => setProviderFilter(f.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    providerFilter === f.id
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {f.label}
                  <span className="ml-1 text-[10px] opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {schedules.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 py-14 text-center">
          <Zap size={28} className="text-gray-400 dark:text-gray-500" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Nenhum agendamento configurado</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 max-w-xs">
            Use o FinOps para detectar candidatos automaticamente, ou clique em{' '}
            <span className="text-gray-700 dark:text-gray-300">"Novo"</span> para criar manualmente.
          </p>
          <PermissionGate permission="resources.start_stop">
            <button
              onClick={onCreate}
              className="mt-1 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark transition-colors"
            >
              Criar agendamento
            </button>
          </PermissionGate>
        </div>
      )}

      {/* Schedule cards — grouped by action */}
      {filtered.length > 0 && (
        <div className="space-y-6">
          {startSchedules.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5">▶ START</span>
                {startSchedules.length} agendamento{startSchedules.length > 1 ? 's' : ''}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {startSchedules.map(s => (
                  <ScheduleCard
                    key={s.id}
                    schedule={s}
                    onEdit={() => onEdit(s)}
                    onShowHistory={() => setHistoryTarget(s)}
                  />
                ))}
              </div>
            </section>
          )}

          {stopSchedules.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                <span className="rounded bg-red-500/20 px-1.5 py-0.5">■ STOP</span>
                {stopSchedules.length} agendamento{stopSchedules.length > 1 ? 's' : ''}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {stopSchedules.map(s => (
                  <ScheduleCard
                    key={s.id}
                    schedule={s}
                    onEdit={() => onEdit(s)}
                    onShowHistory={() => setHistoryTarget(s)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Execution history drawer */}
      {historyTarget && (
        <ExecutionHistoryDrawer
          schedule={historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const Schedules = () => {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const plan = (currentOrg?.effective_plan || currentOrg?.plan_tier || 'free').toLowerCase();
  const isPro = (PLAN_ORDER[plan] ?? 0) >= 1;

  const [activeTab, setActiveTab] = useState('schedules');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data: schedules = [], isLoading, error } = useQuery({
    queryKey: ['schedules', currentWorkspace?.id],
    queryFn: () => scheduleService.getSchedules(),
    enabled: isPro && Boolean(currentWorkspace),
  });

  const openCreate = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit = (s) => { setEditTarget(s); setModalOpen(true); };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/20 p-2">
              <Clock size={20} className="text-primary-light" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Agendamentos & Políticas</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Automação por horário e por condição
              </p>
            </div>
          </div>

          {activeTab === 'schedules' && (
            <PermissionGate permission="resources.start_stop">
              <button
                onClick={openCreate}
                disabled={!isPro}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={16} />
                Novo Agendamento
              </button>
            </PermissionGate>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === t.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Schedules tab ── */}
        {activeTab === 'schedules' && (
          <SchedulesTab
            isPro={isPro}
            schedules={schedules}
            isLoading={isLoading}
            error={error}
            onEdit={openEdit}
            onCreate={openCreate}
          />
        )}

        {/* ── Policies tab ── */}
        {activeTab === 'policies' && <PoliciesTab isPro={isPro} />}
      </div>

      <ScheduleFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialData={editTarget}
        existingSchedules={schedules}
      />
    </Layout>
  );
};

export default Schedules;
