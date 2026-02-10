import { useState, useEffect } from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import Layout from '../components/layout/layout';
import AzureVMTable from '../components/resources/azurevmtable';
import ResourceCard from '../components/resources/resourcecard';
import LoadingSpinner from '../components/common/loadingspinner';
import ErrorMessage from '../components/common/errormessage';
import azureService from '../services/azureservices';

const Azure = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [vms, setVms] = useState([]);
  const [viewType, setViewType] = useState('table'); // 'table' or 'grid'

  const fetchVMs = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const data = await azureService.listVMs();
      setVms(data.virtual_machines || []);
    } catch (err) {
      console.error('Azure error:', err);
      setError(err.message || 'Erro ao carregar VMs Azure');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVMs();
  }, []);

  const handleRefresh = () => {
    fetchVMs(true);
  };

  const handleStart = async (resourceGroup, vmName) => {
    try {
      setRefreshing(true);
      await azureService.startVM(resourceGroup, vmName);
      await fetchVMs(true);
    } catch (err) {
      setError(`Erro ao iniciar VM: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStop = async (resourceGroup, vmName) => {
    try {
      setRefreshing(true);
      await azureService.stopVM(resourceGroup, vmName);
      await fetchVMs(true);
    } catch (err) {
      setError(`Erro ao parar VM: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner text="Carregando VMs Azure..." />
      </Layout>
    );
  }

  if (error && vms.length === 0) {
    return (
      <Layout>
        <ErrorMessage message={error} onRetry={fetchVMs} />
      </Layout>
    );
  }

  return (
    <Layout onRefresh={handleRefresh} refreshing={refreshing}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Azure - Virtual Machines</h1>
        <p className="text-gray-600">
          Gerencie suas VMs Azure (Total: {vms.length})
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex space-x-2">
          <button
            onClick={() => setViewType('table')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewType === 'table'
                ? 'bg-primary text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            Tabela
          </button>
          <button
            onClick={() => setViewType('grid')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewType === 'grid'
                ? 'bg-primary text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            Grade
          </button>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary hover:bg-primary-dark disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Content */}
      <div className="card">
        {vms.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Nenhuma VM Azure encontrada</p>
          </div>
        ) : viewType === 'table' ? (
          <AzureVMTable
            vms={vms}
            onStart={handleStart}
            onStop={handleStop}
            loading={refreshing}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vms.map((vm) => (
              <ResourceCard
                key={vm.vm_id}
                resource={vm}
                type="azure"
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Azure;
