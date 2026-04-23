import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldOff, X, Mail, MessageCircle, Clock, MailCheck, RefreshCw, CalendarX, ArrowRight } from 'lucide-react';
import authService from '../../services/authService';
import Header from './header';
import Sidebar from './sidebar';
import AzureSecondarySidebar from './AzureSecondarySidebar';
import AwsSecondarySidebar from './AwsSecondarySidebar';
import GcpSecondarySidebar from './GcpSecondarySidebar';
import M365SecondarySidebar from './M365SecondarySidebar';
import TrialBanner from '../common/TrialBanner';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';

const SupportModal = ({ onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div
      className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Contato com o Suporte</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Body */}
      <div className="p-6 space-y-5">
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Olá! Entendemos que pode ser frustrante não conseguir acessar sua conta.
          Nossa equipe está aqui para ajudar — envie um e-mail e resolveremos isso o mais rápido possível.
        </p>

        {/* E-mail card */}
        <a
          href="mailto:suporte@cloudatlas.app.br?subject=Organização%20suspensa%20-%20Solicitação%20de%20reativação"
          className="flex items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors group"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">E-mail de suporte</p>
            <p className="text-sm font-semibold text-primary group-hover:underline">suporte@cloudatlas.app.br</p>
          </div>
        </a>

        {/* Horário */}
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>Atendimento de segunda a sexta, das 9h às 18h (horário de Brasília). Respondemos em até 24h úteis.</span>
        </div>

        {/* Dica */}
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>Dica:</strong> Ao enviar o e-mail, informe o nome da sua organização e o e-mail cadastrado para que possamos localizar sua conta mais rapidamente.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
        <a
          href="mailto:suporte@cloudatlas.app.br?subject=Organização%20suspensa%20-%20Solicitação%20de%20reativação"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Mail className="w-4 h-4" /> Enviar e-mail
        </a>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  </div>
);

const UnverifiedScreen = () => {
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      await authService.resendVerification(user?.email);
      setSent(true);
    } catch {
      setError('Não foi possível reenviar. Tente novamente em instantes.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <MailCheck className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Verifique seu e-mail</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
          Enviamos um link de verificação para <strong className="text-gray-800 dark:text-gray-200">{user?.email}</strong>.
          Acesse sua caixa de entrada e clique no link para liberar o acesso à plataforma.
        </p>

        {sent ? (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
            <MailCheck className="w-4 h-4" /> E-mail reenviado com sucesso!
          </div>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
            {resending ? 'Reenviando...' : 'Reenviar e-mail de verificação'}
          </button>
        )}

        {error && (
          <p className="text-red-500 text-xs">{error}</p>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500 pt-2">
          Não recebeu? Verifique a pasta de spam ou aguarde alguns minutos.
        </p>
      </div>
    </div>
  );
};

const SuspendedScreen = () => {
  const [showSupport, setShowSupport] = useState(false);
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <ShieldOff className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Organização suspensa</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Sua organização foi suspensa pelo administrador da plataforma.
          Entre em contato com o suporte para mais informações.
        </p>
        <button
          onClick={() => setShowSupport(true)}
          className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <MessageCircle className="w-4 h-4" /> Contatar suporte
        </button>
      </div>
      {showSupport && <SupportModal onClose={() => setShowSupport(false)} />}
    </div>
  );
};

const TrialExpiredScreen = ({ org }) => {
  const navigate = useNavigate();
  const [showSupport, setShowSupport] = useState(false);
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-6">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <CalendarX className="w-10 h-10 text-amber-500" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Seu trial expirou</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            O período de avaliação gratuita da organização <strong className="text-gray-700 dark:text-gray-200">{org?.name}</strong> chegou ao fim.
            Para continuar usando o Cloud Atlas, escolha um plano.
          </p>
        </div>

        {/* Plans CTA */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4 text-left shadow-sm">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">O que você perde sem um plano ativo:</p>
          <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
            {[
              'Gerenciamento de recursos AWS, Azure e GCP',
              'Agendamentos e automações',
              'FinOps e análise de custos',
              'Webhooks e integrações',
              'Suporte técnico',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate('/billing')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-colors shadow"
          >
            Ver planos e preços <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSupport(true)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-sm font-medium transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> Falar com suporte
          </button>
        </div>
      </div>
      {showSupport && <SupportModal onClose={() => setShowSupport(false)} />}
    </div>
  );
};

const Layout = ({ children }) => {
  const { pathname } = useLocation();
  const { currentOrg, currentWorkspace, loading } = useOrgWorkspace();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAzurePath = pathname.startsWith('/azure');
  const isAwsPath = pathname.startsWith('/aws');
  const isGcpPath = pathname.startsWith('/gcp');
  const isM365Path = pathname.startsWith('/m365');

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // If user is authenticated but email not verified, show verification screen
  if (!loading && user && !user.is_verified) {
    return <UnverifiedScreen />;
  }

  // If user is authenticated but has no org (all suspended), show blocked screen
  if (!loading && user && !currentOrg) {
    return <SuspendedScreen />;
  }

  // Trial expired: org has_trial, trial is no longer active, plan is still free, and not on billing page
  const trialExpired =
    currentOrg?.trial?.has_trial &&
    !currentOrg?.trial?.trial_active &&
    (currentOrg?.plan_tier || 'free') === 'free';

  if (!loading && trialExpired && pathname !== '/billing') {
    return <TrialExpiredScreen org={currentOrg} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      {/* Skip navigation — visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Pular para o conteúdo principal
      </a>
      <TrialBanner />
      <Header onMenuToggle={() => setSidebarOpen(v => !v)} />
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {isAzurePath && <AzureSecondarySidebar />}
        {isAwsPath && <AwsSecondarySidebar />}
        {isGcpPath && <GcpSecondarySidebar />}
        {isM365Path && <M365SecondarySidebar />}
        <main id="main-content" key={currentWorkspace?.id || 'none'} className="flex-1 px-4 py-6 sm:px-6 sm:py-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
