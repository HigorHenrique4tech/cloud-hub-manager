import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldOff, X, Mail, MessageCircle, Clock } from 'lucide-react';
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

  // If user is authenticated but has no org (all suspended), show blocked screen
  if (!loading && user && !currentOrg) {
    return <SuspendedScreen />;
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
