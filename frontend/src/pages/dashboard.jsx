import { useState, useEffect } from 'react';
import { Server, Play, Square, Cloud } from 'lucide-react';
import Layout from '../components/layout/layout';
import StatsCard from '../components/dashboard/statscard';
import EC2Table from '../components/resources/ec2table';
import AzureVMTable from '../components/resources/azurevmtable';
import LoadingSpinner from '../components/common/loadingspinner';
import ErrorMessage from '../components/common/errormessage';
import awsService from '../services/awsservices';
import azureService from '../services/azureservices';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [awsData, setAwsData] = useState(null);
  const [azureData, setAzureData] = useState(null);
  const [selectedCloud, setSelectedCloud] = useState('aws');

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch AWS data
      try {
        const awsInstances = await awsService.listEC2Instances();
        setAwsData(awsInstances);
      } catch (err) {
        console.error('AWS error:', err);
        setAwsData({ success: false, instances: [] });
      }

      // Fetch Azure data
      try {
        const azureVMs = await azureService.listVMs();
        setAzureData(azureVMs);
      } catch (err) {
        console.error('Azure error:', err);
        setAzureData({ success: false, virtual_machines: [] });
      }

    } catch (err) {
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    fetchData(true);
  };

  // Calculate stats
  const totalInstances = 
    (awsData?.total_instances || 0) + 
    (azureData?.total_vms || 0);

  const runningInstances = 
    (awsData?.instances?.filter(i => i.state === 'running').length || 0) +
    (azureData?.virtual_machines?.filter(v => v.power_state === 'running').length || 0);

  const stoppedInstances = totalInstances - runningInstances;

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner text="Carregando recursos..." />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <ErrorMessage message={error} onRetry={fetchData} />
      </Layout>
    );
  }

  return (
    <Layout onRefresh={handleRefresh} refreshing={refreshing}>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total de VMs"
          value={totalInstances}
          icon={Server}
          color="primary"
        />
        <StatsCard
          title="Em Execução"
          value={runningInstances}
          icon={Play}
          color="success"
        />
        <StatsCard
          title="Paradas"
          value={stoppedInstances}
          icon={Square}
          color="danger"
        />
        <StatsCard
          title="Clouds"
          value="2"
          icon={Cloud}
          color="primary"
        />
      </div>

      {/* Cloud Selector */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setSelectedCloud('aws')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            selectedCloud === 'aws'
              ? 'bg-primary text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          AWS ({awsData?.total_instances || 0})
        </button>
        <button
          onClick={() => setSelectedCloud('azure')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            selectedCloud === 'azure'
              ? 'bg-primary text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Azure ({azureData?.total_vms || 0})
        </button>
      </div>

      {/* Resources Table */}
      <div className="card">
        {selectedCloud === 'aws' ? (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Instâncias EC2
              </h2>
              <p className="text-sm text-gray-500">
                Região: {awsData?.region || 'N/A'}
              </p>
            </div>
            <EC2Table
              instances={awsData?.instances || []}
              loading={refreshing}
            />
          </>
        ) : (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Virtual Machines Azure
              </h2>
              <p className="text-sm text-gray-500">
                Subscription: {azureData?.subscription_id?.slice(0, 8) || 'N/A'}...
              </p>
            </div>
            <AzureVMTable
              vms={azureData?.virtual_machines || []}
              loading={refreshing}
            />
          </>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;