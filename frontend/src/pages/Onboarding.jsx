import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Cloud, ChevronRight, ArrowRight, Loader2, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import authService from '../services/authService';
import orgService from '../services/orgService';

// ── Provider config ───────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: 'aws',
    label: 'Amazon Web Services',
    short: 'AWS',
    color: 'border-orange-400 bg-orange-50 dark:bg-orange-900/20',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    icon: '🟠',
    fields: ['access_key_id', 'secret_access_key', 'region'],
  },
  {
    id: 'azure',
    label: 'Microsoft Azure',
    short: 'Azure',
    color: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    icon: '🔵',
    fields: ['subscription_id', 'tenant_id', 'client_id', 'client_secret'],
  },
  {
    id: 'gcp',
    label: 'Google Cloud Platform',
    short: 'GCP',
    color: 'border-green-400 bg-green-50 dark:bg-green-900/20',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    icon: '🟢',
    fields: ['project_id', 'client_email', 'private_key_id', 'private_key'],
  },
  {
    id: 'm365',
    label: 'Microsoft 365',
    short: 'M365',
    color: 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20',
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    icon: '🟣',
    fields: ['tenant_id', 'client_id', 'client_secret'],
  },
];

const FIELD_LABELS = {
  access_key_id: 'Access Key ID',
  secret_access_key: 'Secret Access Key',
  region: 'Região (ex: us-east-1)',
  subscription_id: 'Subscription ID',
  tenant_id: 'Tenant ID',
  client_id: 'Client ID',
  client_secret: 'Client Secret',
  project_id: 'Project ID',
  client_email: 'Client Email',
  private_key_id: 'Private Key ID',
  private_key: 'Private Key',
};

const STEP_LABELS = ['Bem-vindo', 'Provider', 'Credenciais', 'Concluído'];

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ step }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEP_LABELS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
              i < step
                ? 'bg-green-500 border-green-500 text-white'
                : i === step
                  ? 'bg-primary border-primary text-white'
                  : 'border-gray-300 dark:border-slate-600 text-gray-400 dark:text-slate-500'
            }`}>
              {i < step ? <CheckCircle2 size={16} /> : i + 1}
            </div>
            <span className={`mt-1 text-xs font-medium ${
              i <= step ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500'
            }`}>{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`w-12 h-0.5 mb-5 mx-1 transition-colors ${
              i < step ? 'bg-green-500' : 'bg-gray-200 dark:bg-slate-700'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { user, setUser } = useAuth();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState([]);

  const providerConfig = PROVIDERS.find(p => p.id === selectedProvider);

  const finishOnboarding = async () => {
    try {
      const updated = await authService.markOnboardingComplete();
      setUser(updated);
    } catch {
      // Non-fatal — proceed regardless
    }
    navigate('/');
  };

  const handleSkipAll = () => finishOnboarding();

  const handleConnect = async () => {
    if (!currentOrg?.slug || !currentWorkspace?.id) {
      setError('Workspace não encontrado. Tente novamente ou pule esta etapa.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const account = await orgService.createAccount(currentOrg.slug, currentWorkspace.id, {
        provider: selectedProvider,
        label: 'default',
        data: formData,
      });
      // Test the connection
      await orgService.testAccount(currentOrg.slug, currentWorkspace.id, account.id);
      setConnected(prev => [...prev, selectedProvider]);
      setFormData({});
      setStep(3);
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Erro ao conectar. Verifique as credenciais e tente novamente.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Step 0 — Welcome ────────────────────────────────────────────────────────
  const renderStep0 = () => (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Cloud className="w-8 h-8 text-primary" />
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
          Olá, {user?.name?.split(' ')[0]}! 👋
        </h1>
        <p className="mt-2 text-gray-500 dark:text-slate-400 text-sm leading-relaxed">
          Bem-vindo ao <strong className="text-gray-700 dark:text-slate-200">Cloud Hub Manager</strong>.
          Vamos conectar sua primeira conta cloud para você começar a monitorar custos, recursos e segurança em um só lugar.
        </p>
      </div>
      <div className="space-y-3 pt-2">
        <button
          onClick={() => setStep(1)}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          Começar configuração
          <ArrowRight size={16} />
        </button>
        <button
          onClick={handleSkipAll}
          className="w-full text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
        >
          Pular e ir ao dashboard
        </button>
      </div>
    </div>
  );

  // ── Step 1 — Choose provider ────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Escolha um provider</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Selecione a plataforma cloud para conectar primeiro.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => { setSelectedProvider(p.id); setFormData({}); setError(null); setStep(2); }}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all hover:scale-[1.02] ${p.color}`}
          >
            <span className="text-2xl">{p.icon}</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-slate-100">{p.short}</span>
            <span className="text-xs text-gray-500 dark:text-slate-400 leading-tight">{p.label}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => setStep(3)}
        className="w-full text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
      >
        Pular por agora
      </button>
    </div>
  );

  // ── Step 2 — Credentials form ───────────────────────────────────────────────
  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
          Conectar {providerConfig?.label}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Insira as credenciais de acesso da sua conta.
        </p>
      </div>

      <div className="space-y-3">
        {providerConfig?.fields.map(field => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
              {FIELD_LABELS[field] || field}
            </label>
            {field === 'private_key' ? (
              <textarea
                rows={4}
                value={formData[field] || ''}
                onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                placeholder={'-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----'}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-gray-900 dark:text-slate-100 resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            ) : (
              <input
                type={field.includes('secret') || field.includes('key') || field.includes('password') ? 'password' : 'text'}
                value={formData[field] || ''}
                onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2 pt-1">
        <button
          onClick={handleConnect}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <><Loader2 size={15} className="animate-spin" /> Conectando...</>
          ) : (
            <><ChevronRight size={15} /> Conectar e verificar</>
          )}
        </button>
        <button
          onClick={() => { setError(null); setStep(1); }}
          className="w-full text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
        >
          ← Voltar
        </button>
      </div>
    </div>
  );

  // ── Step 3 — Done ───────────────────────────────────────────────────────────
  const renderStep3 = () => (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Tudo pronto!</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
          {connected.length > 0
            ? 'Sua conta cloud foi conectada com sucesso.'
            : 'Você pode conectar suas clouds a qualquer momento em Configurações do Workspace.'}
        </p>
      </div>

      {connected.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {connected.map(pid => {
            const p = PROVIDERS.find(x => x.id === pid);
            return (
              <span key={pid} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${p?.badge}`}>
                {p?.icon} {p?.short} conectado
              </span>
            );
          })}
        </div>
      )}

      <div className="space-y-2 pt-1">
        <button
          onClick={() => { setSelectedProvider(null); setFormData({}); setError(null); setStep(1); }}
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
        >
          Conectar outra cloud
        </button>
        <button
          onClick={finishOnboarding}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          Ir ao Dashboard
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );

  const STEPS = [renderStep0, renderStep1, renderStep2, renderStep3];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-800 p-8">
          <Stepper step={step} />
          {STEPS[step]?.()}
        </div>

        {/* Skip link (steps 1 and 2 only) */}
        {step > 0 && step < 3 && (
          <p className="mt-4 text-center text-xs text-gray-400 dark:text-slate-600">
            Você pode configurar isso depois em{' '}
            <button
              onClick={handleSkipAll}
              className="underline hover:text-gray-600 dark:hover:text-slate-400 transition-colors"
            >
              Configurações do Workspace
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
