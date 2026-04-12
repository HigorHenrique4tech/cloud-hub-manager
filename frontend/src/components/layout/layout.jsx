import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import Header from './header';
import Sidebar from './sidebar';
import AzureSecondarySidebar from './AzureSecondarySidebar';
import AwsSecondarySidebar from './AwsSecondarySidebar';
import GcpSecondarySidebar from './GcpSecondarySidebar';
import M365SecondarySidebar from './M365SecondarySidebar';
import TrialBanner from '../common/TrialBanner';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';

const SuspendedScreen = () => (
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
      <a href="/support" className="inline-block mt-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
        Contatar suporte
      </a>
    </div>
  </div>
);

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
