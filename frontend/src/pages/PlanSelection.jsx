import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ArrowRight, Sparkles, ChevronRight, X, Phone, Building2, MessageSquare } from 'lucide-react';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import { useAuth } from '../contexts/AuthContext';
import orgService from '../services/orgService';
import billingService from '../services/billingService';
import adminService from '../services/adminService';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 'R$ 0',
    period: '/mês',
    description: 'Ideal para explorar a plataforma e projetos pessoais.',
    features: [
      '2 Workspaces',
      '3 Contas Cloud',
      '3 Membros por org',
      'AWS, Azure e GCP',
      'Histórico de custos',
    ],
    cta: 'Começar grátis',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'R$ 497',
    period: '/mês',
    description: 'Para equipes que precisam de controle e automação.',
    features: [
      '10 Workspaces',
      '20 Contas Cloud',
      '20 Membros por org',
      'FinOps & otimização de custos',
      'Agendamento de recursos',
      'Logs de auditoria',
    ],
    cta: 'Assinar Pro',
    highlight: true,
    badge: 'Mais popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'R$ 2.497',
    period: '/mês',
    description: 'Para MSPs e empresas com múltiplas organizações.',
    features: [
      'Workspaces Ilimitados',
      'Contas Cloud Ilimitadas',
      'Membros Ilimitados',
      'Orgs gerenciadas (MSP)',
      '5 orgs parceiras inclusas',
      'Suporte dedicado',
    ],
    cta: 'Falar com vendas',
    highlight: false,
  },
];

/* ── Sales Contact Modal ──────────────────────────────────────────────────── */

const SalesModal = ({ onClose, userEmail, orgSlug }) => {
  const [form, setForm] = useState({
    name: '',
    email: userEmail || '',
    company: '',
    phone: '',
    message: '',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    setError('');
    try {
      await adminService.submitLead({ ...form, org_slug: orgSlug });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao enviar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Fale com nosso time de vendas</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="px-5 py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-green-400" />
            </div>
            <h3 className="text-white font-semibold mb-2">Solicitação enviada!</h3>
            <p className="text-slate-400 text-sm mb-5">
              Recebemos sua mensagem. Entraremos em contato em até 24h.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <p className="text-slate-400 text-sm">
              Nos conte mais sobre sua necessidade e entraremos em contato em até 24h.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nome *</label>
                <input
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Seu nome"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">E-mail *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="seu@email.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  <span className="flex items-center gap-1"><Building2 size={10} /> Empresa</span>
                </label>
                <input
                  value={form.company}
                  onChange={set('company')}
                  placeholder="Nome da empresa"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  <span className="flex items-center gap-1"><Phone size={10} /> Telefone</span>
                </label>
                <input
                  value={form.phone}
                  onChange={set('phone')}
                  placeholder="(11) 99999-9999"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                <span className="flex items-center gap-1"><MessageSquare size={10} /> Mensagem</span>
              </label>
              <textarea
                value={form.message}
                onChange={set('message')}
                rows={3}
                placeholder="Conte-nos sobre sua necessidade..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none resize-none"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-600 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !form.name.trim() || !form.email.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Enviar solicitação <ArrowRight size={14} /></>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Main Page ───────────────────────────────────────────────────────────── */

const PlanSelection = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentOrg, refreshOrgs } = useOrgWorkspace();
  const { user } = useAuth();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [enterpriseSent, setEnterpriseSent] = useState(false);

  const inviteToken = searchParams.get('invite');

  const handleSelect = async (planId) => {
    if (planId === 'enterprise') {
      setShowSalesModal(true);
      return;
    }

    if (!currentOrg?.slug) {
      handleSkip();
      return;
    }

    setLoading(planId);
    setError('');
    try {
      if (planId === 'free') {
        await orgService.updatePlan(currentOrg.slug, planId);
        await refreshOrgs();
        if (inviteToken) {
          navigate(`/invite/${inviteToken}`);
        } else {
          navigate('/');
        }
      } else {
        // Paid plan: create checkout via AbacatePay
        const result = await billingService.checkout(currentOrg.slug, planId);
        if (result.payment_url) {
          localStorage.setItem('pending_payment_id', result.payment_id);
          localStorage.setItem('pending_payment_org', currentOrg.slug);
          window.location.href = result.payment_url;
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao processar. Tente novamente.');
    } finally {
      setLoading(null);
    }
  };

  const handleSkip = () => {
    if (inviteToken) {
      navigate(`/invite/${inviteToken}`);
    } else {
      navigate('/');
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)' }}
    >
      {/* Header */}
      <div className="pt-8 pb-2 text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <img src="/logoblack.png" alt="CloudAtlas" className="w-10 h-10 object-contain" />
          <span className="text-2xl font-bold text-white">CloudAtlas</span>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm mb-8">
          <span className="text-slate-500 flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center border border-primary/30">
              <Check className="w-3.5 h-3.5" />
            </span>
            Criar Conta
          </span>
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <span className="text-white flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
              2
            </span>
            Escolher Plano
          </span>
        </div>

        <h1 className="text-3xl font-bold text-white mb-3">Escolha seu plano</h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Comece grátis e escale conforme sua necessidade. Todos os planos incluem acesso a AWS, Azure e GCP.
        </p>
      </div>

      {error && (
        <div className="mx-auto max-w-md px-4">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-200 ${
                plan.highlight
                  ? 'bg-slate-800/80 border-primary shadow-lg shadow-primary/10 scale-[1.02]'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary text-white text-xs font-semibold rounded-full">
                    <Sparkles className="w-3 h-3" />
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                <p className="text-xs text-slate-400">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                {plan.period && (
                  <span className="text-sm text-slate-400">{plan.period}</span>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.id === 'enterprise' && enterpriseSent ? (
                <div className="w-full py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium text-center">
                  ✓ Solicitação enviada! Em breve entraremos em contato.
                </div>
              ) : (
                <button
                  onClick={() => handleSelect(plan.id)}
                  disabled={loading !== null}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
                    plan.highlight
                      ? 'bg-primary text-white hover:bg-primary/90'
                      : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                  }`}
                >
                  {loading === plan.id ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      {plan.cta}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Skip */}
      <div className="pb-8 text-center">
        <button
          onClick={handleSkip}
          className="text-sm text-slate-500 hover:text-slate-300 transition-colors inline-flex items-center gap-1"
        >
          Talvez depois / Pular por enquanto
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {showSalesModal && (
        <SalesModal
          userEmail={user?.email}
          orgSlug={currentOrg?.slug}
          onClose={() => {
            setShowSalesModal(false);
            setEnterpriseSent(true);
          }}
        />
      )}
    </div>
  );
};

export default PlanSelection;
