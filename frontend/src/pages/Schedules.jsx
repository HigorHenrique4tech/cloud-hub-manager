import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Plus, Zap, Shield, ChevronDown, ChevronUp, Power, PowerOff,
  Trash2, ScrollText, X, AlertTriangle, CheckCircle,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import PlanGate from '../components/common/PlanGate';
import PermissionGate from '../components/common/PermissionGate';
import LoadingSpinner from '../components/common/loadingspinner';
import ScheduleCard from '../components/schedules/ScheduleCard';
import ScheduleFormModal from '../components/schedules/ScheduleFormModal';
import scheduleService from '../services/scheduleService';
import policyService from '../services/policyService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';

const PLAN_ORDER = { free: 0, pro: 1, enterprise: 2 };

const TABS = [
  { id: 'schedules', label: 'Agendamentos', icon: Clock },
  { id: 'policies',  label: 'Políticas',    icon: Shield },
];

// ── Metric labels ─────────────────────────────────────────────────────────────

const METRIC_LABELS = {
  cost_increase_pct: 'Aumento de custo (%)',
  cost_absolute:     'Custo diário (US$)',
  instance_count:    'Qtd. instâncias rodando',
  anomaly_detected:  'Desvio de anomalia (%)',
};

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

// ── Policy form modal ─────────────────────────────────────────────────────────

function PolicyModal({ initial, onClose, onSave, isSaving }) {
  const [form, setForm] = useState(initial || {
    name: '',
    description: '',
    provider: 'all',
    conditions: { metric: 'cost_increase_pct', operator: 'gt', threshold: 30, window_hours: 24 },
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Alerta custo AWS alto" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provedor</label>
            <select value={form.provider} onChange={e => set('provider', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
              {['all', 'aws', 'azure', 'gcp'].map(p => (
                <option key={p} value={p}>{p === 'all' ? 'Todos' : p.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <fieldset className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-1 uppercase">Condição</legend>
            <div className="space-y-3 mt-1">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Métrica</label>
                <select value={form.conditions.metric} onChange={e => set('conditions.metric', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                  {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Operador</label>
                  <select value={form.conditions.operator} onChange={e => set('conditions.operator', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    {Object.entries(OPERATOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Limite</label>
                  <input type="number" value={form.conditions.threshold}
                    onChange={e => set('conditions.threshold', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-1 uppercase">Ação</legend>
            <div className="space-y-3 mt-1">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo de ação</label>
                <select value={form.action.type} onChange={e => set('action.type', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
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
          <button onClick={() => onSave(form)} disabled={isSaving || !form.name}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50">
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

function PolicyCard({ policy, onEdit, onDelete, onToggle }) {
  const cond = policy.conditions || {};
  const action = policy.action || {};

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${policy.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{policy.name}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-mono">{policy.provider}</span>
          </div>

          <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
            <p>
              <span className="text-gray-400">Se</span>{' '}
              <strong className="text-gray-700 dark:text-gray-300">{METRIC_LABELS[cond.metric] || cond.metric}</strong>{' '}
              {OPERATOR_LABELS[cond.operator] || cond.operator}{' '}
              <strong className="text-gray-700 dark:text-gray-300">{cond.threshold}</strong>
            </p>
            <p>
              <span className="text-gray-400">→</span>{' '}
              <strong className="text-gray-700 dark:text-gray-300">{ACTION_LABELS[action.type] || action.type}</strong>
              {action.also_notify && action.type !== 'notify' && ' + notificar'}
            </p>
          </div>

          {policy.last_triggered_at && (
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              Último disparo: {new Date(policy.last_triggered_at).toLocaleString('pt-BR')}
              {' '}· Total: {policy.trigger_count}x
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onToggle(policy.id)}
            className={`p-1.5 rounded-md transition-colors ${policy.is_active ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            title={policy.is_active ? 'Desativar' : 'Ativar'}>
            {policy.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
          </button>
          <button onClick={() => onEdit(policy)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
            <ScrollText className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(policy.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
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

  if (!isPro) {
    return (
      <PlanGate minPlan="pro" feature="Policy Engine">
        <span />
      </PlanGate>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Políticas de automação avaliadas a cada 15 minutos.
        </p>
        <PermissionGate permission="resources.manage">
          <button onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
            <Plus className="w-4 h-4" /> Nova Política
          </button>
        </PermissionGate>
      </div>

      {policiesQ.isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}

      {!policiesQ.isLoading && policies.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 py-12 text-center">
          <Shield className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Nenhuma política configurada</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 max-w-xs">
            Crie políticas para automatizar ações quando custos ou métricas ultrapassarem limites.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {policies.map(p => (
          <PolicyCard
            key={p.id}
            policy={p}
            onEdit={(pol) => { setEditTarget(pol); setShowModal(true); }}
            onDelete={(id) => { if (confirm('Deletar esta política?')) deleteMut.mutate(id); }}
            onToggle={(id) => toggleMut.mutate(id)}
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

// ── Main page ─────────────────────────────────────────────────────────────────

const Schedules = () => {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const plan = (currentOrg?.plan_tier || 'free').toLowerCase();
  const isPro = (PLAN_ORDER[plan] ?? 0) >= 1;

  const [activeTab, setActiveTab] = useState('schedules');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data: schedules = [], isLoading, error } = useQuery({
    queryKey: ['schedules', currentWorkspace?.id],
    queryFn: () => scheduleService.getSchedules(),
    enabled: isPro && Boolean(currentWorkspace),
  });

  const awsSchedules   = schedules.filter((s) => s.provider === 'aws');
  const azureSchedules = schedules.filter((s) => s.provider === 'azure');

  const openCreate = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit = (s) => { setEditTarget(s); setModalOpen(true); };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-600/20 p-2">
              <Clock size={20} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Agendamentos & Políticas</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Automação por horário e por condição
              </p>
            </div>
          </div>

          {activeTab === 'schedules' && (
            <PermissionGate permission="resources.start_stop">
              <button
                onClick={openCreate}
                disabled={!isPro}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={16} />
                Novo
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
          <>
            {!isPro && (
              <PlanGate minPlan="pro" feature="Agendamentos de recursos">
                <span />
              </PlanGate>
            )}

            {isPro && (
              <>
                {isLoading && (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-red-300 dark:border-red-700/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    Erro ao carregar agendamentos: {error?.response?.data?.detail || error.message}
                  </div>
                )}

                {!isLoading && !error && schedules.length === 0 && (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 py-14 text-center">
                    <Zap size={28} className="text-gray-400 dark:text-slate-500" />
                    <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Nenhum agendamento configurado</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 max-w-xs">
                      Use o FinOps para detectar candidatos automaticamente, ou clique em{' '}
                      <span className="text-gray-700 dark:text-slate-300">"Novo"</span> para criar manualmente.
                    </p>
                    <PermissionGate permission="resources.start_stop">
                      <button
                        onClick={openCreate}
                        className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                      >
                        Criar agendamento
                      </button>
                    </PermissionGate>
                  </div>
                )}

                {awsSchedules.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                      <span className="rounded bg-orange-500/20 px-1.5 py-0.5">AWS</span>
                      {awsSchedules.length} agendamento{awsSchedules.length > 1 ? 's' : ''}
                    </h2>
                    <div className="space-y-2">
                      {awsSchedules.map((s) => (
                        <ScheduleCard key={s.id} schedule={s} onEdit={() => openEdit(s)} />
                      ))}
                    </div>
                  </section>
                )}

                {azureSchedules.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                      <span className="rounded bg-sky-500/20 px-1.5 py-0.5">Azure</span>
                      {azureSchedules.length} agendamento{azureSchedules.length > 1 ? 's' : ''}
                    </h2>
                    <div className="space-y-2">
                      {azureSchedules.map((s) => (
                        <ScheduleCard key={s.id} schedule={s} onEdit={() => openEdit(s)} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {/* ── Policies tab ── */}
        {activeTab === 'policies' && <PoliciesTab isPro={isPro} />}
      </div>

      <ScheduleFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialData={editTarget}
      />
    </Layout>
  );
};

export default Schedules;
