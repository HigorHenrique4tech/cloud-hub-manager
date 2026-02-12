import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
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
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
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
              <Route path="/logs" element={<PR><Logs /></PR>} />
              <Route path="/settings" element={<PR><Settings /></PR>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
