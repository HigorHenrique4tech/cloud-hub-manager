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
  const isAzurePath = pathname.startsWith('/azure');
  const isAwsPath = pathname.startsWith('/aws');
  const isGcpPath = pathname.startsWith('/gcp');
  const isM365Path = pathname.startsWith('/m365');

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      <TrialBanner />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {isAzurePath && <AzureSecondarySidebar />}
        {isAwsPath && <AwsSecondarySidebar />}
        {isGcpPath && <GcpSecondarySidebar />}
        {isM365Path && <M365SecondarySidebar />}
        <main key={currentWorkspace?.id || 'none'} className="flex-1 px-6 py-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
