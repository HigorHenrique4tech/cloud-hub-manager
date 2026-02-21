import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { OrgWorkspaceProvider } from './contexts/OrgWorkspaceContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Dashboard from './pages/dashboard';
import Costs from './pages/costs';
import Settings from './pages/settings';
import Login from './pages/login';
import Register from './pages/register';
// Azure
import AzureOverview from './pages/azure/AzureOverview';
import AzureVMs from './pages/azure/AzureVMs';
import AzureStorage from './pages/azure/AzureStorage';
import AzureVNets from './pages/azure/AzureVNets';
import AzureDatabases from './pages/azure/AzureDatabases';
import AzureAppServices from './pages/azure/AzureAppServices';
// AWS
import AwsOverview from './pages/aws/AwsOverview';
import AwsEC2 from './pages/aws/AwsEC2';
import AwsS3 from './pages/aws/AwsS3';
import AwsRDS from './pages/aws/AwsRDS';
import AwsLambda from './pages/aws/AwsLambda';
import AwsVPC from './pages/aws/AwsVPC';
import Logs from './pages/logs';
import FinOps from './pages/FinOps';
import Schedules from './pages/Schedules';
// Multi-tenant
import OrgSettings from './pages/OrgSettings';
import WorkspaceSettings from './pages/WorkspaceSettings';
import InviteAccept from './pages/InviteAccept';
import PlanSelection from './pages/PlanSelection';
import VerifyEmail from './pages/VerifyEmail';
import VerifyCallback from './pages/VerifyCallback';
import Billing from './pages/Billing';
import BillingSuccess from './pages/BillingSuccess';
import OAuthCallback from './pages/OAuthCallback';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

const PR = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <OrgWorkspaceProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/auth/google/callback" element={<OAuthCallback provider="google" />} />
                <Route path="/auth/github/callback" element={<OAuthCallback provider="github" />} />
                <Route path="/invite/:token" element={<InviteAccept />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/verify/:token" element={<VerifyCallback />} />
                <Route path="/select-plan" element={<PR><PlanSelection /></PR>} />
                <Route path="/" element={<PR><Dashboard /></PR>} />
                {/* AWS */}
                <Route path="/aws" element={<PR><AwsOverview /></PR>} />
                <Route path="/aws/ec2" element={<PR><AwsEC2 /></PR>} />
                <Route path="/aws/s3" element={<PR><AwsS3 /></PR>} />
                <Route path="/aws/rds" element={<PR><AwsRDS /></PR>} />
                <Route path="/aws/lambda" element={<PR><AwsLambda /></PR>} />
                <Route path="/aws/vpc" element={<PR><AwsVPC /></PR>} />
                {/* Azure */}
                <Route path="/azure" element={<PR><AzureOverview /></PR>} />
                <Route path="/azure/vms" element={<PR><AzureVMs /></PR>} />
                <Route path="/azure/storage" element={<PR><AzureStorage /></PR>} />
                <Route path="/azure/vnets" element={<PR><AzureVNets /></PR>} />
                <Route path="/azure/databases" element={<PR><AzureDatabases /></PR>} />
                <Route path="/azure/app-services" element={<PR><AzureAppServices /></PR>} />
                {/* Other */}
                <Route path="/costs" element={<PR><Costs /></PR>} />
                <Route path="/finops" element={<PR><FinOps /></PR>} />
                <Route path="/schedules" element={<PR><Schedules /></PR>} />
                <Route path="/logs" element={<PR><Logs /></PR>} />
                <Route path="/settings" element={<PR><Settings /></PR>} />
                {/* Billing */}
                <Route path="/billing" element={<PR><Billing /></PR>} />
                <Route path="/billing/success" element={<PR><BillingSuccess /></PR>} />
                {/* Multi-tenant settings */}
                <Route path="/org/settings" element={<PR><OrgSettings /></PR>} />
                <Route path="/workspace/settings" element={<PR><WorkspaceSettings /></PR>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </OrgWorkspaceProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
