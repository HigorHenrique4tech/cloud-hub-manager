import { useState, useEffect } from 'react';
import { RefreshCw, HardDrive } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import azureService from '../../services/azureservices';

const AzureStorage = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noCredentials, setNoCredentials] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').toLowerCase();

  const fetchData = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setNoCredentials(false);
      const data = await azureService.listStorageAccounts();
      setAccounts(data.storage_accounts || []);
    } catch (err) {
      if (err.response?.status === 400) setNoCredentials(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = query
    ? accounts.filter(a =>
        a.name?.toLowerCase().includes(query) ||
        a.resource_group?.toLowerCase().includes(query) ||
        a.location?.toLowerCase().includes(query)
      )
    : accounts;

  if (loading) return <Layout><LoadingSpinner text="Carregando Storage Accounts..." /></Layout>;
  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">Storage Accounts</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {filtered.length} de {accounts.length} conta(s){query && ` para "${query}"`}
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
            <HardDrive className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Nenhuma Storage Account encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {['Nome', 'Grupo de Recursos', 'Localização', 'Replicação', 'Tipo', 'Status'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-sky-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{a.resource_group}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{a.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{a.sku || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{a.kind || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        a.provisioning_state === 'Succeeded'
                          ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-100'
                      }`}>{a.provisioning_state || '—'}</span>
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

export default AzureStorage;
