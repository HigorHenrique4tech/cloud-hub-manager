import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import AzureVMTable from '../../components/resources/azurevmtable';
import ResourceCard from '../../components/resources/resourcecard';
import LoadingSpinner from '../../components/common/loadingspinner';
import ErrorMessage from '../../components/common/errormessage';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import azureService from '../../services/azureservices';

const AzureVMs = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [noCredentials, setNoCredentials] = useState(false);
  const [vms, setVms] = useState([]);
  const [viewType, setViewType] = useState('table');
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').toLowerCase();

  const fetchVMs = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      setNoCredentials(false);
      const data = await azureService.listVMs();
      setVms(data.virtual_machines || []);
    } catch (err) {
      if (err.response?.status === 400) {
        setNoCredentials(true);
      } else {
        setError(err.response?.data?.detail || err.message || 'Erro ao carregar VMs');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchVMs(); }, []);

  const handleStart = async (rg, name) => {
    try {
      setRefreshing(true);
      await azureService.startVM(rg, name);
      await fetchVMs(true);
    } catch (err) {
      setError(`Erro ao iniciar VM: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStop = async (rg, name) => {
    try {
      setRefreshing(true);
      await azureService.stopVM(rg, name);
      await fetchVMs(true);
    } catch (err) {
      setError(`Erro ao parar VM: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = query
    ? vms.filter(v =>
        v.name?.toLowerCase().includes(query) ||
        v.resource_group?.toLowerCase().includes(query) ||
        v.location?.toLowerCase().includes(query)
      )
    : vms;

  if (loading) return <Layout><LoadingSpinner text="Carregando VMs Azure..." /></Layout>;
  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;
  if (error && vms.length === 0) return <Layout><ErrorMessage message={error} onRetry={fetchVMs} /></Layout>;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Azure — Virtual Machines</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {filtered.length} de {vms.length} VM(s){query && ` para "${query}"`}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div className="flex space-x-2">
          <button onClick={() => setViewType('table')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${viewType === 'table' ? 'bg-primary text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600'}`}>
            Tabela
          </button>
          <button onClick={() => setViewType('grid')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${viewType === 'grid' ? 'bg-primary text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600'}`}>
            Grade
          </button>
        </div>
        <button onClick={() => fetchVMs(true)} disabled={refreshing}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p className="text-center py-12 text-gray-500 dark:text-gray-400">Nenhuma VM encontrada</p>
        ) : viewType === 'table' ? (
          <AzureVMTable vms={filtered} onStart={handleStart} onStop={handleStop} loading={refreshing} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(vm => <ResourceCard key={vm.vm_id} resource={vm} type="azure" />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AzureVMs;
