import { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ArrowRight, Sparkles, ChevronRight, X, Phone, Building2, MessageSquare } from 'lucide-react';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import Logo from '../components/common/Logo';
import { useAuth } from '../contexts/AuthContext';
import orgService from '../services/orgService';
import billingService from '../services/billingService';
import adminService from '../services/adminService';

const plans = [
  {
    id: 'basic',
    name: 'Basic',
    price: 'R$ 397',
    period: '/mês',
    description: 'Para startups e pequenas equipes.',
    features: [
      '5 Workspaces',
      '10 Contas Cloud',
      '3 Membros por org',
      'Dashboard multi-cloud',
      'Visão de custos',
      'Inventário de recursos',
      'Segurança',
    ],
    cta: 'Assinar Basic',
    highlight: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 'R$ 797',
    period: '/mês',
    description: 'Para empresas em crescimento.',
    features: [
      '25 Workspaces',
      'Contas Cloud Ilimitadas',
      '10 Membros por org',
      'Todas as funcionalidades +',
      'Relatórios PDF agendados',
      'Webhooks ilimitados',
      'Automações avançadas',
      'Suporte prioritário',
    ],
    cta: 'Assinar Standard',
    highlight: false,
  },
  {
    id: 'enterprise_e1',
    name: 'Enterprise E1',
    price: 'R$ 2.997',
    period: '/mês',
    description: 'Base enterprise: 50 WS • 20 usuários',
    features: [
      '50 Workspaces + 20 usuários inclusos',
      'Contas Cloud Ilimitadas',
      'Tudo do Standard +',
      'White Label completo',
      'Gestão de Parceiros (MSP)',
      'Multi-tenant nativo (MSP)',
      'Branding por parceiro',
      'Add-ons: R$ 60/WS, R$ 159/usuário',
    ],
    cta: 'Assinar E1',
    highlight: true,
    badge: 'Mais popular',
  },
  {
    id: 'enterprise_e2',
    name: 'Enterprise E2',
    price: null,
    period: null,
    description: 'Escala média: 100 WS • 40 usuários',
    features: [
      '100 Workspaces + 40 usuários inclusos',
      'Contas Cloud Ilimitadas',
      'Tudo do E1 +',
      'Economia: -17% por workspace',
      'Ideal para MSPs em crescimento',
      'Suporte dedicado + migração',
      'Add-ons: R$ 60/WS, R$ 159/usuário',
    ],
    cta: 'Falar com vendas',
    highlight: false,
    salesContact: true,
  },
  {
    id: 'enterprise_e3',
    name: 'Enterprise E3',
    price: null,
    period: null,
    description: 'Escala grande: 200 WS • 80 usuários',
    features: [
      '200 Workspaces + 80 usuários inclusos',
      'Contas Cloud Ilimitadas',
      'Tudo do E2 +',
      'Economia: -33% por workspace',
      'Ideal para MSPs enterprise',
      'SLA 99.9% + suporte 24/7',
      'Add-ons: R$ 60/WS, R$ 159/usuário',
    ],
    cta: 'Falar com vendas',
    highlight: false,
    badge: 'Melhor para MSPs',
    salesContact: true,
  },
];

/* ── Sales Contact Modal ──────────────────────────────────────────────────── */

const SalesModal = ({ onClose, userEmail, orgSlug }) => {
  useEscapeKey(true, onClose);
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
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Fale com nosso time de vendas</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="px-5 py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-green-400" />
            </div>
            <h3 className="text-white font-semibold mb-2">Solicitação enviada!</h3>
            <p className="text-gray-400 text-sm mb-5">
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
            <p className="text-gray-400 text-sm">
              Nos conte mais sobre sua necessidade e entraremos em contato em até 24h.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Nome *</label>
                <input
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Seu nome"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">E-mail *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="seu@email.com"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  <span className="flex items-center gap-1"><Building2 size={10} /> Empresa</span>
                </label>
                <input
                  value={form.company}
                  onChange={set('company')}
                  placeholder="Nome da empresa"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  <span className="flex items-center gap-1"><Phone size={10} /> Telefone</span>
                </label>
                <input
                  value={form.phone}
                  onChange={set('phone')}
                  placeholder="(11) 99999-9999"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                <span className="flex items-center gap-1"><MessageSquare size={10} /> Mensagem</span>
              </label>
              <textarea
                value={form.message}
                onChange={set('message')}
                rows={3}
                placeholder="Conte-nos sobre sua necessidade..."
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none resize-none"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-600 text-sm text-gray-300 hover:text-white transition-colors"
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
    if (planId === 'enterprise' || planId === 'enterprise_migration') {
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
      // Paid plan: create checkout via AbacatePay
      const result = await billingService.checkout(currentOrg.slug, planId);
      if (result.payment_url) {
        localStorage.setItem('pending_payment_id', result.payment_id);
        localStorage.setItem('pending_payment_org', currentOrg.slug);
        window.location.href = result.payment_url;
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
        <div className="flex items-center justify-center mb-6">
          <Logo size="lg" variant="light" />
        </div>

        <div className="flex items-center justify-center gap-2 text-sm mb-8">
          <span className="text-gray-500 flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center border border-primary/30">
              <Check className="w-3.5 h-3.5" />
            </span>
            Criar Conta
          </span>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <span className="text-white flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
              2
            </span>
            Escolher Plano
          </span>
        </div>

        <h1 className="text-3xl font-bold text-white mb-3">Escolha seu plano</h1>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Escale conforme sua necessidade. Todos os planos incluem acesso a AWS, Azure e GCP.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 max-w-7xl w-full">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-5 flex flex-col transition-all duration-200 ${
                plan.highlight
                  ? 'bg-gray-800/80 border-primary shadow-lg shadow-primary/10 scale-[1.02]'
                  : 'bg-gray-800/50 border-gray-700 hover:border-gray-500'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary text-white text-xs font-semibold rounded-full">
                    <Sparkles className="w-3 h-3" />
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-3">
                <h3 className="text-base font-semibold text-white mb-1">{plan.name}</h3>
                <p className="text-xs text-gray-400 leading-snug">{plan.description}</p>
              </div>

              <div className="mb-4">
                {plan.price ? (
                  <>
                    <span className="text-2xl font-bold text-white">{plan.price}</span>
                    {plan.period && (
                      <span className="text-xs text-gray-400">{plan.period}</span>
                    )}
                  </>
                ) : (
                  <span className="text-lg font-semibold text-blue-400">Sob consulta</span>
                )}
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-gray-300">
                    <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.salesContact ? (
                <a
                  href={`https://wa.me/5511969160623?text=Ol%C3%A1%2C%20tenho%20interesse%20no%20plano%20${encodeURIComponent(plan.name)}%20do%20CloudAtlas%20e%20gostaria%20de%20saber%20mais!`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm bg-green-600 text-white hover:bg-green-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  Falar com vendas
                </a>
              ) : plan.id === 'enterprise' && enterpriseSent ? (
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
                      : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
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
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1"
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
