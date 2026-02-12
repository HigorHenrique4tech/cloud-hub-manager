import { useState, useEffect } from 'react';
import { RefreshCw, Globe, Play, Square } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import azureService from '../../services/azureservices';

const AzureAppServices = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noCredentials, setNoCredentials] = useState(false);
  const [error, setError] = useState(null);
  const [apps, setApps] = useState([]);
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').toLowerCase();

  const fetchData = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setNoCredentials(false);
      setError(null);
      const data = await azureService.listAppServices();
      setApps(data.app_services || []);
    } catch (err) {
      if (err.response?.status === 400) setNoCredentials(true);
      else setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleStart = async (rg, name) => {
    try {
      setRefreshing(true);
      await azureService.startAppService(rg, name);
      await fetchData(true);
    } catch (err) {
      setError(`Erro ao iniciar App Service: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStop = async (rg, name) => {
    try {
      setRefreshing(true);
      await azureService.stopAppService(rg, name);
      await fetchData(true);
    } catch (err) {
      setError(`Erro ao parar App Service: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = query
    ? apps.filter(a =>
        a.name?.toLowerCase().includes(query) ||
        a.resource_group?.toLowerCase().includes(query) ||
        a.location?.toLowerCase().includes(query)
      )
    : apps;

  if (loading) return <Layout><LoadingSpinner text="Carregando App Services..." /></Layout>;
  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">App Services</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {filtered.length} de {apps.length} app(s){query && ` para "${query}"`}
          </p>
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Nenhum App Service encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {['Nome', 'Grupo de Recursos', 'Localização', 'Runtime', 'Plano', 'Status', 'Ações'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(app => (
                  <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-sky-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{app.name}</p>
                          {app.host_names?.[0] && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[180px]">{app.host_names[0]}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{app.resource_group}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{app.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{app.runtime || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{app.app_service_plan || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        app.state === 'Running'
                          ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
                          : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-100'
                      }`}>{app.state || '—'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        {app.state !== 'Running' && (
                          <button onClick={() => handleStart(app.resource_group, app.name)} disabled={refreshing}
                            className="text-success hover:text-success-dark disabled:opacity-50" title="Iniciar">
                            <Play className="w-5 h-5" />
                          </button>
                        )}
                        {app.state === 'Running' && (
                          <button onClick={() => handleStop(app.resource_group, app.name)} disabled={refreshing}
                            className="text-danger hover:text-danger-dark disabled:opacity-50" title="Parar">
                            <Square className="w-5 h-5" />
                          </button>
                        )}
                      </div>
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

export default AzureAppServices;
