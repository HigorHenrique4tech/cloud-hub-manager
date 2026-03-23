import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { OrgWorkspaceProvider } from './contexts/OrgWorkspaceContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { ToastProvider } from './contexts/ToastContext';
import { BackgroundTasksProvider } from './contexts/BackgroundTasksContext';
import Toaster from './components/common/Toaster';
import TaskNotifications from './components/common/TaskNotifications';
import ProtectedRoute from './components/common/ProtectedRoute';
import './styles/index.css';

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
// Only the current route is loaded — all others are fetched on demand.

// Auth (not protected — load eagerly for fast first paint)
import Login from './pages/login';
import Register from './pages/register';

// Core (loaded on demand)
const Dashboard = lazy(() => import('./pages/dashboard'));
const Costs = lazy(() => import('./pages/costs'));
const Settings = lazy(() => import('./pages/settings'));
const Logs = lazy(() => import('./pages/logs'));
const FinOps = lazy(() => import('./pages/FinOps'));
const Schedules = lazy(() => import('./pages/Schedules'));
const Inventory = lazy(() => import('./pages/Inventory'));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'));
const NotificationChannels = lazy(() => import('./pages/NotificationChannels'));

// AWS
const AwsOverview = lazy(() => import('./pages/aws/AwsOverview'));
const AwsEC2 = lazy(() => import('./pages/aws/AwsEC2'));
const AwsS3 = lazy(() => import('./pages/aws/AwsS3'));
const AwsRDS = lazy(() => import('./pages/aws/AwsRDS'));
const AwsLambda = lazy(() => import('./pages/aws/AwsLambda'));
const AwsVPC = lazy(() => import('./pages/aws/AwsVPC'));
const AwsSecurity = lazy(() => import('./pages/aws/AwsSecurity'));
const AwsBackup = lazy(() => import('./pages/aws/AwsBackup'));
const AwsAdvisor = lazy(() => import('./pages/aws/AwsAdvisor'));

// Azure
const AzureOverview = lazy(() => import('./pages/azure/AzureOverview'));
const AzureVMs = lazy(() => import('./pages/azure/AzureVMs'));
const AzureStorage = lazy(() => import('./pages/azure/AzureStorage'));
const AzureVNets = lazy(() => import('./pages/azure/AzureVNets'));
const AzureDatabases = lazy(() => import('./pages/azure/AzureDatabases'));
const AzureAppServices = lazy(() => import('./pages/azure/AzureAppServices'));
const AzureSecurity = lazy(() => import('./pages/azure/AzureSecurity'));
const AzureBackup = lazy(() => import('./pages/azure/AzureBackup'));
const AzureAdvisor = lazy(() => import('./pages/azure/AzureAdvisor'));

// GCP
const GcpOverview = lazy(() => import('./pages/gcp/GcpOverview'));
const GcpComputeEngine = lazy(() => import('./pages/gcp/GcpComputeEngine'));
const GcpStorage = lazy(() => import('./pages/gcp/GcpStorage'));
const GcpCloudSQL = lazy(() => import('./pages/gcp/GcpCloudSQL'));
const GcpFunctions = lazy(() => import('./pages/gcp/GcpFunctions'));
const GcpVPC = lazy(() => import('./pages/gcp/GcpVPC'));
const GcpSecurity = lazy(() => import('./pages/gcp/GcpSecurity'));
const GcpBackup = lazy(() => import('./pages/gcp/GcpBackup'));
const GcpAdvisor = lazy(() => import('./pages/gcp/GcpAdvisor'));

// M365
const M365Dashboard = lazy(() => import('./pages/m365/M365Dashboard'));
const M365SharePoint = lazy(() => import('./pages/m365/SharePoint'));
const M365Exchange = lazy(() => import('./pages/m365/Exchange'));
const M365TeamsAdmin = lazy(() => import('./pages/m365/TeamsAdmin'));
const M365Audit = lazy(() => import('./pages/m365/Audit'));
const GdapManager = lazy(() => import('./pages/m365/GdapManager'));

// Multi-tenant & Admin
const OrgSettings = lazy(() => import('./pages/OrgSettings'));
const WorkspaceSettings = lazy(() => import('./pages/WorkspaceSettings'));
const ManagedOrgsPage = lazy(() => import('./pages/ManagedOrgsPage'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const Billing = lazy(() => import('./pages/Billing'));
const BillingSuccess = lazy(() => import('./pages/BillingSuccess'));
const PlanSelection = lazy(() => import('./pages/PlanSelection'));

// One-time pages
const Onboarding = lazy(() => import('./pages/Onboarding'));
const InviteAccept = lazy(() => import('./pages/InviteAccept'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const VerifyCallback = lazy(() => import('./pages/VerifyCallback'));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));

// ── Route loading fallback ────────────────────────────────────────────────────
const RouteFallback = () => (
  <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-500 dark:text-gray-400">Carregando...</span>
    </div>
  </div>
);

// ── Query client ──────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 120_000,  // 2 min — evita refetch a cada navegação
      gcTime: 600_000,     // 10 min em memória antes de descartar
    },
  },
});

const PR = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <OrgWorkspaceProvider>
              <BrandingProvider>
              <BackgroundTasksProvider>
              <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/auth/google/callback" element={<OAuthCallback provider="google" />} />
                <Route path="/auth/github/callback" element={<OAuthCallback provider="github" />} />
                <Route path="/auth/microsoft/callback" element={<OAuthCallback provider="microsoft" />} />
                <Route path="/invite/:token" element={<InviteAccept />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/verify/:token" element={<VerifyCallback />} />
                <Route path="/select-plan" element={<PR><PlanSelection /></PR>} />
                <Route path="/onboarding" element={<PR><Onboarding /></PR>} />
                <Route path="/" element={<PR><Dashboard /></PR>} />
                {/* AWS */}
                <Route path="/aws" element={<PR><AwsOverview /></PR>} />
                <Route path="/aws/ec2" element={<PR><AwsEC2 /></PR>} />
                <Route path="/aws/s3" element={<PR><AwsS3 /></PR>} />
                <Route path="/aws/rds" element={<PR><AwsRDS /></PR>} />
                <Route path="/aws/lambda" element={<PR><AwsLambda /></PR>} />
                <Route path="/aws/vpc" element={<PR><AwsVPC /></PR>} />
                <Route path="/aws/security" element={<PR><AwsSecurity /></PR>} />
                <Route path="/aws/backup" element={<PR><AwsBackup /></PR>} />
                <Route path="/aws/advisor" element={<PR><AwsAdvisor /></PR>} />
                {/* GCP */}
                <Route path="/gcp" element={<PR><GcpOverview /></PR>} />
                <Route path="/gcp/compute" element={<PR><GcpComputeEngine /></PR>} />
                <Route path="/gcp/storage" element={<PR><GcpStorage /></PR>} />
                <Route path="/gcp/sql" element={<PR><GcpCloudSQL /></PR>} />
                <Route path="/gcp/functions" element={<PR><GcpFunctions /></PR>} />
                <Route path="/gcp/networks" element={<PR><GcpVPC /></PR>} />
                <Route path="/gcp/security" element={<PR><GcpSecurity /></PR>} />
                <Route path="/gcp/backup" element={<PR><GcpBackup /></PR>} />
                <Route path="/gcp/advisor" element={<PR><GcpAdvisor /></PR>} />
                {/* Azure */}
                <Route path="/azure" element={<PR><AzureOverview /></PR>} />
                <Route path="/azure/vms" element={<PR><AzureVMs /></PR>} />
                <Route path="/azure/storage" element={<PR><AzureStorage /></PR>} />
                <Route path="/azure/vnets" element={<PR><AzureVNets /></PR>} />
                <Route path="/azure/databases" element={<PR><AzureDatabases /></PR>} />
                <Route path="/azure/app-services" element={<PR><AzureAppServices /></PR>} />
                <Route path="/azure/security" element={<PR><AzureSecurity /></PR>} />
                <Route path="/azure/backup" element={<PR><AzureBackup /></PR>} />
                <Route path="/azure/advisor" element={<PR><AzureAdvisor /></PR>} />
                {/* Other */}
                <Route path="/costs" element={<PR><Costs /></PR>} />
                <Route path="/finops" element={<PR><FinOps /></PR>} />
                <Route path="/schedules" element={<PR><Schedules /></PR>} />
                <Route path="/notifications" element={<PR><NotificationChannels /></PR>} />
                <Route path="/m365" element={<PR><M365Dashboard /></PR>} />
                <Route path="/m365/sharepoint" element={<PR><M365SharePoint /></PR>} />
                <Route path="/m365/exchange" element={<PR><M365Exchange /></PR>} />
                <Route path="/m365/teams" element={<PR><M365TeamsAdmin /></PR>} />
                <Route path="/m365/audit" element={<PR><M365Audit /></PR>} />
                <Route path="/m365/gdap" element={<PR><GdapManager /></PR>} />
                <Route path="/inventory" element={<PR><Inventory /></PR>} />
                <Route path="/approvals" element={<PR><ApprovalsPage /></PR>} />
                <Route path="/logs" element={<PR><Logs /></PR>} />
                <Route path="/settings" element={<PR><Settings /></PR>} />
                {/* Billing */}
                <Route path="/billing" element={<PR><Billing /></PR>} />
                <Route path="/billing/success" element={<PR><BillingSuccess /></PR>} />
                {/* Multi-tenant settings */}
                <Route path="/org/settings" element={<PR><OrgSettings /></PR>} />
                <Route path="/org/managed" element={<PR><ManagedOrgsPage /></PR>} />
                <Route path="/admin" element={<PR><AdminPanel /></PR>} />
                <Route path="/workspace/settings" element={<PR><WorkspaceSettings /></PR>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
              </BrowserRouter>
              <TaskNotifications />
              </BackgroundTasksProvider>
              </BrandingProvider>
            </OrgWorkspaceProvider>
          </AuthProvider>
          <Toaster />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
