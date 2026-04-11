import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldAlert, ShieldCheck, ShieldOff, Zap, Settings, History,
  AlertTriangle, XCircle, CheckCircle2, Clock, RefreshCw,
  ChevronRight, Play, Plus, Building2, Key, ListChecks, Loader2,
  ArrowLeft,
} from 'lucide-react';
import api, { wsUrl as _wsUrl } from '../../services/api';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import { useToast } from '../../contexts/ToastContext';

// ── API ───────────────────────────────────────────────────────────────────────

const wsUrl = (path) => _wsUrl(`/security${path}`);

const secApi = {
  getEvents:      (params) => api.get(wsUrl('/automation/events'), { params }).then(r => r.data),
  getEvent:       (id) => api.get(wsUrl(`/automation/events/${id}`)).then(r => r.data),
  dismissEvent:   (id) => api.post(wsUrl(`/automation/events/${id}/dismiss`)).then(r => r.data),
  executeAction:  (id, body) => api.post(wsUrl(`/automation/events/${id}/execute-action`), body).then(r => r.data),
  triggerScan:    () => api.post(wsUrl('/automation/scan')).then(r => r.data),
  getPlaybooks:   () => api.get(wsUrl('/automation/playbooks')).then(r => r.data),
  updatePlaybook: (name, body) => api.put(wsUrl(`/automation/playbooks/${name}`), body).then(r => r.data),
  getAudit:       (params) => api.get(wsUrl('/automation/audit'), { params }).then(r => r.data),
  getSettings:    () => api.get(wsUrl('/automation/settings')).then(r => r.data),
  updateSettings: (body) => api.put(wsUrl('/automation/settings'), body).then(r => r.data),
  getPCConfig:    () => api.get(wsUrl('/partner-center/config')).then(r => r.data),
  savePCConfig:   (body) => api.put(wsUrl('/partner-center/config'), body).then(r => r.data),
  getCustomerSubs: (tenantId) => api.get(wsUrl(`/partner-center/customers/${tenantId}/subscriptions`)).then(r => r.data),
  suspendSub:     (tenantId, subId) => api.post(wsUrl(`/partner-center/customers/${tenantId}/subscriptions/${subId}/suspend`)).then(r => r.data),
  reactivateSub:  (tenantId, subId) => api.post(wsUrl(`/partner-center/customers/${tenantId}/subscriptions/${subId}/reactivate`)).then(r => r.data),
  getIRList:      (params) => api.get(wsUrl('/incident-responses'), { params }).then(r => r.data),
  getIRTemplates: () => api.get(wsUrl('/incident-responses/templates')).then(r => r.data),
  createIR:       (body) => api.post(wsUrl('/incident-responses'), body).then(r => r.data),
  getIR:          (id) => api.get(wsUrl(`/incident-responses/${id}`)).then(r => r.data),
  approveIR:      (id, body) => api.post(wsUrl(`/incident-responses/${id}/approve`), body).then(r => r.data),
  cancelIR:       (id) => api.post(wsUrl(`/incident-responses/${id}/cancel`)).then(r => r.data),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_BADGE = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low:      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const STATUS_BADGE = {
  open:             'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  contained:        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  dismissed:        'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  pending_approval: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  approved:         'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  running:          'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  completed:        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  failed:           'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancelled:        'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

const SOURCE_LABEL = {
  defender_alerts: 'Defender for Cloud',
  entra_risk:      'Entra ID Risk',
  entra_signin:    'Entra Sign-in',
  m365_incidents:  'M365 Defender',
  azure_activity:  'Azure Activity',
};

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';
const fmtRelative = (iso) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
};

const TABS = [
  { id: 'events',    label: 'Eventos',     icon: ShieldAlert },
  { id: 'ir',        label: 'Resposta IR', icon: Zap },
  { id: 'playbooks', label: 'Playbooks',   icon: ListChecks },
  { id: 'audit',     label: 'Histórico',   icon: History },
  { id: 'settings',  label: 'Config',      icon: Settings },
];

// ── Events Tab ────────────────────────────────────────────────────────────────

function EventsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [severity, setSeverity] = useState('');
  const [selected, setSelected] = useState(null);

  const evQ = useQuery({
    queryKey: ['sec-events', severity],
    queryFn: () => secApi.getEvents({ severity: severity || undefined, page_size: 50 }),
    refetchInterval: 30000,
  });

  const evDetailQ = useQuery({
    queryKey: ['sec-event', selected],
    queryFn: () => secApi.getEvent(selected),
    enabled: !!selected,
  });

  const dismissMut = useMutation({
    mutationFn: (id) => secApi.dismissEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sec-events'] });
      setSelected(null);
      toast('Evento descartado.', 'success');
    },
  });

  const scanMut = useMutation({
    mutationFn: secApi.triggerScan,
    onSuccess: () => toast('Scan iniciado em background.', 'info'),
  });

  const events = evQ.data?.items || [];

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2 flex-wrap">
            {['', 'critical', 'high', 'medium', 'low'].map(s => (
              <button key={s} onClick={() => setSeverity(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                  ${severity === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}>
                {s || 'Todos'}
              </button>
            ))}
          </div>
          <button onClick={() => scanMut.mutate()} disabled={scanMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
            {scanMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Scan agora
          </button>
        </div>

        {evQ.isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <ShieldCheck size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum evento de segurança detectado</p>
            <p className="text-sm mt-1">O próximo scan automático acontece em até 5 min</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map(ev => (
              <button key={ev.id} onClick={() => setSelected(ev.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all
                  ${selected === ev.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'
                  }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[ev.severity] || SEVERITY_BADGE.medium}`}>
                        {ev.severity?.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {SOURCE_LABEL[ev.source] || ev.source}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE[ev.status] || ''}`}>
                        {ev.status}
                      </span>
                    </div>
                    <p className="font-medium text-sm mt-1 truncate text-gray-900 dark:text-gray-100">{ev.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtRelative(ev.detected_at || ev.created_at)}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="w-80 shrink-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
          {evDetailQ.isLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ) : evDetailQ.data ? (
            <>
              <div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[evDetailQ.data.severity] || ''}`}>
                  {evDetailQ.data.severity?.toUpperCase()}
                </span>
                <h3 className="font-semibold text-sm mt-2 text-gray-900 dark:text-gray-100">{evDetailQ.data.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {SOURCE_LABEL[evDetailQ.data.source] || evDetailQ.data.source} · {fmtDate(evDetailQ.data.detected_at)}
                </p>
              </div>

              {evDetailQ.data.entity_id && (
                <div className="text-xs bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                  <p className="text-gray-500 dark:text-gray-400 uppercase font-medium text-[10px]">Entidade</p>
                  <p className="font-mono text-gray-700 dark:text-gray-200 break-all">{evDetailQ.data.entity_id}</p>
                  <p className="text-gray-400">{evDetailQ.data.entity_type}</p>
                </div>
              )}

              {evDetailQ.data.actions?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Ações executadas</p>
                  <div className="space-y-1">
                    {evDetailQ.data.actions.map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-xs">
                        {a.error_message
                          ? <XCircle size={12} className="text-red-500 shrink-0" />
                          : <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                        }
                        <span className="text-gray-700 dark:text-gray-300">{a.action_type}</span>
                        {a.auto_executed && (
                          <span className="text-[10px] bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300 px-1 rounded">auto</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {evDetailQ.data.status === 'open' && (
                <button onClick={() => dismissMut.mutate(selected)} disabled={dismissMut.isPending}
                  className="w-full py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
                  Descartar evento
                </button>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Incident Response Tab ─────────────────────────────────────────────────────

function IncidentResponseTab({ isMaster }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIR, setSelectedIR] = useState(null);

  const irQ = useQuery({
    queryKey: ['ir-list'],
    queryFn: () => secApi.getIRList({ page_size: 50 }),
    refetchInterval: 10000,
  });

  const irDetailQ = useQuery({
    queryKey: ['ir-detail', selectedIR],
    queryFn: () => secApi.getIR(selectedIR),
    enabled: !!selectedIR,
    refetchInterval: (query) => {
      if (query.state.data?.status === 'running') return 3000;
      return false;
    },
  });

  const approveMut = useMutation({
    mutationFn: (id) => secApi.approveIR(id, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ir-list'] });
      qc.invalidateQueries({ queryKey: ['ir-detail', selectedIR] });
      toast('Execução aprovada e iniciada.', 'success');
    },
    onError: (e) => toast(e.response?.data?.detail || 'Falha na aprovação.', 'error'),
  });

  const cancelMut = useMutation({
    mutationFn: (id) => secApi.cancelIR(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ir-list'] });
      qc.invalidateQueries({ queryKey: ['ir-detail', selectedIR] });
      toast('Resposta cancelada.', 'info');
    },
  });

  const irs = irQ.data?.items || [];

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Respostas a Incidentes</h3>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors">
            <Plus size={12} />
            Nova resposta
          </button>
        </div>

        {irs.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <ShieldOff size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma resposta a incidente</p>
            <p className="text-sm mt-1">Crie uma quando detectar comprometimento</p>
          </div>
        ) : (
          <div className="space-y-2">
            {irs.map(ir => (
              <button key={ir.id} onClick={() => setSelectedIR(ir.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all
                  ${selectedIR === ir.id
                    ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-red-300'
                  }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[ir.status] || ''}`}>
                        {ir.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {ir.template_type === 'containment_with_suspend' ? 'Contenção + Suspensão' : 'Contenção'}
                      </span>
                    </div>
                    <p className="font-medium text-sm mt-1 truncate text-gray-900 dark:text-gray-100">{ir.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtRelative(ir.created_at)}</p>
                  </div>
                  {ir.status === 'running' && (
                    <Loader2 size={16} className="animate-spin text-purple-500 shrink-0 mt-1" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedIR && irDetailQ.data && (
        <div className="w-96 shrink-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4 overflow-y-auto">
          <div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[irDetailQ.data.status] || ''}`}>
              {irDetailQ.data.status.replace('_', ' ')}
            </span>
            <h3 className="font-semibold mt-2 text-gray-900 dark:text-gray-100">{irDetailQ.data.title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {irDetailQ.data.template_type === 'containment_with_suspend'
                ? 'Template: Contenção + Suspensão de Assinatura'
                : 'Template: Contenção'}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase">Etapas</p>
            <div className="space-y-2">
              {(irDetailQ.data.steps || []).map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5
                    ${step.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/40' :
                      step.status === 'failed' ? 'bg-red-100 text-red-600 dark:bg-red-900/40' :
                      step.status === 'running' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40' :
                      'bg-gray-100 text-gray-400 dark:bg-gray-700'}`}>
                    {step.status === 'completed' ? <CheckCircle2 size={12} /> :
                     step.status === 'failed' ? <XCircle size={12} /> :
                     step.status === 'running' ? <Loader2 size={12} className="animate-spin" /> :
                     <Clock size={12} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{step.label}</p>
                    {step.error && <p className="text-xs text-red-500 mt-0.5 break-all">{step.error}</p>}
                    {step.executed_at && <p className="text-[10px] text-gray-400">{fmtDate(step.executed_at)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(irDetailQ.data.affected_users?.length > 0 || irDetailQ.data.target_subscription_id) && (
            <div className="text-xs bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
              {irDetailQ.data.affected_users?.length > 0 && (
                <div>
                  <p className="text-gray-400 uppercase font-medium text-[10px] mb-1">Usuários afetados</p>
                  {irDetailQ.data.affected_users.map((u, i) => (
                    <p key={i} className="font-mono text-gray-700 dark:text-gray-200 text-[11px]">{u}</p>
                  ))}
                </div>
              )}
              {irDetailQ.data.target_subscription_id && (
                <div>
                  <p className="text-gray-400 uppercase font-medium text-[10px] mb-1">Assinatura alvo</p>
                  <p className="font-mono text-gray-700 dark:text-gray-200 text-[11px] break-all">
                    {irDetailQ.data.target_subscription_id}
                  </p>
                </div>
              )}
            </div>
          )}

          {irDetailQ.data.status === 'pending_approval' && (
            <div className="space-y-2">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle size={12} className="inline mr-1" />
                Esta ação é irreversível. Confirme que entende o impacto antes de aprovar.
              </div>
              {irDetailQ.data.template_type === 'containment_with_suspend' && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 space-y-1">
                  <p className="font-semibold">⚠️ A assinatura será suspensa:</p>
                  <p>• VMs deallocadas — disco temporário perdido</p>
                  <p>• Serviços PaaS interrompidos imediatamente</p>
                  <p>• Reserved Instances continuam sendo cobradas</p>
                  <p>• Tokens OAuth válidos por até 1h após suspensão</p>
                </div>
              )}
              <button onClick={() => approveMut.mutate(selectedIR)} disabled={approveMut.isPending}
                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {approveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Aprovar e Executar
              </button>
              <button onClick={() => cancelMut.mutate(selectedIR)} disabled={cancelMut.isPending}
                className="w-full py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateIRModal
          isMaster={isMaster}
          onClose={() => setShowCreate(false)}
          onCreated={(ir) => { setSelectedIR(ir.id); qc.invalidateQueries({ queryKey: ['ir-list'] }); }}
        />
      )}
    </div>
  );
}

// ── Templates estáticos (definição local — sem chamada de API) ────────────────
const IR_TEMPLATES = [
  {
    type: 'containment',
    name: 'Contenção de Incidente',
    description: 'Revoga acessos suspeitos, bloqueia usuários comprometidos, isola VMs e adiciona tags de quarentena.',
    steps: [
      'Revogar sessões Entra ID',
      'Bloquear contas no Entra ID',
      'Isolar VMs comprometidas',
      'Adicionar tags de quarentena',
    ],
    requiresPartnerCenter: false,
  },
  {
    type: 'containment_with_suspend',
    name: 'Contenção + Suspensão da Assinatura (CSP)',
    description: 'Executa todas as ações de contenção e suspende a assinatura Azure via Partner Center API.',
    steps: [
      'Revogar sessões Entra ID',
      'Bloquear contas no Entra ID',
      'Isolar VMs comprometidas',
      'Adicionar tags de quarentena',
      'Suspender assinatura via Partner Center',
    ],
    requiresPartnerCenter: true,
  },
];

// ── Create IR Modal ───────────────────────────────────────────────────────────

function CreateIRModal({ onClose, onCreated, isMaster }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: '',
    template_type: 'containment',
    affected_users: '',
    target_resource_ids: '',
    target_subscription_id: '',
    target_customer_tenant_id: '',
    notes: '',
  });

  const availableTemplates = IR_TEMPLATES.filter(t => isMaster || t.type !== 'containment_with_suspend');

  const createMut = useMutation({
    mutationFn: (body) => secApi.createIR(body),
    onSuccess: (data) => {
      toast('Resposta a incidente criada. Aguardando aprovação.', 'success');
      onCreated(data);
      onClose();
    },
    onError: (e) => toast(e.response?.data?.detail || 'Falha ao criar.', 'error'),
  });

  const selectedTemplate = availableTemplates.find(t => t.type === form.template_type);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    createMut.mutate({
      title: form.title,
      template_type: form.template_type,
      affected_users: form.affected_users.split('\n').map(s => s.trim()).filter(Boolean),
      target_resource_ids: form.target_resource_ids.split('\n').map(s => s.trim()).filter(Boolean),
      target_subscription_id: form.target_subscription_id || null,
      target_customer_tenant_id: form.target_customer_tenant_id || null,
      notes: form.notes || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nova Resposta a Incidente</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Requer aprovação de admin antes de executar</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Título do incidente *</label>
            <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
              placeholder="Ex: Comprometimento de credenciais - user@contoso.com"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-red-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Template *</label>
            <div className="space-y-2">
              {availableTemplates.map(t => (
                <label key={t.type} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                  ${form.template_type === t.type
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-red-300'
                  }`}>
                  <input type="radio" name="template" value={t.type}
                    checked={form.template_type === t.type}
                    onChange={() => setForm(f => ({...f, template_type: t.type}))}
                    className="mt-0.5 accent-red-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {selectedTemplate && (
            <div className="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1">
              <p className="font-medium text-gray-700 dark:text-gray-200">Steps que serão executados:</p>
              {selectedTemplate.steps?.map((s, i) => (
                <p key={i} className="text-gray-500 dark:text-gray-400">{i + 1}. {typeof s === 'string' ? s : s.label}</p>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Usuários afetados (UPN, um por linha)</label>
            <textarea value={form.affected_users} onChange={e => setForm(f => ({...f, affected_users: e.target.value}))}
              rows={3} placeholder={'user@contoso.com\nadmin@contoso.com'}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono focus:ring-2 focus:ring-red-500 outline-none resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Resource IDs a isolar (um por linha)</label>
            <textarea value={form.target_resource_ids} onChange={e => setForm(f => ({...f, target_resource_ids: e.target.value}))}
              rows={2} placeholder="/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{vm}"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs font-mono focus:ring-2 focus:ring-red-500 outline-none resize-none" />
          </div>

          {form.template_type === 'containment_with_suspend' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Customer Tenant ID (CSP) *</label>
                <input value={form.target_customer_tenant_id}
                  onChange={e => setForm(f => ({...f, target_customer_tenant_id: e.target.value}))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono focus:ring-2 focus:ring-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Subscription ID a suspender *</label>
                <input value={form.target_subscription_id}
                  onChange={e => setForm(f => ({...f, target_subscription_id: e.target.value}))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono focus:ring-2 focus:ring-red-500 outline-none" />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Observações</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              rows={2} placeholder="Descreva o contexto do incidente..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none" />
          </div>

          {selectedTemplate?.warnings?.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-1">
              {selectedTemplate.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-300">{w}</p>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={createMut.isPending || !form.title.trim()}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
              Criar resposta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Playbooks Tab ─────────────────────────────────────────────────────────────

const PB_SOURCES = ['entra_risk','entra_signin','m365_incidents','defender_alerts','azure_activity'];
const PB_ACTIONS = ['notify','revoke_sessions','block_user','isolate_vm','add_quarantine_tag'];

function NewPlaybookForm({ onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: '', description: '', sources: [], severity_min: 'high',
    actions: ['notify'], auto_execute: false, cooldown_minutes: 30, is_active: true,
  });
  const toggle = (field, val) => setForm(f => ({
    ...f, [field]: f[field].includes(val) ? f[field].filter(x => x !== val) : [...f[field], val],
  }));
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-300 dark:border-blue-700 p-4 space-y-3">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Novo Playbook</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Nome (identificador único) *</label>
          <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value.toLowerCase().replace(/\s+/g,'_')}))}
            placeholder="ex: brute_force_detected"
            className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Descrição</label>
          <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))}
            className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Fontes monitoradas</label>
        <div className="flex flex-wrap gap-2">
          {PB_SOURCES.map(s => (
            <label key={s} className={`text-[11px] px-2 py-1 rounded-full border cursor-pointer transition-colors
              ${form.sources.includes(s) ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}>
              <input type="checkbox" className="hidden" checked={form.sources.includes(s)} onChange={() => toggle('sources', s)} />
              {s}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Ações a executar</label>
        <div className="flex flex-wrap gap-2">
          {PB_ACTIONS.map(a => (
            <label key={a} className={`text-[11px] px-2 py-1 rounded-full border cursor-pointer transition-colors
              ${form.actions.includes(a) ? 'bg-red-100 dark:bg-red-900/40 border-red-400 text-red-700 dark:text-red-300' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}>
              <input type="checkbox" className="hidden" checked={form.actions.includes(a)} onChange={() => toggle('actions', a)} />
              {a}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Severidade mínima</label>
          <select value={form.severity_min} onChange={e => setForm(f => ({...f, severity_min: e.target.value}))}
            className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            {['low','medium','high','critical'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Cooldown (min)</label>
          <input type="number" value={form.cooldown_minutes}
            onChange={e => setForm(f => ({...f, cooldown_minutes: parseInt(e.target.value) || 0}))}
            className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 cursor-pointer">
          <input type="checkbox" checked={form.auto_execute} onChange={e => setForm(f => ({...f, auto_execute: e.target.checked}))} className="accent-red-600" />
          Auto-executar (⚠️ use com cuidado)
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
          Cancelar
        </button>
        <button onClick={() => form.name.trim() && onSave(form)} disabled={saving || !form.name.trim()}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1">
          {saving && <Loader2 size={10} className="animate-spin" />} Criar playbook
        </button>
      </div>
    </div>
  );
}

function PlaybooksTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const pbQ = useQuery({
    queryKey: ['sec-playbooks'],
    queryFn: secApi.getPlaybooks,
  });

  const updateMut = useMutation({
    mutationFn: ({ name, body }) => secApi.updatePlaybook(name, body),
    onSuccess: (_, { isNew }) => {
      qc.invalidateQueries({ queryKey: ['sec-playbooks'] });
      setEditing(null);
      setCreating(false);
      toast(isNew ? 'Playbook criado.' : 'Playbook atualizado.', 'success');
    },
  });

  const playbooks = pbQ.data?.playbooks || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Playbooks definem quais eventos disparam alertas e ações. Por padrão, nenhum executa automaticamente.
        </p>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shrink-0 ml-4">
            <Plus size={13} /> Novo playbook
          </button>
        )}
      </div>
      {creating && (
        <div className="mb-4">
          <NewPlaybookForm
            onSave={(body) => updateMut.mutate({ name: body.name, body, isNew: true })}
            onCancel={() => setCreating(false)}
            saving={updateMut.isPending} />
        </div>
      )}
      {pbQ.isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {playbooks.map(pb => (
            <div key={pb.name} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              {editing === pb.name ? (
                <PlaybookEditForm pb={pb}
                  onSave={(body) => updateMut.mutate({ name: pb.name, body })}
                  onCancel={() => setEditing(null)}
                  saving={updateMut.isPending} />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{pb.name}</h4>
                      {pb.is_default && (
                        <span className="text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded">padrão</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SEVERITY_BADGE[pb.severity_min] || ''}`}>
                        min: {pb.severity_min}
                      </span>
                      {!pb.is_active && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded">inativo</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{pb.description}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {(pb.actions || []).map(a => (
                        <span key={a} className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{a}</span>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Auto-execute: {pb.auto_execute ? 'Sim' : 'Não'} · Cooldown: {pb.cooldown_minutes}min
                    </p>
                  </div>
                  <button onClick={() => setEditing(pb.name)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    Editar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaybookEditForm({ pb, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    severity_min: pb.severity_min || 'high',
    auto_execute: pb.auto_execute || false,
    cooldown_minutes: pb.cooldown_minutes ?? 30,
    is_active: pb.is_active ?? true,
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Severidade mínima</label>
          <select value={form.severity_min} onChange={e => setForm(f => ({...f, severity_min: e.target.value}))}
            className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            {['low','medium','high','critical'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Cooldown (min)</label>
          <input type="number" value={form.cooldown_minutes}
            onChange={e => setForm(f => ({...f, cooldown_minutes: parseInt(e.target.value) || 0}))}
            className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
          <input type="checkbox" checked={form.auto_execute}
            onChange={e => setForm(f => ({...f, auto_execute: e.target.checked}))}
            className="accent-red-600" />
          Auto-executar (⚠️ use com cuidado)
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
          <input type="checkbox" checked={form.is_active}
            onChange={e => setForm(f => ({...f, is_active: e.target.checked}))}
            className="accent-blue-600" />
          Ativo
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
          Cancelar
        </button>
        <button onClick={() => onSave(form)} disabled={saving}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1">
          {saving && <Loader2 size={10} className="animate-spin" />} Salvar
        </button>
      </div>
    </div>
  );
}

// ── Audit Tab ─────────────────────────────────────────────────────────────────

function AuditTab() {
  const auditQ = useQuery({
    queryKey: ['sec-audit'],
    queryFn: () => secApi.getAudit({ page_size: 50 }),
  });

  const actions = auditQ.data?.items || [];

  return (
    <div>
      {auditQ.isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />)}
        </div>
      ) : actions.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <History size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhuma ação registrada ainda</p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map(a => (
            <div key={a.id} className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
                ${a.error_message ? 'bg-red-100 text-red-600 dark:bg-red-900/40' : 'bg-green-100 text-green-600 dark:bg-green-900/40'}`}>
                {a.error_message ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.action_type}</span>
                  {a.playbook_name && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">via {a.playbook_name}</span>
                  )}
                  {a.auto_executed && (
                    <span className="text-[10px] bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 rounded">auto</span>
                  )}
                </div>
                {a.error_message && (
                  <p className="text-xs text-red-500 mt-0.5 truncate">{a.error_message}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{fmtDate(a.executed_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ isMaster }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showPCForm, setShowPCForm] = useState(false);
  const [pcForm, setPcForm] = useState({ partner_tenant_id: '', client_id: '', client_secret: '', gdap_security_group_id: '' });

  const settingsQ = useQuery({ queryKey: ['sec-settings'], queryFn: secApi.getSettings });
  const pcQ = useQuery({ queryKey: ['pc-config'], queryFn: secApi.getPCConfig });

  const settingsMut = useMutation({
    mutationFn: secApi.updateSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sec-settings'] }); toast('Configuração salva.', 'success'); },
  });

  const pcMut = useMutation({
    mutationFn: secApi.savePCConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pc-config'] });
      setShowPCForm(false);
      toast('Partner Center configurado.', 'success');
    },
    onError: (e) => toast(e.response?.data?.detail || 'Falha ao salvar.', 'error'),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Scan automation */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Scan Automático</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Coleta eventos de segurança do Azure Defender, Entra ID e M365 a cada 5 minutos.
        </p>
        {settingsQ.isLoading ? (
          <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Status:{' '}
                <span className={settingsQ.data?.enabled ? 'text-green-600' : 'text-gray-400'}>
                  {settingsQ.data?.enabled ? '● Ativo' : '○ Inativo'}
                </span>
              </p>
              {settingsQ.data?.next_run && (
                <p className="text-xs text-gray-400 mt-0.5">Próximo scan: {fmtDate(settingsQ.data.next_run)}</p>
              )}
            </div>
            <button onClick={() => settingsMut.mutate({ enabled: !settingsQ.data?.enabled })}
              disabled={settingsMut.isPending}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50
                ${settingsQ.data?.enabled
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}>
              {settingsQ.data?.enabled ? 'Desativar' : 'Ativar scan'}
            </button>
          </div>
        )}
      </div>

      {/* Partner Center — visível apenas para org master (CSP/MSP) */}
      {isMaster && <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Building2 size={16} className="text-blue-500" />
              Partner Center (CSP)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Credenciais para gerenciar assinaturas de clientes via Partner Center API.
              O App Registration deve ser cadastrado em "App Management" do Partner Center.
            </p>
          </div>
          {pcQ.data?.configured && !showPCForm && (
            <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded-full font-medium shrink-0">
              ✓ Configurado
            </span>
          )}
        </div>

        {pcQ.data?.configured && !showPCForm ? (
          <div className="space-y-2">
            <div className="text-xs bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
              <p><span className="text-gray-400">Partner Tenant ID:</span> <span className="font-mono text-gray-700 dark:text-gray-200">{pcQ.data.partner_tenant_id}</span></p>
              {pcQ.data.gdap_security_group_id && (
                <p><span className="text-gray-400">Grupo GDAP:</span> <span className="font-mono text-gray-700 dark:text-gray-200">{pcQ.data.gdap_security_group_id}</span></p>
              )}
            </div>
            <button onClick={() => setShowPCForm(true)} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
              Atualizar credenciais
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {[
              { key: 'partner_tenant_id', label: 'Partner Tenant ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
              { key: 'client_id', label: 'Client ID (App Registration)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
              { key: 'client_secret', label: 'Client Secret', placeholder: '••••••••', type: 'password' },
              { key: 'gdap_security_group_id', label: 'GDAP Security Group ID (opcional)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{label}</label>
                <input type={type || 'text'} value={pcForm[key]}
                  onChange={e => setPcForm(f => ({...f, [key]: e.target.value}))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            ))}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <p className="font-semibold">Permissões necessárias:</p>
              <p>• App cadastrado em "Account settings &gt; App management"</p>
              <p>• Usuário com role <strong>Admin Agent</strong> no partner tenant</p>
              <p>• Relação GDAP ativa com os clientes para ações Azure/Entra</p>
            </div>
            <div className="flex gap-2">
              {pcQ.data?.configured && (
                <button onClick={() => setShowPCForm(false)}
                  className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cancelar
                </button>
              )}
              <button onClick={() => pcMut.mutate(pcForm)}
                disabled={pcMut.isPending || !pcForm.partner_tenant_id || !pcForm.client_id || !pcForm.client_secret}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                {pcMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                Salvar e validar
              </button>
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SecurityAutomation() {
  const { currentOrg, orgs } = useOrgWorkspace();
  const { irId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(irId ? 'ir' : 'events');

  const isPro = ['enterprise', 'enterprise_migration'].includes(
    currentOrg?.effective_plan || currentOrg?.plan_tier
  );

  // isMasterUser = true se o usuário pertence a uma org master, independente
  // do workspace que está gerenciando no momento (ex: gerenciando workspace de cliente)
  const isMasterUser = orgs.some(o => o.org_type === 'master');

  if (!isPro) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center pt-24">
        <ShieldAlert size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Security Automation</h2>
        <p className="text-gray-500 dark:text-gray-400">
          Disponível apenas no plano Enterprise. Faça upgrade para acessar detecção automática
          de incidentes, playbooks e resposta a incidentes CSP.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Voltar ao painel"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <ShieldAlert size={20} className="text-red-600 dark:text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Security Automation</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Detecção · Playbooks · Resposta a Incidentes CSP</p>
        </div>
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-5 gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px
              ${activeTab === id
                ? 'border-red-500 text-red-600 dark:text-red-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'events'    && <EventsTab />}
        {activeTab === 'ir'        && <IncidentResponseTab isMaster={isMasterUser} />}
        {activeTab === 'playbooks' && <PlaybooksTab />}
        {activeTab === 'audit'     && <AuditTab />}
        {activeTab === 'settings'  && <SettingsTab isMaster={isMasterUser} />}
      </div>
    </div>
  );
}
