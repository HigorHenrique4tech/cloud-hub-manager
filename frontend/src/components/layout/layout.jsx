import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './header';
import Sidebar from './sidebar';
import AzureSecondarySidebar from './AzureSecondarySidebar';
import AwsSecondarySidebar from './AwsSecondarySidebar';
import GcpSecondarySidebar from './GcpSecondarySidebar';
import M365SecondarySidebar from './M365SecondarySidebar';
import TrialBanner from '../common/TrialBanner';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';

const Layout = ({ children }) => {
  const { pathname } = useLocation();
  const { currentWorkspace } = useOrgWorkspace();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAzurePath = pathname.startsWith('/azure');
  const isAwsPath = pathname.startsWith('/aws');
  const isGcpPath = pathname.startsWith('/gcp');
  const isM365Path = pathname.startsWith('/m365');

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
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
        <main key={currentWorkspace?.id || 'none'} className="flex-1 px-4 py-6 sm:px-6 sm:py-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
