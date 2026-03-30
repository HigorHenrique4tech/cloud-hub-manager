import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft, Plus, Trash2, Play, Pause, RefreshCw, X,
  CheckCircle, XCircle, Clock, AlertCircle, ChevronRight,
  Mail, Users, BarChart3, FileText, ArrowLeft, Upload,
  Globe, Server, Building2, Wifi, Search, ShieldCheck, GitMerge,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import api, { wsUrl } from '../../services/api';

// ── Service helpers ───────────────────────────────────────────────────────────

const migrationApi = {
  listProjects:    ()           => api.get(wsUrl('/migration/projects')).then(r => r.data),
  createProject:   (data)       => api.post(wsUrl('/migration/projects'), data).then(r => r.data),
  getProject:      (id)         => api.get(wsUrl(`/migration/projects/${id}`)).then(r => r.data),
  getStats:        (id)         => api.get(wsUrl(`/migration/projects/${id}/stats`)).then(r => r.data),
  deleteProject:   (id)         => api.delete(wsUrl(`/migration/projects/${id}`)),
  setStatus:       (id, status) => api.post(wsUrl(`/migration/projects/${id}/status`), { status }).then(r => r.data),
  verify:          (id)         => api.post(wsUrl(`/migration/projects/${id}/verify`)).then(r => r.data),
  deltaSync:       (id)         => api.post(wsUrl(`/migration/projects/${id}/delta`)).then(r => r.data),
  listMailboxes:   (id)         => api.get(wsUrl(`/migration/projects/${id}/mailboxes`)).then(r => r.data),
  addMailboxes:    (id, data)   => api.post(wsUrl(`/migration/projects/${id}/mailboxes`), data).then(r => r.data),
  deleteMailbox:   (pid, mid)   => api.delete(wsUrl(`/migration/projects/${pid}/mailboxes/${mid}`)),
  listLogs:        (id)         => api.get(wsUrl(`/migration/projects/${id}/logs`)).then(r => r.data),
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MIGRATION_TYPES = [
  { id: 'google_workspace',  label: 'Google Workspace',     icon: Globe,     desc: 'Gmail, Google Calendar, Contatos → M365', color: 'text-blue-500' },
  { id: 'exchange_onprem',   label: 'Exchange On-Premises', icon: Server,    desc: 'Exchange 2013/2016/2019 → Exchange Online', color: 'text-orange-500' },
  { id: 'tenant_to_tenant',  label: 'M365 Tenant → Tenant', icon: Building2, desc: 'De um tenant M365 para outro', color: 'text-purple-500' },
  { id: 'imap',              label: 'IMAP Genérico',        icon: Wifi,      desc: 'Yahoo, Outlook.com, Zoho e outros servidores IMAP', color: 'text-green-500' },
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
  google_workspace: 'Google Workspace',
  exchange_onprem:  'Exchange On-Premises',
  tenant_to_tenant: 'M365 Tenant → Tenant',
  imap:             'IMAP Genérico',
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
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Selecione o tipo de migração para este projeto.</p>
              {MIGRATION_TYPES.map(({ id, label, icon: Icon, desc, color }) => (
                <button
                  key={id}
                  onClick={() => setForm(p => ({ ...p, migration_type: id }))}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                    form.migration_type === id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0`}>
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
                        onChange={e => setSrcFields(p => ({ ...p, [field.key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Ativado</span>
                    </label>
                  ) : field.multiline ? (
                    <textarea
                      rows={5}
                      value={srcFields[field.key] || ''}
                      onChange={e => setSrcFields(p => ({ ...p, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
                    />
                  ) : (
                    <input
                      type={field.type || 'text'}
                      value={srcFields[field.key] || ''}
                      onChange={e => setSrcFields(p => ({ ...p, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              ))}
              <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
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

const AddMailboxesModal = ({ projectId, onClose }) => {
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState('');

  const parse = () => {
    setError('');
    const lines = input.trim().split('\n').filter(l => l.trim());
    const entries = lines.map(line => {
      const parts = line.split(',').map(p => p.trim());
      return { source_email: parts[0], destination_email: parts[1] || '', display_name: parts[2] || '' };
    }).filter(e => e.source_email.includes('@'));
    if (!entries.length) { setError('Nenhum e-mail válido encontrado.'); return; }
    setParsed(entries);
  };

  const addMut = useMutation({
    mutationFn: () => migrationApi.addMailboxes(projectId, { mailboxes: parsed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migration-mailboxes', projectId] });
      qc.invalidateQueries({ queryKey: ['migration-project', projectId] });
      qc.invalidateQueries({ queryKey: ['migration-projects'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Adicionar Caixas de Correio</p>
            <p className="text-xs text-gray-500">Uma por linha: email_origem, email_destino, nome (opcional)</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <textarea
            rows={8}
            value={input}
            onChange={e => { setInput(e.target.value); setParsed([]); }}
            placeholder={"joao@origem.com, joao@empresa.com, João Silva\nmaria@origem.com, maria@empresa.com\npedro@origem.com"}
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          {parsed.length > 0 && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-xs text-green-700 dark:text-green-300 font-medium">{parsed.length} caixa(s) prontas para adicionar</p>
            </div>
          )}
          {addMut.isError && (
            <p className="text-xs text-red-500">{addMut.error?.response?.data?.detail || 'Erro ao adicionar.'}</p>
          )}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">Cancelar</button>
          {!parsed.length ? (
            <button onClick={parse} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium rounded-lg">
              <Search className="w-4 h-4" /> Analisar
            </button>
          ) : (
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40">
              {addMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar {parsed.length} caixa(s)
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

  const canStart   = ['draft', 'ready', 'paused'].includes(project.status);
  const canPause   = project.status === 'running';
  const canDelete  = project.status !== 'running';
  const canVerify  = ['completed', 'failed'].includes(project.status);
  const canDelta   = project.status === 'completed';

  return (
    <Layout>
      {/* Back + header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mt-0.5">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{project.name}</h1>
            <StatusBadge status={project.status} />
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
            <span>{project.completed_count}/{project.mailbox_count} caixas</span>
          </div>
          <ProgressBar value={project.progress} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {[
          { id: 'mailboxes', label: 'Caixas de Correio', icon: Mail },
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
                placeholder="Buscar por e-mail ou nome..."
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
              <Mail className="w-10 h-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500">Nenhuma caixa de correio adicionada ainda.</p>
              <button onClick={() => setShowAddMailboxes(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400 hover:text-blue-500">
                <Plus className="w-4 h-4" /> Adicionar caixas
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-3 font-medium">Origem</th>
                    <th className="px-4 py-3 font-medium">Destino</th>
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
                            <div className="w-24">
                              <ProgressBar value={mb.progress} />
                              <p className="text-xs text-gray-400 mt-1">{mb.items_migrated}/{mb.items_total}</p>
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
                        <td className="px-4 py-3 text-right">
                          {canDelete && (
                            <button onClick={() => setToDeleteMb(mb)}
                              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

      {showAddMailboxes && <AddMailboxesModal projectId={projectId} onClose={() => setShowAddMailboxes(false)} />}

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

// ── Main page ─────────────────────────────────────────────────────────────────

const Migration365 = () => {
  const { projectId } = useParams();
  const navigate      = useNavigate();
  const qc            = useQueryClient();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const [showWizard, setShowWizard] = useState(false);
  const [toDelete, setToDelete]     = useState(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['migration-projects'],
    queryFn: migrationApi.listProjects,
    enabled: !!currentOrg && !!currentWorkspace,
    retry: false,
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => migrationApi.deleteProject(id),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['migration-projects'] });
    },
  });

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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Migração 365</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Migre caixas de correio e dados para o Microsoft 365
          </p>
        </div>
        <button onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
          <Plus className="w-4 h-4" /> Novo Projeto
        </button>
      </div>

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
                    <p className="text-xs text-gray-400">· {project.mailbox_count} caixas</p>
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
