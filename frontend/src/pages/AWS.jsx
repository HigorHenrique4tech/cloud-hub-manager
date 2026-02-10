import { useState, useEffect } from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import Layout from '../components/layout/layout';
import EC2Table from '../components/resources/ec2table';
import ResourceCard from '../components/resources/resourcecard';
import LoadingSpinner from '../components/common/loadingspinner';
import ErrorMessage from '../components/common/errormessage';
import awsService from '../services/awsservices';

const AWS = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [instances, setInstances] = useState([]);
  const [viewType, setViewType] = useState('table'); // 'table' or 'grid'

  const fetchInstances = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const data = await awsService.listEC2Instances();
      setInstances(data.instances || []);
    } catch (err) {
      console.error('AWS error:', err);
      setError(err.message || 'Erro ao carregar instâncias EC2');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, []);

  const handleRefresh = () => {
    fetchInstances(true);
  };

  const handleStart = async (instanceId) => {
    try {
      setRefreshing(true);
      await awsService.startEC2Instance(instanceId);
      await fetchInstances(true);
    } catch (err) {
      setError(`Erro ao iniciar instância: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStop = async (instanceId) => {
    try {
      setRefreshing(true);
      await awsService.stopEC2Instance(instanceId);
      await fetchInstances(true);
    } catch (err) {
      setError(`Erro ao parar instância: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner text="Carregando instâncias EC2..." />
      </Layout>
    );
  }

  if (error && instances.length === 0) {
    return (
      <Layout>
        <ErrorMessage message={error} onRetry={fetchInstances} />
      </Layout>
    );
  }

  return (
    <Layout onRefresh={handleRefresh} refreshing={refreshing}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AWS - EC2</h1>
        <p className="text-gray-600">
          Gerencie suas instâncias EC2 (Total: {instances.length})
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
        {instances.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Nenhuma instância EC2 encontrada</p>
          </div>
        ) : viewType === 'table' ? (
          <EC2Table
            instances={instances}
            onStart={handleStart}
            onStop={handleStop}
            loading={refreshing}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {instances.map((instance) => (
              <ResourceCard
                key={instance.instance_id}
                resource={instance}
                type="ec2"
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AWS;
