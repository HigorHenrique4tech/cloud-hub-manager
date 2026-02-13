import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ArrowRight, Sparkles, Building2, ChevronRight } from 'lucide-react';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import orgService from '../services/orgService';

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
      '30 dias histórico custos',
      'Monitoramento básico',
    ],
    cta: 'Começar grátis',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'R$ 199',
    period: '/mês',
    description: 'Para equipes que precisam de controle e automação.',
    features: [
      '10 Workspaces',
      '20 Contas Cloud',
      'Automação de alertas',
      'Análise de anomalias',
      'Exportação de relatórios',
    ],
    cta: 'Assinar Pro',
    highlight: true,
    badge: 'Mais popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    description: 'Para grandes organizações com necessidades avançadas.',
    features: [
      'Workspaces Ilimitados',
      'Contas Cloud Ilimitadas',
      'API & Webhooks',
      'SSO / SAML',
      'Suporte dedicado',
    ],
    cta: 'Falar com vendas',
    highlight: false,
  },
];

const PlanSelection = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentOrg, refreshOrgs } = useOrgWorkspace();
  const [loading, setLoading] = useState(null);

  const inviteToken = searchParams.get('invite');

  const handleSelect = async (planId) => {
    if (planId === 'enterprise') {
      // For enterprise, just skip to dashboard (contact sales flow not implemented)
      handleSkip();
      return;
    }

    if (!currentOrg?.slug) {
      handleSkip();
      return;
    }

    setLoading(planId);
    try {
      await orgService.updatePlan(currentOrg.slug, planId);
      await refreshOrgs();
      if (inviteToken) {
        navigate(`/invite/${inviteToken}`);
      } else {
        navigate('/');
      }
    } catch {
      // If plan update fails, just go to dashboard
      if (inviteToken) {
        navigate(`/invite/${inviteToken}`);
      } else {
        navigate('/');
      }
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
          <img src="/logo.png" alt="CloudAtlas" className="w-10 h-10 object-contain" />
          <span className="text-2xl font-bold text-white">CloudAtlas</span>
        </div>

        {/* Steps indicator */}
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
          Comece grátis e escale conforme sua necessidade. Todos os planos incluem acesso a AWS e Azure.
        </p>
      </div>

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
    </div>
  );
};

export default PlanSelection;
