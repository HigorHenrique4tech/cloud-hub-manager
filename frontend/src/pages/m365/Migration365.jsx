import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft, Plus, Trash2, Play, Pause, RefreshCw, X,
  CheckCircle, XCircle, Clock, AlertCircle, ChevronRight,
  Mail, Users, BarChart3, FileText, ArrowLeft, Upload,
  Server, Building2, Wifi, Search, ShieldCheck, GitMerge,
  MoreVertical, Download, CalendarClock, HardDrive, Globe,
  Lock, ShoppingCart, CreditCard,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import api, { wsUrl } from '../../services/api';

// ── Service helpers ───────────────────────────────────────────────────────────

const migrationApi = {
  listProjects:     ()                 => api.get(wsUrl('/migration/projects')).then(r => r.data),
  createProject:    (data)             => api.post(wsUrl('/migration/projects'), data).then(r => r.data),
  getProject:       (id)               => api.get(wsUrl(`/migration/projects/${id}`)).then(r => r.data),
  getStats:         (id)               => api.get(wsUrl(`/migration/projects/${id}/stats`)).then(r => r.data),
  deleteProject:    (id)               => api.delete(wsUrl(`/migration/projects/${id}`)),
  setStatus:        (id, status)       => api.post(wsUrl(`/migration/projects/${id}/status`), { status }).then(r => r.data),
  verify:           (id)               => api.post(wsUrl(`/migration/projects/${id}/verify`)).then(r => r.data),
  deltaSync:        (id)               => api.post(wsUrl(`/migration/projects/${id}/delta`)).then(r => r.data),
  retryFailed:      (id)               => api.post(wsUrl(`/migration/projects/${id}/retry-failed`)).then(r => r.data),
  pauseMailbox:     (pid, mid)         => api.post(wsUrl(`/migration/projects/${pid}/mailboxes/${mid}/pause`)).then(r => r.data),
  retryMailbox:     (pid, mid)         => api.post(wsUrl(`/migration/projects/${pid}/mailboxes/${mid}/retry`)).then(r => r.data),
  listMailboxes:    (id)               => api.get(wsUrl(`/migration/projects/${id}/mailboxes`)).then(r => r.data),
  addMailboxes:     (id, data)         => api.post(wsUrl(`/migration/projects/${id}/mailboxes`), data).then(r => r.data),
  deleteMailbox:    (pid, mid)         => api.delete(wsUrl(`/migration/projects/${pid}/mailboxes/${mid}`)),
  listLogs:         (id)               => api.get(wsUrl(`/migration/projects/${id}/logs`)).then(r => r.data),
  getWorkerHealth:  ()                 => api.get(wsUrl('/migration/worker-health')).then(r => r.data),
  exportReport:     (id, format)       => wsUrl(`/migration/projects/${id}/report?format=${format}`),
  scheduleProject:  (id, scheduled_at) => api.post(wsUrl(`/migration/projects/${id}/schedule`), { scheduled_at }).then(r => r.data),
  cancelSchedule:   (id)               => api.delete(wsUrl(`/migration/projects/${id}/schedule`)),
  testConnection:   (migration_type, source_config) =>
                      api.post(wsUrl('/migration/test-connection'), { migration_type, source_config }).then(r => r.data),
  resolveSpSite:    (project_id, url, side = 'source') =>
                      api.post(wsUrl('/migration/resolve-sharepoint-site'), { project_id, url, side }).then(r => r.data),
  getMailboxLedger: (pid, mid)      => api.get(wsUrl(`/migration/projects/${pid}/mailboxes/${mid}/ledger`)).then(r => r.data),
  getLicenseSummary: ()             => api.get(wsUrl('/migration/license-summary')).then(r => r.data),
  requestLicenses:  (data)         => api.post(wsUrl('/migration/licenses/request'), data).then(r => r.data),
  getLicenseHistory: ()             => api.get(wsUrl('/migration/licenses/history')).then(r => r.data),
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MIGRATION_TYPES = [
  { id: 'tenant_to_tenant', label: 'M365 Tenant → Tenant', icon: Building2, desc: 'Migração completa de e-mail, OneDrive e SharePoint entre tenants Microsoft 365', color: 'text-purple-500', category: 'email' },
];

const SOURCE_FIELDS = {
  tenant_to_tenant: [
    { key: 'tenant_id',         label: 'Tenant ID de origem',       placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'client_id',         label: 'Client ID (App Registration)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'client_secret',     label: 'Client Secret',             placeholder: '••••••••', type: 'password' },
  ],
};

const STATUS_CONFIG = {
  draft:     { label: 'Rascunho',   color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', dot: 'bg-gray-400' },
  ready:     { label: 'Pronto',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-500' },
  running:   { label: 'Em execução',color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', dot: 'bg-green-500 animate-pulse' },
  paused:    { label: 'Pausado',    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', dot: 'bg-yellow-500' },
  completed: { label: 'Concluído',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-500' },
  failed:    { label: 'Com erros',  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-500' },
};

const TYPE_LABELS = {
  tenant_to_tenant: 'M365 Tenant → Tenant',
};

const LOG_LEVEL_CONFIG = {
  info:    { color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
  warning: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  error:   { color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-50 dark:bg-red-900/20' },
};

// ── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// ── Progress bar ──────────────────────────────────────────────────────────────

const fmtEta = (seconds) => {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return '< 1 min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `~${h}h ${m > 0 ? `${m}min` : ''}`.trim();
  return `~${m}min`;
};

const ProgressBar = ({ value, className = '' }) => (
  <div className={`h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${className}`}>
    <div
      className="h-full bg-blue-500 rounded-full transition-all duration-500"
      style={{ width: `${Math.min(100, value || 0)}%` }}
    />
  </div>
);


// ── Wizard ────────────────────────────────────────────────────────────────────

const WIZARD_STEPS = ['Tipo', 'Origem', 'Destino', 'Detalhes', 'Revisão'];

const CreateProjectWizard = ({ onClose, onCreated }) => {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    description: '',
    migration_type: 'tenant_to_tenant',
    source_config: {},
    destination_config: {},
    strip_mip_labels: false,
    preserve_sp_permissions: false,
  });
  const [srcFields, setSrcFields] = useState({});
  const [dstFields, setDstFields] = useState({});
  const [testResult, setTestResult] = useState(null);

  const testMut = useMutation({
    mutationFn: () => migrationApi.testConnection(form.migration_type, {
      ...srcFields,
      label: srcFields.domain || srcFields.host || srcFields.tenant_id || '',
    }),
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestResult({ ok: false, message: err?.response?.data?.detail || 'Erro ao testar conexão.' }),
  });

  const createMut = useMutation({
    mutationFn: () => migrationApi.createProject({
      name: form.name,
      description: form.description || null,
      migration_type: form.migration_type,
      source_config: { ...srcFields, label: srcFields.domain || srcFields.host || srcFields.tenant_id || '' },
      destination_config: dstFields,
      strip_mip_labels: form.strip_mip_labels,
      preserve_sp_permissions: form.preserve_sp_permissions,
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['migration-projects'] });
      onCreated(data.id);
    },
  });

  const canNext = () => {
    if (step === 0) return !!form.migration_type;
    if (step === 1) {
      const fields = SOURCE_FIELDS[form.migration_type] || [];
      return fields.filter(f => f.type !== 'checkbox' && !f.placeholder?.includes('opcional'))
                   .every(f => srcFields[f.key]);
    }
    if (step === 2) return true; // destination is optional
    if (step === 3) return !!form.name;
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Novo Projeto de Migração</p>
              <p className="text-xs text-gray-500">Passo {step + 1} de {WIZARD_STEPS.length}: {WIZARD_STEPS[step]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-6 pt-4">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-all ${
                i < step  ? 'bg-blue-500 border-blue-500 text-white' :
                i === step ? 'border-blue-500 text-blue-600 dark:text-blue-400' :
                'border-gray-300 dark:border-gray-600 text-gray-400'
              }`}>
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`ml-1.5 text-xs font-medium hidden sm:block ${i === step ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                {s}
              </span>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 rounded ${i < step ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step 0: Type */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Tipo de migração suportado nesta versão.
              </p>
              <div className="flex items-center gap-4 p-5 rounded-xl border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/10">
                <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Building2 className="w-6 h-6 text-purple-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">M365 Tenant → Tenant</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Migração completa de e-mail, OneDrive e SharePoint entre tenants Microsoft 365</p>
                </div>
                <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Outros tipos de migração (IMAP, Google Workspace, OneDrive, SharePoint, Teams Chat) serão disponibilizados em breve.
              </p>
            </div>
          )}

          {/* Step 1: Source */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Configure as credenciais do <strong>ambiente de origem</strong> ({TYPE_LABELS[form.migration_type]}).
              </p>
              {(SOURCE_FIELDS[form.migration_type] || []).map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{field.label}</label>
                  {field.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!srcFields[field.key]}
                        onChange={e => { setSrcFields(p => ({ ...p, [field.key]: e.target.checked })); setTestResult(null); }}
                        className="w-4 h-4 rounded border-gray-300 text-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Ativado</span>
                    </label>
                  ) : field.multiline ? (
                    <textarea
                      rows={5}
                      value={srcFields[field.key] || ''}
                      onChange={e => { setSrcFields(p => ({ ...p, [field.key]: e.target.value })); setTestResult(null); }}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
                    />
                  ) : (
                    <input
                      type={field.type || 'text'}
                      value={srcFields[field.key] || ''}
                      onChange={e => { setSrcFields(p => ({ ...p, [field.key]: e.target.value })); setTestResult(null); }}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              ))}

              {/* Test connection */}
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => testMut.mutate()}
                  disabled={!canNext() || testMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                >
                  {testMut.isPending
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Testando...</>
                    : <><Wifi className="w-4 h-4" /> Testar conexão</>}
                </button>
                {testResult && (
                  <div className={`mt-2 flex items-start gap-2 p-3 rounded-lg border text-xs ${
                    testResult.ok
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  }`}>
                    {testResult.ok
                      ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      : <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                    {testResult.message}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  As credenciais são armazenadas de forma segura e usadas apenas durante a migração.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Destination */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Configure o <strong>destino Microsoft 365</strong>. Deixe vazio para usar as credenciais do workspace.
              </p>
              {[
                { key: 'tenant_id',    label: 'Tenant ID de destino',     placeholder: 'Deixe vazio para usar o tenant do workspace' },
                { key: 'client_id',    label: 'Client ID (opcional)',      placeholder: 'Deixe vazio para usar as credenciais do workspace' },
                { key: 'client_secret',label: 'Client Secret (opcional)',  placeholder: '••••••••', type: 'password' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{field.label}</label>
                  <input
                    type={field.type || 'text'}
                    value={dstFields[field.key] || ''}
                    onChange={e => setDstFields(p => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Se os campos acima ficarem vazios, a migração usará as credenciais M365 já configuradas no workspace.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Project details */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Dê um nome e uma descrição ao projeto de migração.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome do projeto <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Migração Google → M365 Q2 2026"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descrição (opcional)</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Contexto, prazo, departamentos envolvidos..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* MIP label stripping */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={form.strip_mip_labels}
                      onChange={e => setForm(p => ({ ...p, strip_mip_labels: e.target.checked }))}
                      className="sr-only"
                    />
                    <div
                      onClick={() => setForm(p => ({ ...p, strip_mip_labels: !p.strip_mip_labels }))}
                      className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${form.strip_mip_labels ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`block w-4 h-4 mt-0.5 rounded-full bg-white shadow transition-transform ${form.strip_mip_labels ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-purple-500" />
                      Remover labels de proteção MIP (Microsoft Purview)
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Remove os headers <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-purple-600 dark:text-purple-400">msip_labels</code> de cada e-mail antes de importar no destino.
                      Útil quando o tenant destino tem políticas de labels diferentes — evita erros de "label órfã".
                    </p>
                  </div>
                </label>
              </div>

              {/* SharePoint permissions */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={form.preserve_sp_permissions}
                      onChange={e => setForm(p => ({ ...p, preserve_sp_permissions: e.target.checked }))}
                      className="sr-only"
                    />
                    <div
                      onClick={() => setForm(p => ({ ...p, preserve_sp_permissions: !p.preserve_sp_permissions }))}
                      className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${form.preserve_sp_permissions ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`block w-4 h-4 mt-0.5 rounded-full bg-white shadow transition-transform ${form.preserve_sp_permissions ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                      Preservar permissões de pastas e arquivos (SharePoint)
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Copia permissões únicas (não herdadas) de cada item SharePoint para o destino.
                      Os usuários precisam existir no tenant destino com o mesmo UPN.
                      Aumenta o tempo de migração (~1 chamada de API extra por arquivo com permissão customizada).
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Revise as informações antes de criar o projeto.</p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {[
                  { label: 'Nome', value: form.name },
                  { label: 'Tipo', value: TYPE_LABELS[form.migration_type] },
                  { label: 'Origem', value: srcFields.domain || srcFields.host || srcFields.tenant_id || '—' },
                  { label: 'Destino', value: dstFields.tenant_id || 'Tenant do workspace' },
                  { label: 'Descrição', value: form.description || '—' },
                  { label: 'Labels MIP', value: form.strip_mip_labels ? 'Remover durante migração' : 'Preservar (padrão)', highlight: form.strip_mip_labels },
                  { label: 'Permissões SP', value: form.preserve_sp_permissions ? 'Copiar permissões únicas' : 'Não copiar (padrão)', highlight: form.preserve_sp_permissions },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="flex items-start gap-4 px-4 py-3 border-b last:border-0 border-gray-100 dark:border-gray-800">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-28 flex-shrink-0">{label}</span>
                    <span className={`text-sm font-medium ${highlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  O projeto será criado em status <strong>Rascunho</strong>. Você poderá adicionar caixas de correio e iniciar a migração quando estiver pronto.
                </p>
              </div>
              {createMut.isError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {createMut.error?.response?.data?.detail || 'Erro ao criar projeto.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {step > 0
            ? <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                Voltar
              </button>
            : <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                Cancelar
              </button>
          }
          {step < WIZARD_STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40"
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40"
            >
              {createMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar Projeto
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Add Mailboxes Modal ───────────────────────────────────────────────────────

const OBJECT_TYPE_CONFIG = {
  email: {
    title: 'Adicionar Caixas de Correio',
    srcLabel: 'E-mail de origem',
    dstLabel: 'E-mail de destino',
    hint: 'origem@tenant.com, destino@tenant.com, Nome',
    textareaPlaceholder: 'joao@origem.com, joao@empresa.com, João Silva\nmaria@origem.com, maria@empresa.com\npedro@origem.com',
    csvHint: <>Colunas: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">source_email</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">destination_email</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">display_name</code></>,
    validate: (v) => v.includes('@'),
    invalidMsg: 'Nenhum e-mail válido encontrado.',
    itemLabel: 'caixa(s)',
  },
  onedrive: {
    title: 'Adicionar Contas OneDrive',
    srcLabel: 'E-mail do usuário (origem)',
    dstLabel: 'E-mail do usuário (destino)',
    hint: 'usuario@origem.com, usuario@destino.com, Nome',
    textareaPlaceholder: 'joao@origem.com, joao@empresa.com, João Silva\nmaria@origem.com, maria@empresa.com',
    csvHint: <>Colunas: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">source_email</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">destination_email</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">display_name</code></>,
    validate: (v) => v.includes('@'),
    invalidMsg: 'Nenhum e-mail válido encontrado.',
    itemLabel: 'conta(s)',
  },
  sharepoint: {
    title: 'Adicionar Sites SharePoint',
    srcLabel: 'URL do site de origem',
    dstLabel: 'URL do site de destino',
    hint: 'https://origem.sharepoint.com/sites/nome, https://destino.sharepoint.com/sites/nome, Nome do Site',
    textareaPlaceholder: 'https://origem.sharepoint.com/sites/Marketing, https://destino.sharepoint.com/sites/Marketing, Marketing\nhttps://origem.sharepoint.com/sites/TI, https://destino.sharepoint.com/sites/TI, TI',
    csvHint: <>Colunas: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">source_url</code> (ou source_email), <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">destination_url</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">display_name</code></>,
    validate: (v) => v.startsWith('https://') || v.startsWith('http://'),
    invalidMsg: 'Nenhuma URL de site SharePoint válida encontrada. Use o formato https://tenant.sharepoint.com/sites/nome',
    itemLabel: 'site(s)',
  },
  m365_group: {
    title: 'Adicionar Grupos M365',
    srcLabel: 'E-mail do grupo (origem)',
    dstLabel: 'E-mail do grupo (destino)',
    hint: 'grupo@origem.com, grupo@destino.com, Nome do Grupo',
    textareaPlaceholder: 'marketing@origem.com, marketing@empresa.com, Marketing\nti@origem.com, ti@empresa.com, TI',
    csvHint: <>Colunas: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">source_email</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">destination_email</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">display_name</code></>,
    validate: (v) => v.includes('@'),
    invalidMsg: 'Nenhum e-mail de grupo válido encontrado.',
    itemLabel: 'grupo(s)',
  },
};

const AddMailboxesModal = ({ projectId, objectType = 'email', onClose }) => {
  const cfg = OBJECT_TYPE_CONFIG[objectType] || OBJECT_TYPE_CONFIG.email;
  const { title: modalTitle, srcLabel, dstLabel, hint, textareaPlaceholder, csvHint, validate, invalidMsg, itemLabel } = cfg;
  const qc = useQueryClient();
  const [tab, setTab] = useState('text');  // 'text' | 'csv'

  // ── Aba texto ─────────────────────────────────────────────────────────────
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState([]);
  const [parseError, setParseError] = useState('');

  const parseText = () => {
    setParseError('');
    const lines = input.trim().split('\n').filter(l => l.trim());
    const entries = lines.map(line => {
      // SharePoint URLs have commas only in edge cases — split on first 2 commas max
      const idx1 = line.indexOf(',');
      const idx2 = idx1 >= 0 ? line.indexOf(',', idx1 + 1) : -1;
      const src  = (idx1 >= 0 ? line.slice(0, idx1) : line).trim();
      const dst  = (idx1 >= 0 && idx2 >= 0 ? line.slice(idx1 + 1, idx2) : idx1 >= 0 ? line.slice(idx1 + 1) : '').trim();
      const name = (idx2 >= 0 ? line.slice(idx2 + 1) : '').trim();
      return { source_email: src, destination_email: dst || '', display_name: name || '' };
    }).filter(e => e.source_email && validate(e.source_email));
    if (!entries.length) { setParseError(invalidMsg); return; }
    setParsed(entries);
  };

  // ── Aba CSV ───────────────────────────────────────────────────────────────
  const [csvPreview, setCsvPreview] = useState(null);  // {valid, invalid, total_rows}
  const [csvDragging, setCsvDragging] = useState(false);

  const csvMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(wsUrl(`/migration/projects/${projectId}/mailboxes/import-csv`), fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    onSuccess: (data) => setCsvPreview(data),
  });

  const handleCsvFile = (file) => {
    if (!file || !file.name.endsWith('.csv')) return;
    setCsvPreview(null);
    csvMut.mutate(file);
  };

  // ── Adicionar (comum às duas abas) ────────────────────────────────────────
  const entries = tab === 'text'
    ? parsed
    : (csvPreview?.valid || []);

  const addMut = useMutation({
    mutationFn: () => migrationApi.addMailboxes(projectId, {
      mailboxes: entries.map(e => ({ ...e, object_type: objectType })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migration-mailboxes', projectId] });
      qc.invalidateQueries({ queryKey: ['migration-project', projectId] });
      qc.invalidateQueries({ queryKey: ['migration-projects'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{modalTitle}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-5">
          {[{ id: 'text', label: 'Colar texto' }, { id: 'csv', label: 'Upload CSV' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Aba: Colar texto */}
          {tab === 'text' && (
            <>
              <p className="text-xs text-gray-500">Uma por linha: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-[11px]">{hint}</code></p>
              <textarea
                rows={8}
                value={input}
                onChange={e => { setInput(e.target.value); setParsed([]); }}
                placeholder={textareaPlaceholder}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {parseError && <p className="text-xs text-red-500">{parseError}</p>}
              {parsed.length > 0 && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-xs text-green-700 dark:text-green-300 font-medium">
                    {parsed.length} {itemLabel} pronta(s) para adicionar
                  </p>
                </div>
              )}
            </>
          )}

          {/* Aba: Upload CSV */}
          {tab === 'csv' && (
            <>
              <p className="text-xs text-gray-500">{csvHint}</p>

              {/* Dropzone */}
              <label
                className={`flex flex-col items-center justify-center gap-3 h-36 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                  csvDragging
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
                onDragOver={e => { e.preventDefault(); setCsvDragging(true); }}
                onDragLeave={() => setCsvDragging(false)}
                onDrop={e => { e.preventDefault(); setCsvDragging(false); handleCsvFile(e.dataTransfer.files[0]); }}
              >
                <input type="file" accept=".csv" className="hidden"
                  onChange={e => handleCsvFile(e.target.files[0])} />
                {csvMut.isPending
                  ? <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                  : <Upload className="w-6 h-6 text-gray-400" />
                }
                <p className="text-sm text-gray-500">
                  {csvMut.isPending ? 'Analisando...' : 'Arraste um .csv ou clique para selecionar'}
                </p>
              </label>

              {/* Preview */}
              {csvPreview && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> {csvPreview.valid.length} válidos
                    </span>
                    {csvPreview.invalid.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                        <XCircle className="w-3.5 h-3.5" /> {csvPreview.invalid.length} ignorados
                      </span>
                    )}
                  </div>

                  {csvPreview.valid.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
                            <th className="px-3 py-2 font-medium">{srcLabel}</th>
                            <th className="px-3 py-2 font-medium">{dstLabel}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {csvPreview.valid.slice(0, 50).map((e, i) => (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{e.source_email}</td>
                              <td className="px-3 py-1.5 text-gray-500">{e.destination_email || '—'}</td>
                            </tr>
                          ))}
                          {csvPreview.valid.length > 50 && (
                            <tr><td colSpan={2} className="px-3 py-2 text-gray-400 text-center">+{csvPreview.valid.length - 50} mais...</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {csvPreview.invalid.length > 0 && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Linhas ignoradas:</p>
                      {csvPreview.invalid.slice(0, 5).map((e, i) => (
                        <p key={i} className="text-xs text-red-500">Linha {e.line}: {e.reason} {e.value ? `(${e.value})` : ''}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {csvMut.isError && (
                <p className="text-xs text-red-500">{csvMut.error?.response?.data?.detail || 'Erro ao analisar CSV.'}</p>
              )}
            </>
          )}

          {addMut.isError && (
            <p className="text-xs text-red-500">{addMut.error?.response?.data?.detail || 'Erro ao adicionar.'}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancelar
          </button>
          {tab === 'text' && !parsed.length && (
            <button onClick={parseText} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium rounded-lg">
              <Search className="w-4 h-4" /> Analisar
            </button>
          )}
          {entries.length > 0 && (
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40">
              {addMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Importar {entries.length} {itemLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Mailbox Ledger Drawer ─────────────────────────────────────────────────────

const MailboxLedgerDrawer = ({ projectId, mb, onClose }) => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const PER_PAGE = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['mb-ledger', projectId, mb.id],
    queryFn: () => migrationApi.getMailboxLedger(projectId, mb.id),
    staleTime: 60_000,
  });

  const entries = data?.entries || [];
  const filtered = search
    ? entries.filter(e =>
        (e.uid || e.message_id || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.folder || '').toLowerCase().includes(search.toLowerCase())
      )
    : entries;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const copied   = entries.filter(e => e.status === 'copied' || e.status === 'verified').length;
  const verified = entries.filter(e => e.status === 'verified').length;
  const failed   = entries.filter(e => e.status === 'failed').length;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col h-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Ledger — {mb.source_email}</p>
            <p className="text-xs text-gray-400 mt-0.5">{entries.length} mensagens auditadas</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          {[
            { label: 'Total',      value: entries.length, color: 'text-gray-700 dark:text-gray-300' },
            { label: 'Copiadas',   value: copied,         color: 'text-green-600 dark:text-green-400' },
            { label: 'Verificadas',value: verified,       color: 'text-cyan-600 dark:text-cyan-400' },
            { label: 'Falhas',     value: failed,         color: 'text-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className={`text-lg font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por pasta ou UID..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-3 p-6">
              <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
              <p className="text-sm text-gray-500">Carregando ledger...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500">Nenhuma entrada encontrada.</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/80 backdrop-blur">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2.5 font-medium">Pasta</th>
                  <th className="px-4 py-2.5 font-medium">UID / Message-ID</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Tamanho</th>
                  <th className="px-4 py-2.5 font-medium">Copiado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {paged.map((entry, i) => {
                  const uid = entry.uid || entry.message_id || '—';
                  return (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 font-mono truncate max-w-[120px]" title={entry.folder}>{entry.folder || '—'}</td>
                      <td className="px-4 py-2 text-gray-500 font-mono truncate max-w-[160px]" title={uid}>
                        {uid.length > 22 ? `${uid.slice(0, 22)}…` : uid}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`font-medium ${
                          entry.status === 'verified' ? 'text-cyan-600 dark:text-cyan-400' :
                          entry.status === 'copied'   ? 'text-green-600 dark:text-green-400' :
                          entry.status === 'failed'   ? 'text-red-500' :
                          'text-gray-500'
                        }`}>
                          {entry.status === 'copied' ? 'Copiada' : entry.status === 'verified' ? 'Verificada' : entry.status === 'failed' ? 'Falha' : entry.status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-400">
                        {entry.size_bytes ? `${(entry.size_bytes / 1024).toFixed(0)} KB` : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-400">
                        {entry.copied_at ? new Date(entry.copied_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {filtered.length > PER_PAGE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500">{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} de {filtered.length}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40">Anterior</button>
              <span className="px-3 py-1 text-xs text-gray-500">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40">Próximo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Project Detail ─────────────────────────────────────────────────────────────

const ProjectDetail = ({ projectId, onBack }) => {
  const qc = useQueryClient();
  const [tab, setTab] = useState('email');
  const [showAddMailboxes, setShowAddMailboxes] = useState(false);
  const [mbSearch, setMbSearch] = useState('');
  const [toDeleteMb, setToDeleteMb] = useState(null);
  const [mbMenuOpen, setMbMenuOpen] = useState(null); // mailbox_id
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [showConfirmStart, setShowConfirmStart] = useState(false);
  const [mbPage, setMbPage] = useState(1);
  const [logFilter, setLogFilter] = useState('all');
  const [mbStatusFilter, setMbStatusFilter] = useState('all');
  const [selectedMbs, setSelectedMbs] = useState(new Set());
  const [ledgerMb, setLedgerMb] = useState(null);
  const [logSearch, setLogSearch] = useState('');
  const [logMailboxFilter, setLogMailboxFilter] = useState('all');
  const [batchRetryPending, setBatchRetryPending] = useState(false);
  const [batchDeletePending, setBatchDeletePending] = useState(false);

  // Polling enquanto a migração está ativa. react-query v5: o callback de
  // refetchInterval recebe um objeto Query — o data fica em query.state.data.
  const isActive = (status) => status === 'running' || status === 'pending';

  const { data: project, isLoading } = useQuery({
    queryKey: ['migration-project', projectId],
    queryFn: () => migrationApi.getProject(projectId),
    refetchInterval: (query) => isActive(query.state.data?.status) ? 3000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const { data: mailboxes = [] } = useQuery({
    queryKey: ['migration-mailboxes', projectId],
    queryFn: () => migrationApi.listMailboxes(projectId),
    refetchInterval: isActive(project?.status) ? 3000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['migration-logs', projectId],
    queryFn: () => migrationApi.listLogs(projectId),
    enabled: tab === 'logs',
    refetchInterval: tab === 'logs' && isActive(project?.status) ? 3000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const statusMut = useMutation({
    mutationFn: (status) => migrationApi.setStatus(projectId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migration-project', projectId] });
      qc.invalidateQueries({ queryKey: ['migration-projects'] });
    },
  });

  const verifyMut = useMutation({
    mutationFn: () => migrationApi.verify(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['migration-mailboxes', projectId] }),
  });

  const deltaMut = useMutation({
    mutationFn: () => migrationApi.deltaSync(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['migration-project', projectId] }),
  });

  const deleteMbMut = useMutation({
    mutationFn: (mbId) => migrationApi.deleteMailbox(projectId, mbId),
    onSuccess: () => {
      setToDeleteMb(null);
      qc.invalidateQueries({ queryKey: ['migration-mailboxes', projectId] });
    },
  });

  const retryMut = useMutation({
    mutationFn: () => migrationApi.retryFailed(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migration-project', projectId] });
      qc.invalidateQueries({ queryKey: ['migration-mailboxes', projectId] });
      qc.invalidateQueries({ queryKey: ['migration-projects'] });
    },
  });

  const scheduleMut = useMutation({
    mutationFn: (dt) => migrationApi.scheduleProject(projectId, dt),
    onSuccess: () => {
      setShowSchedule(false);
      qc.invalidateQueries({ queryKey: ['migration-project', projectId] });
    },
  });

  const cancelScheduleMut = useMutation({
    mutationFn: () => migrationApi.cancelSchedule(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['migration-project', projectId] }),
  });

  const pauseMbMut = useMutation({
    mutationFn: (mbId) => migrationApi.pauseMailbox(projectId, mbId),
    onSuccess: () => {
      setMbMenuOpen(null);
      qc.invalidateQueries({ queryKey: ['migration-mailboxes', projectId] });
    },
  });

  const retryMbMut = useMutation({
    mutationFn: (mbId) => migrationApi.retryMailbox(projectId, mbId),
    onSuccess: () => {
      setMbMenuOpen(null);
      qc.invalidateQueries({ queryKey: ['migration-mailboxes', projectId] });
      qc.invalidateQueries({ queryKey: ['migration-project', projectId] });
    },
  });

  const handleBatchRetry = async () => {
    setBatchRetryPending(true);
    try {
      await Promise.all([...selectedMbs].map(mid => migrationApi.retryMailbox(projectId, mid)));
      setSelectedMbs(new Set());
      qc.invalidateQueries({ queryKey: ['migration-mailboxes', projectId] });
      qc.invalidateQueries({ queryKey: ['migration-project', projectId] });
    } finally {
      setBatchRetryPending(false);
    }
  };

  const handleBatchDelete = async () => {
    setBatchDeletePending(true);
    try {
      await Promise.all([...selectedMbs].map(mid => migrationApi.deleteMailbox(projectId, mid)));
      setSelectedMbs(new Set());
      qc.invalidateQueries({ queryKey: ['migration-mailboxes', projectId] });
    } finally {
      setBatchDeletePending(false);
    }
  };

  const MAILBOX_STATUS = {
    pending:   { label: 'Aguardando', color: 'text-gray-500' },
    running:   { label: 'Migrando',   color: 'text-blue-500' },
    paused:    { label: 'Pausado',    color: 'text-yellow-500' },
    completed: { label: 'Concluído',  color: 'text-green-600' },
    failed:    { label: 'Falha',      color: 'text-red-500' },
    skipped:   { label: 'Ignorado',   color: 'text-yellow-500' },
  };

  const PHASE_CONFIG = {
    initial: { label: 'Migrando',   color: 'text-blue-500',   icon: RefreshCw,   spin: true  },
    delta:   { label: 'Delta sync', color: 'text-purple-500', icon: GitMerge,    spin: false },
    verify:  { label: 'Verificando',color: 'text-cyan-500',   icon: ShieldCheck, spin: true  },
    done:    { label: null, color: null, icon: null, spin: false },
  };

  const VerifyBadge = ({ mb }) => {
    if (!mb.verify_result) return null;
    const { ok, missing_count } = mb.verify_result;
    if (ok) return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <ShieldCheck className="w-3 h-3" /> Verificado
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        <AlertCircle className="w-3 h-3" /> {missing_count} faltando
      </span>
    );
  };

  const MB_PER_PAGE = 50;
  const MAILBOX_TABS = ['email', 'onedrive', 'sharepoint', 'm365_group'];
  const currentObjectType = MAILBOX_TABS.includes(tab) ? tab : 'email';
  const filteredMailboxes = mailboxes.filter(m => {
    const matchType = m.object_type === currentObjectType;
    const matchSearch = !mbSearch || m.source_email.includes(mbSearch) || (m.display_name || '').toLowerCase().includes(mbSearch.toLowerCase());
    const matchStatus = mbStatusFilter === 'all' || m.status === mbStatusFilter;
    return matchType && matchSearch && matchStatus;
  });
  const totalMbPages = Math.max(1, Math.ceil(filteredMailboxes.length / MB_PER_PAGE));
  const paginatedMailboxes = filteredMailboxes.slice((mbPage - 1) * MB_PER_PAGE, mbPage * MB_PER_PAGE);

  if (isLoading) return (
    <Layout>
      <div className="flex items-center gap-3 p-8">
        <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
        <p className="text-sm text-gray-500">Carregando projeto...</p>
      </div>
    </Layout>
  );

  if (!project) return (
    <Layout>
      <div className="p-8 text-center">
        <p className="text-sm text-gray-500">Projeto não encontrado.</p>
        <button onClick={onBack} className="mt-3 text-sm text-blue-500 hover:underline">Voltar</button>
      </div>
    </Layout>
  );

  const itemLabel   = 'caixas';
  const itemLabelSg = 'caixa';
  const canStart   = ['draft', 'ready', 'paused'].includes(project.status);
  const canPause   = project.status === 'running';
  const canDelete  = project.status !== 'running';
  const canVerify  = ['completed', 'failed'].includes(project.status);
  const canDelta   = project.status === 'completed';
  const failedCount = mailboxes.filter(m => m.status === 'failed').length;
  const canRetry   = failedCount > 0 && project.status !== 'running';
  const canSchedule = canStart && !project.scheduled_at;

  return (
    <Layout>
      {/*Back + header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mt-0.5">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{project.name}</h1>
            <StatusBadge status={project.status} />
            {project.scheduled_at && project.status !== 'running' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                <CalendarClock className="w-3 h-3" />
                {new Date(project.scheduled_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                <button
                  onClick={() => cancelScheduleMut.mutate()}
                  disabled={cancelScheduleMut.isPending}
                  className="ml-0.5 hover:text-red-500"
                  title="Cancelar agendamento"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {TYPE_LABELS[project.migration_type]} {project.source_label ? `· ${project.source_label}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {canStart && (
            <button onClick={() => setShowConfirmStart(true)} disabled={statusMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
              <Play className="w-3.5 h-3.5" /> Iniciar
            </button>
          )}
          {canSchedule && (
            <button onClick={() => setShowSchedule(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-300 dark:border-primary text-primary-dark dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
              <CalendarClock className="w-3.5 h-3.5" /> Agendar
            </button>
          )}
          {canPause && (
            <button onClick={() => statusMut.mutate('paused')} disabled={statusMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white disabled:opacity-50">
              <Pause className="w-3.5 h-3.5" /> Pausar
            </button>
          )}
          {canDelta && (
            <button onClick={() => deltaMut.mutate()} disabled={deltaMut.isPending}
              title="Sincroniza emails novos chegados durante a migração"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50">
              {deltaMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />}
              Delta Sync
            </button>
          )}
          {canVerify && (
            <button onClick={() => verifyMut.mutate()} disabled={verifyMut.isPending}
              title="Verifica se todas as mensagens foram copiadas corretamente"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50">
              {verifyMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Verificar
            </button>
          )}
          {canRetry && (
            <button onClick={() => retryMut.mutate()} disabled={retryMut.isPending}
              title={`Retentar ${failedCount} caixa(s) com falha`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50">
              {retryMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Retentar {failedCount} falha{failedCount > 1 ? 's' : ''}
            </button>
          )}

          {/* Exportar relatório */}
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Download className="w-3.5 h-3.5" /> Exportar
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-8 z-20 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1">
                {[{ fmt: 'csv', label: 'CSV' }, { fmt: 'pdf', label: 'PDF' }].map(({ fmt, label }) => (
                  <button
                    key={fmt}
                    onClick={async () => {
                      setExportMenuOpen(false);
                      try {
                        const resp = await api.get(migrationApi.exportReport(projectId, fmt), { responseType: 'blob' });
                        const url = URL.createObjectURL(resp.data);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `migracao_${projectId.slice(0,8)}.${fmt}`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {
                        alert(`Erro ao exportar ${label.toUpperCase()}`);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <FileText className="w-3.5 h-3.5 text-gray-400" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total',       value: project.mailbox_count,   icon: Mail,        color: 'text-blue-500'    },
          { label: 'Concluídos',  value: project.completed_count, icon: CheckCircle, color: 'text-green-500'   },
          { label: 'Verificadas', value: project.verified_count || 0, icon: ShieldCheck, color: 'text-cyan-500' },
          { label: 'Com falha',   value: project.failed_count,    icon: XCircle,     color: 'text-red-500'     },
          { label: 'Progresso',   value: `${project.progress}%`,  icon: BarChart3,   color: 'text-purple-500'  },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {project.mailbox_count > 0 && (
        <div className="card p-4 mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Progresso geral</span>
            <div className="flex items-center gap-3">
              {project.status === 'running' && project.eta_seconds && (
                <span className="flex items-center gap-1 text-blue-500 font-medium">
                  <Clock className="w-3 h-3" /> {fmtEta(project.eta_seconds)} restantes
                </span>
              )}
              <span>{project.completed_count}/{project.mailbox_count} {itemLabel}</span>
            </div>
          </div>
          <ProgressBar value={project.progress} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {[
          { id: 'email',      label: 'Correio',     icon: Mail },
          { id: 'onedrive',   label: 'OneDrive',    icon: HardDrive },
          { id: 'sharepoint', label: 'SharePoint',  icon: Globe },
          { id: 'm365_group', label: 'Grupos M365', icon: Users },
          { id: 'logs',       label: 'Logs',        icon: FileText },
        ].map(({ id, label, icon: Icon }) => {
          const cnt = MAILBOX_TABS.includes(id)
            ? mailboxes.filter(m => m.object_type === id).length
            : null;
          return (
            <button key={id} onClick={() => { setTab(id); setMbPage(1); setSelectedMbs(new Set()); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              <Icon className="w-4 h-4" /> {label}
              {cnt !== null && cnt > 0 && <span className="ml-0.5 text-xs opacity-60">({cnt})</span>}
            </button>
          );
        })}
      </div>

      {/* Mailboxes tab (Correio / OneDrive / SharePoint) */}
      {MAILBOX_TABS.includes(tab) && (
        <div className="card">
          <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" value={mbSearch} onChange={e => { setMbSearch(e.target.value); setMbPage(1); }}
                placeholder="Buscar por e-mail ou nome..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button onClick={() => setShowAddMailboxes(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" />
              {{ email: 'Adicionar', onedrive: 'Adicionar OneDrive', sharepoint: 'Adicionar SharePoint', m365_group: 'Adicionar Grupo' }[currentObjectType] || 'Adicionar'}
            </button>
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
            {[
              { id: 'all',       label: 'Todas' },
              { id: 'pending',   label: 'Aguardando' },
              { id: 'running',   label: 'Migrando' },
              { id: 'completed', label: 'Concluídas' },
              { id: 'failed',    label: 'Com falha' },
              { id: 'paused',    label: 'Pausadas' },
            ].map(f => {
              const typeMbs = mailboxes.filter(m => m.object_type === currentObjectType);
              const cnt = f.id === 'all' ? typeMbs.length : typeMbs.filter(m => m.status === f.id).length;
              return (
                <button key={f.id} onClick={() => { setMbStatusFilter(f.id); setMbPage(1); setSelectedMbs(new Set()); }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                    mbStatusFilter === f.id
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}>
                  {f.label}{cnt > 0 ? <span className="ml-1 opacity-60">({cnt})</span> : null}
                </button>
              );
            })}
          </div>
          {filteredMailboxes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              {{ email: <Mail className="w-10 h-10 text-gray-300 dark:text-gray-600" />, onedrive: <HardDrive className="w-10 h-10 text-gray-300 dark:text-gray-600" />, sharepoint: <Globe className="w-10 h-10 text-gray-300 dark:text-gray-600" />, m365_group: <Users className="w-10 h-10 text-gray-300 dark:text-gray-600" /> }[currentObjectType] || <Mail className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
              <p className="text-sm text-gray-500">
                {{ email: 'Nenhuma caixa de correio adicionada ainda.', onedrive: 'Nenhuma conta OneDrive adicionada ainda.', sharepoint: 'Nenhum site SharePoint adicionado ainda.', m365_group: 'Nenhum grupo M365 adicionado ainda.' }[currentObjectType]}
              </p>
              <button onClick={() => setShowAddMailboxes(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400 hover:text-blue-500">
                <Plus className="w-4 h-4" />
                {{ email: 'Adicionar caixas', onedrive: 'Adicionar OneDrive', sharepoint: 'Adicionar SharePoint', m365_group: 'Adicionar Grupo M365' }[currentObjectType]}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto" onClick={() => setMbMenuOpen(null)}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="pl-4 pr-2 py-3">
                      <input type="checkbox"
                        checked={paginatedMailboxes.length > 0 && paginatedMailboxes.every(m => selectedMbs.has(m.id))}
                        onChange={e => {
                          const next = new Set(selectedMbs);
                          paginatedMailboxes.forEach(m => e.target.checked ? next.add(m.id) : next.delete(m.id));
                          setSelectedMbs(next);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {{ email: 'Origem', onedrive: 'Usuário Origem', sharepoint: 'URL de Origem', m365_group: 'Grupo Origem' }[currentObjectType] || 'Origem'}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {{ email: 'Destino', onedrive: 'Usuário Destino', sharepoint: 'URL de Destino', m365_group: 'Grupo Destino' }[currentObjectType] || 'Destino'}
                    </th>
                    <th className="px-4 py-3 font-medium">Status / Fase</th>
                    <th className="px-4 py-3 font-medium">Progresso</th>
                    <th className="px-4 py-3 font-medium">Verificação</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {paginatedMailboxes.map(mb => {
                    const mbCfg = MAILBOX_STATUS[mb.status] || MAILBOX_STATUS.pending;
                    return (
                      <tr key={mb.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${selectedMbs.has(mb.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                        <td className="pl-4 pr-2 py-3">
                          <input type="checkbox"
                            checked={selectedMbs.has(mb.id)}
                            onChange={e => {
                              const next = new Set(selectedMbs);
                              e.target.checked ? next.add(mb.id) : next.delete(mb.id);
                              setSelectedMbs(next);
                            }}
                            onClick={e => e.stopPropagation()}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <p className="font-medium text-gray-800 dark:text-gray-200 truncate" title={mb.source_email}>{mb.source_email}</p>
                          {mb.display_name && <p className="text-xs text-gray-400 truncate">{mb.display_name}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={mb.destination_email || ''}>{mb.destination_email || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${mbCfg.color}`}>{mbCfg.label}</span>
                          {/* Fase atual (quando running) */}
                          {mb.status === 'running' && mb.phase && mb.phase !== 'done' && (() => {
                            const ph = PHASE_CONFIG[mb.phase];
                            if (!ph || !ph.label) return null;
                            const PhIcon = ph.icon;
                            return (
                              <span className={`flex items-center gap-1 text-[10px] mt-0.5 ${ph.color}`}>
                                {PhIcon && <PhIcon className={`w-3 h-3 ${ph.spin ? 'animate-spin' : ''}`} />}
                                {ph.label}
                              </span>
                            );
                          })()}
                          {mb.error_message && (
                            <p className="text-xs text-red-400 mt-0.5 max-w-xs truncate" title={mb.error_message}>{mb.error_message}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {mb.items_total ? (
                            <div className="w-28">
                              <ProgressBar value={mb.progress} />
                              <p className="text-xs text-gray-400 mt-1">{mb.items_migrated}/{mb.items_total}</p>
                              {mb.eta_seconds && (
                                <p className="text-[10px] text-blue-400 flex items-center gap-0.5 mt-0.5">
                                  <Clock className="w-2.5 h-2.5" /> {fmtEta(mb.eta_seconds)}
                                </p>
                              )}
                              {mb.size_mb && <p className="text-[10px] text-gray-400">{mb.size_mb} MB</p>}
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <VerifyBadge mb={mb} />
                          {!mb.verify_result && mb.status === 'completed' && (
                            <span className="text-[10px] text-gray-400">Pendente</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right relative">
                          <button
                            onClick={e => { e.stopPropagation(); setMbMenuOpen(mbMenuOpen === mb.id ? null : mb.id); }}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                          {mbMenuOpen === mb.id && (
                            <div
                              className="absolute right-4 top-8 z-20 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1"
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                onClick={() => { setLedgerMb(mb); setMbMenuOpen(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                <FileText className="w-3.5 h-3.5" /> Ver ledger
                              </button>
                              {mb.status === 'running' && (
                                <button
                                  onClick={() => pauseMbMut.mutate(mb.id)}
                                  disabled={pauseMbMut.isPending}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-yellow-600 dark:text-yellow-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                  <Pause className="w-3.5 h-3.5" /> Pausar
                                </button>
                              )}
                              {(mb.status === 'failed' || mb.status === 'paused') && (
                                <button
                                  onClick={() => retryMbMut.mutate(mb.id)}
                                  disabled={retryMbMut.isPending}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" /> Retentar
                                </button>
                              )}
                              {project.status !== 'running' && (
                                <button
                                  onClick={() => { setToDeleteMb(mb); setMbMenuOpen(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-red-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Remover
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {filteredMailboxes.length > MB_PER_PAGE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500">
                {(mbPage - 1) * MB_PER_PAGE + 1}–{Math.min(mbPage * MB_PER_PAGE, filteredMailboxes.length)} de {filteredMailboxes.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMbPage(p => Math.max(1, p - 1))}
                  disabled={mbPage === 1}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="px-3 py-1 text-xs text-gray-500">{mbPage}/{totalMbPages}</span>
                <button
                  onClick={() => setMbPage(p => Math.min(totalMbPages, p + 1))}
                  disabled={mbPage === totalMbPages}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}

          {/* Batch action bar */}
          {selectedMbs.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800 rounded-b-xl">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{selectedMbs.size} selecionada(s)</span>
              <button onClick={() => setSelectedMbs(new Set())} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                Limpar
              </button>
              <div className="flex-1" />
              <button
                onClick={handleBatchRetry}
                disabled={batchRetryPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${batchRetryPending ? 'animate-spin' : ''}`} /> Retentar selecionadas
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeletePending || project.status === 'running'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remover selecionadas
              </button>
            </div>
          )}
        </div>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (() => {
        const filteredLogs = logs.filter(l => {
          const matchLevel = logFilter === 'all' || l.level === logFilter;
          const matchSearch = !logSearch || (l.message || '').toLowerCase().includes(logSearch.toLowerCase());
          const matchMb = logMailboxFilter === 'all' ||
            (l.mailbox_id && l.mailbox_id === logMailboxFilter) ||
            (!l.mailbox_id && mailboxes.find(m => m.id === logMailboxFilter && (l.message || '').includes(m.source_email)));
          return matchLevel && matchSearch && matchMb;
        });
        return (
        <div className="card">
          {/* Log filter bar */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            {[
              { id: 'all',     label: 'Todos' },
              { id: 'info',    label: 'Info' },
              { id: 'warning', label: 'Avisos' },
              { id: 'error',   label: 'Erros' },
            ].map(f => (
              <button key={f.id} onClick={() => setLogFilter(f.id)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  logFilter === f.id
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}>
                {f.label}
                {f.id !== 'all' && (() => {
                  const count = logs.filter(l => l.level === f.id).length;
                  return count > 0 ? <span className="ml-1 opacity-60">({count})</span> : null;
                })()}
              </button>
            ))}

            <div className="flex-1" />

            {/* Mailbox filter */}
            {mailboxes.length > 0 && (
              <select
                value={logMailboxFilter}
                onChange={e => setLogMailboxFilter(e.target.value)}
                className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todas as caixas</option>
                {mailboxes.map(m => (
                  <option key={m.id} value={m.id}>{m.source_email}</option>
                ))}
              </select>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={logSearch} onChange={e => setLogSearch(e.target.value)}
                placeholder="Buscar mensagem..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
            </div>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500">{logFilter === 'all' ? 'Nenhum log registrado ainda.' : `Nenhum log do tipo "${logFilter}".`}</p>
            </div>
          ) : filteredLogs.map(log => {
            const lcfg = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.info;
            return (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${lcfg.bg} ${lcfg.color} flex-shrink-0 mt-0.5`}>
                  {log.level}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{log.message}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {log.created_at ? new Date(log.created_at).toLocaleTimeString('pt-BR') : ''}
                </span>
              </div>
            );
          })}
          </div>
        </div>
        );
      })()}

      {/* Mailbox Ledger Drawer */}
      {ledgerMb && (
        <MailboxLedgerDrawer projectId={projectId} mb={ledgerMb} onClose={() => setLedgerMb(null)} />
      )}

      {/* Confirm start modal */}
      {showConfirmStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowConfirmStart(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Play className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Iniciar migração?</p>
                <p className="text-xs text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {mailboxes.length > 0
                  ? `Serão processadas ${mailboxes.filter(m => m.status === 'pending').length} caixas. Licenças de migração serão consumidas ao iniciar.`
                  : 'Nenhuma caixa adicionada. Adicione caixas de correio antes de iniciar.'}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmStart(false)}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                Cancelar
              </button>
              <button
                onClick={() => { setShowConfirmStart(false); statusMut.mutate('running'); }}
                disabled={statusMut.isPending || mailboxes.filter(m => m.status === 'pending').length === 0}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50">
                {statusMut.isPending ? 'Iniciando...' : 'Confirmar e iniciar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddMailboxes && <AddMailboxesModal projectId={projectId} objectType={currentObjectType} onClose={() => setShowAddMailboxes(false)} />}

      {/* Schedule modal */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSchedule(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <CalendarClock className="w-4 h-4 text-primary-dark dark:text-indigo-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Agendar início</p>
                <p className="text-xs text-gray-500">A migração iniciará automaticamente no horário escolhido.</p>
              </div>
            </div>
            <input
              type="datetime-local"
              value={scheduleDateTime}
              onChange={e => setScheduleDateTime(e.target.value)}
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary mb-4"
            />
            {scheduleMut.isError && (
              <p className="text-xs text-red-500 mb-3">{scheduleMut.error?.response?.data?.detail || 'Erro ao agendar.'}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowSchedule(false)}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                Cancelar
              </button>
              <button
                onClick={() => scheduleMut.mutate(new Date(scheduleDateTime).toISOString())}
                disabled={!scheduleDateTime || scheduleMut.isPending}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary-dark text-white font-medium disabled:opacity-40"
              >
                {scheduleMut.isPending ? 'Agendando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete mailbox confirm */}
      {toDeleteMb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setToDeleteMb(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Remover caixa de correio?</p>
            <p className="text-sm text-gray-500 mb-5">{toDeleteMb.source_email}</p>
            <div className="flex gap-3">
              <button onClick={() => setToDeleteMb(null)} className="flex-1 px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={() => deleteMbMut.mutate(toDeleteMb.id)} disabled={deleteMbMut.isPending}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50">
                {deleteMbMut.isPending ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

// ── Migration Upsell (plan gate) ─────────────────────────────────────────────

const MigrationUpsell = () => (
  <Layout>
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-6">
        <Lock className="w-10 h-10 text-blue-400" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Migration365</h2>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8">
        Este recurso não está disponível no seu plano atual. Entre em contato com o suporte para
        habilitar o Migration365 na sua organização.
      </p>
      <a
        href="mailto:suporte@cloudatlas.app.br?subject=Habilitar%20Migration365"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Falar com o suporte
      </a>
    </div>
  </Layout>
);

// ── License Dashboard Panel ──────────────────────────────────────────────────

const LicenseDashboard = ({ licenseSummary }) => {
  const qc = useQueryClient();
  const [showRequest, setShowRequest] = useState(false);
  const [quantity, setQuantity] = useState(10);
  const [notes, setNotes] = useState('');

  const requestMut = useMutation({
    mutationFn: (data) => migrationApi.requestLicenses(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migration-license-summary'] });
      qc.invalidateQueries({ queryKey: ['migration-license-history'] });
      setTimeout(() => {
        setShowRequest(false);
        setNotes('');
      }, 2000);
    },
  });

  const { data: history } = useQuery({
    queryKey: ['migration-license-history'],
    queryFn: migrationApi.getLicenseHistory,
    staleTime: 60_000,
  });

  if (!licenseSummary) return null;

  const unitPrice = (licenseSummary.unit_price_cents || 7000) / 100;
  const pendingCount = licenseSummary.pending_requests || 0;

  const STATUS_LABEL = {
    pending:  { text: 'Aguardando aprovação', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    approved: { text: 'Aprovada',             cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    rejected: { text: 'Recusada',             cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Licenças Migration365</h3>
            <p className="text-xs text-gray-400">Licenças avulsas — R$ {unitPrice.toFixed(2)}/usuário</p>
          </div>
        </div>
        <button
          onClick={() => setShowRequest(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg"
        >
          <ShoppingCart className="w-3.5 h-3.5" /> Solicitar licenças
        </button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{licenseSummary.licenses_purchased || 0}</p>
          <p className="text-xs text-gray-400">Aprovadas</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{licenseSummary.licenses_used || 0}</p>
          <p className="text-xs text-gray-400">Utilizadas</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
          <p className={`text-2xl font-bold ${(licenseSummary.licenses_remaining || 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {licenseSummary.licenses_remaining || 0}
          </p>
          <p className="text-xs text-gray-400">Restantes</p>
        </div>
      </div>

      {/* Pending requests banner */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <Clock className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            {pendingCount} solicitação(ões) aguardando aprovação do administrador.
          </p>
        </div>
      )}

      {/* History */}
      {history?.licenses?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Histórico de solicitações</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {history.licenses.map((lic) => {
              const st = STATUS_LABEL[lic.status] || STATUS_LABEL.pending;
              return (
                <div key={lic.id} className="flex items-center justify-between text-xs py-2 px-3 rounded bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.cls}`}>{st.text}</span>
                    <span className="text-gray-600 dark:text-gray-300">
                      {lic.licenses_purchased} licenças — R$ {(lic.amount_cents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-gray-400 text-right">
                    <span>{lic.created_at ? new Date(lic.created_at).toLocaleDateString('pt-BR') : ''}</span>
                    {lic.status === 'approved' && (
                      <span> · {lic.licenses_used}/{lic.licenses_purchased} usadas</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Request modal */}
      {showRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowRequest(false)}>
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Solicitar Licenças</h3>
              <button onClick={() => setShowRequest(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Cada licença cobre a migração completa de 1 usuário (e-mail + OneDrive + SharePoint + Teams).
              Sua solicitação será analisada e, após aprovação, uma cobrança será gerada.
            </p>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">Quantidade de licenças</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">Observação (opcional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Migração do cliente XPTO, previsão de 50 usuários"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>

            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 mb-5">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-500">{quantity} licenças × R$ {unitPrice.toFixed(2)}</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">R$ {(quantity * unitPrice).toFixed(2)}</span>
              </div>
              <p className="text-xs text-gray-400">A cobrança será gerada após aprovação do administrador.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowRequest(false)} className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                Cancelar
              </button>
              <button
                onClick={() => requestMut.mutate({ quantity, notes: notes || undefined })}
                disabled={requestMut.isPending}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50"
              >
                {requestMut.isPending ? 'Enviando...' : `Solicitar ${quantity} licenças`}
              </button>
            </div>

            {requestMut.isError && (
              <p className="mt-3 text-xs text-red-500 text-center">{requestMut.error?.response?.data?.detail || 'Erro ao enviar solicitação.'}</p>
            )}
            {requestMut.isSuccess && (
              <p className="mt-3 text-xs text-green-500 text-center">Solicitação enviada! Aguarde aprovação do administrador.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

const Migration365 = () => {
  const { projectId } = useParams();
  const navigate      = useNavigate();
  const qc            = useQueryClient();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const [showWizard, setShowWizard] = useState(false);
  const [toDelete, setToDelete]     = useState(null);

  const effectivePlan = currentOrg?.effective_plan || 'free';
  const planLevel = {
    free: 0, basic: 0, standard: 1,
    enterprise: 2,
    enterprise_e1: 2, enterprise_e2: 2, enterprise_e3: 2,
    enterprise_migration: 2,
  }[effectivePlan] || 0;

  const hasEnterprise = planLevel >= 2;

  const { data: licenseSummary } = useQuery({
    queryKey: ['migration-license-summary'],
    queryFn: migrationApi.getLicenseSummary,
    enabled: !!currentOrg && !!currentWorkspace && hasEnterprise,
    staleTime: 30_000,
  });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['migration-projects'],
    queryFn: migrationApi.listProjects,
    enabled: !!currentOrg && !!currentWorkspace && hasEnterprise,
    retry: false,
    staleTime: 30_000,
  });

  const { data: workerHealth } = useQuery({
    queryKey: ['migration-worker-health'],
    queryFn: migrationApi.getWorkerHealth,
    enabled: !!currentOrg && !!currentWorkspace && hasEnterprise,
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: false,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => migrationApi.deleteProject(id),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['migration-projects'] });
    },
  });

  // Gate: requires at least Enterprise
  if (!hasEnterprise) {
    return <MigrationUpsell />;
  }

  // If projectId in URL, show detail
  if (projectId) {
    return <ProjectDetail projectId={projectId} onBack={() => navigate('/m365/migration')} />;
  }

  const stats = {
    total:     projects.length,
    running:   projects.filter(p => p.status === 'running').length,
    completed: projects.filter(p => p.status === 'completed').length,
    failed:    projects.filter(p => p.status === 'failed').length,
  };

  return (
    <Layout>
      {/*Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Migração 365</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Migre caixas de correio, OneDrive e SharePoint para o Microsoft 365
          </p>
        </div>
        <button onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
          <Plus className="w-4 h-4" /> Novo Projeto
        </button>
      </div>

      {/* Worker health banner — só mostra se Redis estiver down */}
      {workerHealth?.redis === 'unreachable' && (
        <div className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">Redis inacessível — migrações não podem ser iniciadas.</p>
        </div>
      )}

      {/* License dashboard — só para enterprise com licenças avulsas (não bundle) */}
      {licenseSummary && licenseSummary.mode === 'per_license' && (
        <LicenseDashboard licenseSummary={licenseSummary} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Projetos', value: stats.total,     icon: ArrowRightLeft, color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Em execução', value: stats.running, icon: Play,          color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Concluídos', value: stats.completed,icon: CheckCircle,  color: 'text-emerald-500',bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Com erros',  value: stats.failed,   icon: AlertCircle,  color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Projects list */}
      {isLoading ? (
        <div className="card divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-5 animate-pulse">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="flex-1">
                <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <ArrowRightLeft className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-800 dark:text-gray-200">Nenhum projeto de migração</p>
            <p className="text-sm text-gray-400 mt-1 max-w-sm">Crie seu primeiro projeto para migrar caixas de correio para o Microsoft 365.</p>
          </div>
          <button onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
            <Plus className="w-4 h-4" /> Criar primeiro projeto
          </button>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-gray-800">
          {projects.map(project => {
            const typeCfg = MIGRATION_TYPES.find(t => t.id === project.migration_type);
            const TypeIcon = typeCfg?.icon || ArrowRightLeft;
            const itemUnit = 'caixas';
            return (
              <div key={project.id}
                className="flex items-center gap-4 p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/m365/migration/${project.id}`)}>

                {/* Type icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  typeCfg?.color === 'text-blue-500'   ? 'bg-blue-50 dark:bg-blue-900/20' :
                  typeCfg?.color === 'text-purple-500' ? 'bg-purple-50 dark:bg-purple-900/20' :
                  typeCfg?.color === 'text-green-500'  ? 'bg-green-50 dark:bg-green-900/20' :
                  typeCfg?.color === 'text-sky-500'    ? 'bg-sky-50 dark:bg-sky-900/20' :
                  typeCfg?.color === 'text-teal-500'   ? 'bg-teal-50 dark:bg-teal-900/20' :
                  'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <TypeIcon className={`w-5 h-5 ${typeCfg?.color || 'text-gray-400'}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{project.name}</p>
                    <StatusBadge status={project.status} />
                    {project.status === 'running' && project.eta_seconds && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-medium">
                        <Clock className="w-3 h-3" /> {fmtEta(project.eta_seconds)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400">{TYPE_LABELS[project.migration_type]}</span>
                    {project.source_label && (
                      <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">{project.source_label}</span>
                    )}
                    <span className="text-xs text-gray-400">
                      {project.mailbox_count > 0 && project.status !== 'draft'
                        ? `${project.completed_count}/${project.mailbox_count} ${itemUnit}`
                        : `${project.mailbox_count} ${itemUnit}`}
                    </span>
                    {project.failed_count > 0 && (
                      <span className="text-xs text-red-500 font-medium">{project.failed_count} com falha</span>
                    )}
                  </div>
                  {project.mailbox_count > 0 && project.status !== 'draft' && (
                    <div className="mt-2 max-w-xs flex items-center gap-2">
                      <ProgressBar value={project.progress} className="flex-1" />
                      <span className="text-xs text-gray-400 tabular-nums">{project.progress}%</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <p className="text-xs text-gray-400 hidden md:block">
                    {project.created_at ? new Date(project.created_at).toLocaleDateString('pt-BR') : ''}
                  </p>
                  <button
                    onClick={() => setToDelete(project)}
                    disabled={project.status === 'running'}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showWizard && (
        <CreateProjectWizard
          onClose={() => setShowWizard(false)}
          onCreated={(id) => { setShowWizard(false); navigate(`/m365/migration/${id}`); }}
        />
      )}

      {/* Delete confirm */}
      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setToDelete(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Excluir projeto?</p>
            <p className="text-sm text-gray-500 mb-5">
              "<strong>{toDelete.name}</strong>" e todas as suas caixas de correio e logs serão removidos permanentemente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setToDelete(null)} className="flex-1 px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={() => deleteMut.mutate(toDelete.id)} disabled={deleteMut.isPending}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50">
                {deleteMut.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Migration365;
