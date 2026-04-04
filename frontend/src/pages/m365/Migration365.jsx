import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft, Plus, Trash2, Play, Pause, RefreshCw, X,
  CheckCircle, XCircle, Clock, AlertCircle, ChevronRight,
  Mail, Users, BarChart3, FileText, ArrowLeft, Upload,
  Globe, Server, Building2, Wifi, Search, ShieldCheck, GitMerge,
  MoreVertical, Download, CalendarClock, HardDrive, FolderOpen,
  MessageSquare, Lock, ShoppingCart, CreditCard, Package, Infinity,
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
  getLicenseSummary: ()             => api.get(wsUrl('/migration/license-summary')).then(r => r.data),
  requestLicenses:  (data)         => api.post(wsUrl('/migration/licenses/request'), data).then(r => r.data),
  getLicenseHistory: ()             => api.get(wsUrl('/migration/licenses/history')).then(r => r.data),
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MIGRATION_TYPES = [
  { id: 'google_workspace',  label: 'Google Workspace',       icon: Globe,      desc: 'Gmail, Google Calendar, Contatos → M365', color: 'text-blue-500',   category: 'email' },
  { id: 'exchange_onprem',   label: 'Exchange On-Premises',   icon: Server,     desc: 'Exchange 2013/2016/2019 → Exchange Online', color: 'text-orange-500', category: 'email' },
  { id: 'tenant_to_tenant',  label: 'M365 Tenant → Tenant',   icon: Building2,  desc: 'De um tenant M365 para outro', color: 'text-purple-500',            category: 'email' },
  { id: 'imap',              label: 'IMAP Genérico',          icon: Wifi,       desc: 'Yahoo, Outlook.com, Zoho e outros servidores IMAP', color: 'text-green-500', category: 'email' },
  { id: 'onedrive_to_onedrive',     label: 'OneDrive → OneDrive',       icon: HardDrive,     desc: 'Migrar arquivos entre OneDrives de tenants diferentes', color: 'text-sky-500',    category: 'files' },
  { id: 'sharepoint_to_sharepoint', label: 'SharePoint → SharePoint',   icon: FolderOpen,    desc: 'Migrar bibliotecas de documentos entre sites SharePoint', color: 'text-teal-500', category: 'files' },
  { id: 'teams_chat',               label: 'Teams Chat → Teams',        icon: MessageSquare, desc: 'Migrar conversas de chat e mensagens de canais do Teams', color: 'text-violet-500', category: 'teams' },
];

const SOURCE_FIELDS = {
  google_workspace: [
    { key: 'domain',            label: 'Domínio',                   placeholder: 'empresa.com' },
    { key: 'service_account',   label: 'Service Account (JSON)',    placeholder: 'Cole o JSON da conta de serviço', multiline: true },
    { key: 'admin_email',       label: 'E-mail do Admin',           placeholder: 'admin@empresa.com' },
  ],
  exchange_onprem: [
    { key: 'host',              label: 'Servidor Exchange (hostname/IP)', placeholder: 'mail.empresa.com' },
    { key: 'username',          label: 'Usuário Admin (UPN)',        placeholder: 'admin@empresa.local' },
    { key: 'password',          label: 'Senha',                     placeholder: '••••••••', type: 'password' },
    { key: 'ews_url',           label: 'URL EWS (opcional)',        placeholder: 'https://mail.empresa.com/EWS/Exchange.asmx' },
  ],
  tenant_to_tenant: [
    { key: 'tenant_id',         label: 'Tenant ID de origem',       placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'client_id',         label: 'Client ID (App Registration)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'client_secret',     label: 'Client Secret',             placeholder: '••••••••', type: 'password' },
  ],
  imap: [
    { key: 'host',              label: 'Servidor IMAP',             placeholder: 'imap.empresa.com' },
    { key: 'port',              label: 'Porta',                     placeholder: '993' },
    { key: 'use_ssl',           label: 'Usar SSL',                  type: 'checkbox' },
  ],
  onedrive_to_onedrive: [
    { key: 'tenant_id',         label: 'Tenant ID de origem',       placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'client_id',         label: 'Client ID (App Registration)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'client_secret',     label: 'Client Secret',             placeholder: '••••••••', type: 'password' },
  ],
  sharepoint_to_sharepoint: [
    { key: 'tenant_id',         label: 'Tenant ID de origem',       placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'client_id',         label: 'Client ID (App Registration)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'client_secret',     label: 'Client Secret',             placeholder: '••••••••', type: 'password' },
  ],
  teams_chat: [
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
  google_workspace:          'Google Workspace',
  exchange_onprem:           'Exchange On-Premises',
  tenant_to_tenant:          'M365 Tenant → Tenant',
  imap:                      'IMAP Genérico',
  onedrive_to_onedrive:      'OneDrive → OneDrive',
  sharepoint_to_sharepoint:  'SharePoint → SharePoint',
  teams_chat:                'Teams Chat → Teams',
};

const FILE_MIGRATION_TYPES = ['onedrive_to_onedrive', 'sharepoint_to_sharepoint', 'teams_chat'];
const isFileMigration = (type) => FILE_MIGRATION_TYPES.includes(type);

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
  <div className={`h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${className}`}>
    <div
      className="h-full bg-blue-500 rounded-full transition-all duration-500"
      style={{ width: `${Math.min(100, value || 0)}%` }}
    />
  </div>
);


// ── Wizard ────────────────────────────────────────────────────────────────────

const WIZARD_STEPS = ['Tipo', 'Origem', 'Destino', 'Revisão'];

const CreateProjectWizard = ({ onClose, onCreated }) => {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    description: '',
    migration_type: '',
    source_config: {},
    destination_config: {},
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
    if (step === 2) return !!form.name;
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
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Selecione o tipo de migração para este projeto.</p>

              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" /> E-mail
              </p>
              <div className="space-y-2">
                {MIGRATION_TYPES.filter(t => t.category === 'email').map(({ id, label, icon: Icon, desc, color }) => (
                  <button
                    key={id}
                    onClick={() => setForm(p => ({ ...p, migration_type: id }))}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      form.migration_type === id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                    </div>
                    {form.migration_type === id && <CheckCircle className="w-5 h-5 text-blue-500 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>

              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-2 mt-4">
                <HardDrive className="w-3.5 h-3.5" /> Arquivos
              </p>
              <div className="space-y-2">
                {MIGRATION_TYPES.filter(t => t.category === 'files').map(({ id, label, icon: Icon, desc, color }) => (
                  <button
                    key={id}
                    onClick={() => setForm(p => ({ ...p, migration_type: id }))}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      form.migration_type === id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                    </div>
                    {form.migration_type === id && <CheckCircle className="w-5 h-5 text-blue-500 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>

              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-2 mt-4">
                <MessageSquare className="w-3.5 h-3.5" /> Teams
              </p>
              <div className="space-y-2">
                {MIGRATION_TYPES.filter(t => t.category === 'teams').map(({ id, label, icon: Icon, desc, color }) => (
                  <button
                    key={id}
                    onClick={() => setForm(p => ({ ...p, migration_type: id }))}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      form.migration_type === id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                    </div>
                    {form.migration_type === id && <CheckCircle className="w-5 h-5 text-blue-500 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
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

          {/* Step 2: Destination + name */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Configure o <strong>destino Microsoft 365</strong> e dê um nome ao projeto.
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
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Contexto, prazo, departamentos envolvidos..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3">Destino M365 (opcional — usa as credenciais do workspace)</p>
                {[
                  { key: 'tenant_id',    label: 'Tenant ID de destino',     placeholder: 'Deixe vazio para usar o tenant do workspace' },
                  { key: 'client_id',    label: 'Client ID (opcional)',      placeholder: 'Deixe vazio para usar as credenciais do workspace' },
                  { key: 'client_secret',label: 'Client Secret (opcional)',  placeholder: '••••••••', type: 'password' },
                ].map(field => (
                  <div key={field.key} className="mb-3">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{field.label}</label>
                    <input
                      type={field.type || 'text'}
                      value={dstFields[field.key] || ''}
                      onChange={e => setDstFields(p => ({ ...p, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Revise as informações antes de criar o projeto.</p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {[
                  { label: 'Nome', value: form.name },
                  { label: 'Tipo', value: TYPE_LABELS[form.migration_type] },
                  { label: 'Origem', value: srcFields.domain || srcFields.host || srcFields.tenant_id || '—' },
                  { label: 'Destino', value: dstFields.tenant_id || 'Tenant do workspace' },
                  { label: 'Descrição', value: form.description || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-4 px-4 py-3 border-b last:border-0 border-gray-100 dark:border-gray-800">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">{label}</span>
                    <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  O projeto será criado em status <strong>Rascunho</strong>. Você poderá adicionar {
                    isFileMigration(form.migration_type)
                      ? (form.migration_type === 'onedrive_to_onedrive' ? 'usuários (UPN) para migrar seus OneDrives' : 'sites SharePoint para migrar')
                      : 'caixas de correio'
                  } e iniciar a migração quando estiver pronto.
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

const AddMailboxesModal = ({ projectId, migrationType, onClose }) => {
  const isFile = isFileMigration(migrationType);
  const srcLabel = migrationType === 'onedrive_to_onedrive' ? 'UPN do usuário' : migrationType === 'sharepoint_to_sharepoint' ? 'Site ID' : 'E-mail de origem';
  const dstLabel = migrationType === 'onedrive_to_onedrive' ? 'UPN de destino' : migrationType === 'sharepoint_to_sharepoint' ? 'Site ID de destino' : 'E-mail de destino';
  const srcPlaceholder = migrationType === 'onedrive_to_onedrive' ? 'user@source.com' : migrationType === 'sharepoint_to_sharepoint' ? 'contoso.sharepoint.com,site-id-aqui' : 'email_origem';
  const modalTitle = isFile ? (migrationType === 'onedrive_to_onedrive' ? 'Adicionar Usuários (OneDrive)' : 'Adicionar Sites (SharePoint)') : 'Adicionar Caixas de Correio';
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
      const parts = line.split(',').map(p => p.trim());
      return { source_email: parts[0], destination_email: parts[1] || '', display_name: parts[2] || '' };
    }).filter(e => isFile ? e.source_email.length > 0 : e.source_email.includes('@'));
    if (!entries.length) { setParseError(isFile ? 'Nenhum identificador válido encontrado.' : 'Nenhum e-mail válido encontrado.'); return; }
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
  const entries = tab === 'text' ? parsed : (csvPreview?.valid || []);

  const addMut = useMutation({
    mutationFn: () => migrationApi.addMailboxes(projectId, { mailboxes: entries }),
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
              <p className="text-xs text-gray-500">Uma por linha: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{srcPlaceholder}, {dstLabel.toLowerCase()}, nome</code></p>
              <textarea
                rows={8}
                value={input}
                onChange={e => { setInput(e.target.value); setParsed([]); }}
                placeholder={"joao@origem.com, joao@empresa.com, João Silva\nmaria@origem.com, maria@empresa.com\npedro@origem.com"}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {parseError && <p className="text-xs text-red-500">{parseError}</p>}
              {parsed.length > 0 && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-xs text-green-700 dark:text-green-300 font-medium">{parsed.length} caixa(s) prontas para adicionar</p>
                </div>
              )}
            </>
          )}

          {/* Aba: Upload CSV */}
          {tab === 'csv' && (
            <>
              <p className="text-xs text-gray-500">
                Colunas aceitas: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">source_email</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">destination_email</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">display_name</code>
              </p>

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
                            <th className="px-3 py-2 font-medium">Origem</th>
                            <th className="px-3 py-2 font-medium">Destino</th>
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
              Importar {entries.length} caixa(s)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Project Detail ─────────────────────────────────────────────────────────────

const ProjectDetail = ({ projectId, onBack }) => {
  const qc = useQueryClient();
  const [tab, setTab] = useState('mailboxes');
  const [showAddMailboxes, setShowAddMailboxes] = useState(false);
  const [mbSearch, setMbSearch] = useState('');
  const [toDeleteMb, setToDeleteMb] = useState(null);
  const [mbMenuOpen, setMbMenuOpen] = useState(null); // mailbox_id
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');

  const { data: project, isLoading } = useQuery({
    queryKey: ['migration-project', projectId],
    queryFn: () => migrationApi.getProject(projectId),
    refetchInterval: (data) => data?.status === 'running' ? 5000 : false,
    retry: false,
  });

  const { data: mailboxes = [] } = useQuery({
    queryKey: ['migration-mailboxes', projectId],
    queryFn: () => migrationApi.listMailboxes(projectId),
    refetchInterval: project?.status === 'running' ? 5000 : false,
    retry: false,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['migration-logs', projectId],
    queryFn: () => migrationApi.listLogs(projectId),
    enabled: tab === 'logs',
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

  const filteredMailboxes = mailboxes.filter(m =>
    !mbSearch || m.source_email.includes(mbSearch) || (m.display_name || '').toLowerCase().includes(mbSearch.toLowerCase())
  );

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

  const isFileType  = isFileMigration(project.migration_type);
  const itemLabel   = isFileType ? 'itens' : 'caixas';
  const itemLabelSg = isFileType ? 'item' : 'caixa';
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
        <div className="flex items-center gap-2 flex-shrink-0">
          {canStart && (
            <button onClick={() => statusMut.mutate('running')} disabled={statusMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
              <Play className="w-3.5 h-3.5" /> Iniciar
            </button>
          )}
          {canSchedule && (
            <button onClick={() => setShowSchedule(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
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
                  <a
                    key={fmt}
                    href={migrationApi.exportReport(projectId, fmt)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setExportMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <FileText className="w-3.5 h-3.5 text-gray-400" /> {label}
                  </a>
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
          { id: 'mailboxes', label: isFileType ? 'Itens' : 'Caixas de Correio', icon: isFileType ? HardDrive : Mail },
          { id: 'logs',      label: 'Logs',              icon: FileText },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Mailboxes tab */}
      {tab === 'mailboxes' && (
        <div className="card">
          <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" value={mbSearch} onChange={e => setMbSearch(e.target.value)}
                placeholder={isFileType ? "Buscar por identificador ou nome..." : "Buscar por e-mail ou nome..."}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button onClick={() => setShowAddMailboxes(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" /> Adicionar
            </button>
          </div>
          {filteredMailboxes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              {isFileType ? <HardDrive className="w-10 h-10 text-gray-300 dark:text-gray-600" /> : <Mail className="w-10 h-10 text-gray-300 dark:text-gray-600" />}
              <p className="text-sm text-gray-500">{isFileType ? 'Nenhum item adicionado ainda.' : 'Nenhuma caixa de correio adicionada ainda.'}</p>
              <button onClick={() => setShowAddMailboxes(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400 hover:text-blue-500">
                <Plus className="w-4 h-4" /> Adicionar {isFileType ? 'itens' : 'caixas'}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto" onClick={() => setMbMenuOpen(null)}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-3 font-medium">{isFileType ? (project.migration_type === 'onedrive_to_onedrive' ? 'Usuário (UPN)' : 'Site ID') : 'Origem'}</th>
                    <th className="px-4 py-3 font-medium">{isFileType ? 'Destino' : 'Destino'}</th>
                    <th className="px-4 py-3 font-medium">Status / Fase</th>
                    <th className="px-4 py-3 font-medium">Progresso</th>
                    <th className="px-4 py-3 font-medium">Verificação</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {filteredMailboxes.map(mb => {
                    const mbCfg = MAILBOX_STATUS[mb.status] || MAILBOX_STATUS.pending;
                    return (
                      <tr key={mb.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 dark:text-gray-200">{mb.source_email}</p>
                          {mb.display_name && <p className="text-xs text-gray-400">{mb.display_name}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{mb.destination_email || '—'}</td>
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
                            onClick={() => setMbMenuOpen(mbMenuOpen === mb.id ? null : mb.id)}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                          {mbMenuOpen === mb.id && (
                            <div
                              className="absolute right-4 top-8 z-20 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1"
                              onClick={e => e.stopPropagation()}
                            >
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
        </div>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className="card divide-y divide-gray-50 dark:divide-gray-800">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500">Nenhum log registrado ainda.</p>
            </div>
          ) : logs.map(log => {
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
      )}

      {showAddMailboxes && <AddMailboxesModal projectId={projectId} migrationType={project.migration_type} onClose={() => setShowAddMailboxes(false)} />}

      {/* Schedule modal */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSchedule(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <CalendarClock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
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
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
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
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-40"
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

const MigrationUpsell = ({ effectivePlan }) => {
  const isEnterprise = effectivePlan === 'enterprise';
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Migration365</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8">
          {isEnterprise
            ? 'Seu plano Enterprise permite adquirir licenças avulsas de migração a R$ 70,00 por usuário. Cada licença inclui e-mail, OneDrive, SharePoint e Teams.'
            : 'Migre caixas de e-mail, OneDrive, SharePoint e Teams para o Microsoft 365. Disponível para planos Enterprise e Enterprise + Migration.'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          {/* Enterprise + Migration bundle */}
          <div className="card p-6 border-2 border-blue-500 dark:border-blue-400 relative">
            <div className="absolute -top-3 left-4 px-2 bg-blue-500 text-white text-xs font-bold rounded-full py-0.5">
              RECOMENDADO
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Infinity className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Enterprise + Migration</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              R$ 4.747<span className="text-base font-normal text-gray-400">/mês</span>
            </p>
            <p className="text-xs text-gray-400 mb-4">R$ 2.497 (Enterprise) + R$ 2.250 (Migration)</p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-6">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> Migrações ilimitadas</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> E-mail + OneDrive + SharePoint + Teams</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> Ideal para MSPs (50+ usuários/mês)</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> Tudo do plano Enterprise incluso</li>
            </ul>
            <a href="/billing" className="block w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg text-center">
              Fazer upgrade
            </a>
          </div>

          {/* Per-license */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-5 h-5 text-purple-500" />
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Licenças Avulsas</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              R$ 70<span className="text-base font-normal text-gray-400">/usuário</span>
            </p>
            <p className="text-xs text-gray-400 mb-4">Requer plano Enterprise ativo</p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-6">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> Pague por usuário migrado</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> Escopo completo por licença</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> Ideal para migrações pontuais</li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> Compre sob demanda</li>
            </ul>
            {isEnterprise ? (
              <p className="text-xs text-center text-gray-400">Compre licenças na página de migração após ativar o acesso</p>
            ) : (
              <a href="/billing" className="block w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg text-center">
                Upgrade para Enterprise
              </a>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Break-even: ~32 usuários/mês. Acima disso, o bundle compensa.
        </p>
      </div>
    </Layout>
  );
};

// ── License Dashboard Panel ──────────────────────────────────────────────────

const LicenseDashboard = ({ licenseSummary }) => {
  const qc = useQueryClient();
  const [showRequest, setShowRequest] = useState(false);
  const [quantity, setQuantity] = useState(10);
  const [notes, setNotes] = useState('');

  const requestMut = useMutation({
    mutationFn: (data) => migrationApi.requestLicenses(data),
    onSuccess: () => {
      setShowRequest(false);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['migration-license-summary'] });
      qc.invalidateQueries({ queryKey: ['migration-license-history'] });
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
              {quantity >= 32 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Dica: com {quantity} licenças, o plano Enterprise + Migration (R$ 2.250/mês ilimitado) pode ser mais vantajoso.
                </p>
              )}
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
  const planLevel = { free: 0, pro: 1, enterprise: 2, enterprise_migration: 3 }[effectivePlan] || 0;

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
    return <MigrationUpsell effectivePlan={effectivePlan} />;
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
            return (
              <div key={project.id}
                className="flex items-center gap-4 p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/m365/migration/${project.id}`)}>
                <div className={`w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0`}>
                  <TypeIcon className={`w-5 h-5 ${typeCfg?.color || 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{project.name}</p>
                    <StatusBadge status={project.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-gray-400">{TYPE_LABELS[project.migration_type]}</p>
                    {project.source_label && <p className="text-xs text-gray-400">· {project.source_label}</p>}
                    <p className="text-xs text-gray-400">· {project.mailbox_count} {isFileMigration(project.migration_type) ? 'itens' : 'caixas'}</p>
                  </div>
                  {project.mailbox_count > 0 && project.status !== 'draft' && (
                    <ProgressBar value={project.progress} className="mt-2 max-w-xs" />
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
