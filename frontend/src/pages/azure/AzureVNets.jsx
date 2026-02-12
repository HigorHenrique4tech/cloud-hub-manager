import { useState, useEffect } from 'react';
import { RefreshCw, Network } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import azureService from '../../services/azureservices';

const AzureVNets = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noCredentials, setNoCredentials] = useState(false);
  const [vnets, setVnets] = useState([]);
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').toLowerCase();

  const fetchData = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setNoCredentials(false);
      const data = await azureService.listVNets();
      setVnets(data.vnets || []);
    } catch (err) {
      if (err.response?.status === 400) setNoCredentials(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = query
    ? vnets.filter(v =>
        v.name?.toLowerCase().includes(query) ||
        v.resource_group?.toLowerCase().includes(query) ||
        v.location?.toLowerCase().includes(query)
      )
    : vnets;

  if (loading) return <Layout><LoadingSpinner text="Carregando Virtual Networks..." /></Layout>;
  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">Virtual Networks</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {filtered.length} de {vnets.length} rede(s){query && ` para "${query}"`}
          </p>
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Network className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Nenhuma Virtual Network encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {['Nome', 'Grupo de Recursos', 'Localização', 'Espaço de Endereço', 'Subnets', 'Status'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Network className="w-4 h-4 text-sky-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{v.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{v.resource_group}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{v.location}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex flex-col gap-0.5">
                        {(v.address_space || []).map((addr, i) => (
                          <span key={i} className="font-mono text-xs">{addr}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-medium">{v.subnets_count}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        v.provisioning_state === 'Succeeded'
                          ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-100'
                      }`}>{v.provisioning_state || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AzureVNets;
