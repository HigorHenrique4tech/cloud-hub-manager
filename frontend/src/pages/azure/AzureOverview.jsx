import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Box, Layers } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import azureService from '../../services/azureservices';

const ResourceRow = ({ resource }) => (
  <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
    <div className="flex items-center gap-3 min-w-0">
      <Box className="w-4 h-4 text-sky-500 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{resource.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{resource.type?.split('/').slice(-1)[0]}</p>
      </div>
    </div>
    <div className="flex items-center gap-4 flex-shrink-0 ml-4">
      <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{resource.location}</span>
      {resource.provisioning_state && (
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          resource.provisioning_state === 'Succeeded'
            ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-100'
        }`}>
          {resource.provisioning_state}
        </span>
      )}
    </div>
  </div>
);

const ResourceGroupAccordion = ({ rg }) => {
  const [open, setOpen] = useState(false);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const toggle = async () => {
    if (!open && !loaded) {
      setLoading(true);
      try {
        const data = await azureService.listResourceGroupResources(rg.name);
        setResources(data.resources || []);
        setLoaded(true);
      } catch {
        setResources([]);
      } finally {
        setLoading(false);
      }
    }
    setOpen(prev => !prev);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-sky-500 flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{rg.name}</span>
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{rg.location}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rg.provisioning_state && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{rg.provisioning_state}</span>
          )}
          {open ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-4 py-3">
          {loading ? (
            <LoadingSpinner size="sm" text="Carregando recursos..." />
          ) : resources.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Nenhum recurso encontrado</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                {resources.length} {resources.length === 1 ? 'recurso' : 'recursos'}
              </p>
              {resources.map((r, i) => (
                <ResourceRow key={r.id || i} resource={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AzureOverview = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noCredentials, setNoCredentials] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [resourceGroups, setResourceGroups] = useState([]);

  const fetchData = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setNoCredentials(false);

      const [subsData, rgsData] = await Promise.all([
        azureService.listSubscriptions(),
        azureService.listResourceGroups(),
      ]);
      setSubscriptions(subsData.subscriptions || []);
      setResourceGroups(rgsData.resource_groups || []);
    } catch (err) {
      if (err.response?.status === 400) {
        setNoCredentials(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <Layout><LoadingSpinner text="Carregando Azure..." /></Layout>;
  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">Azure — Visão Geral</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {subscriptions.length} assinatura(s) · {resourceGroups.length} grupos de recursos
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Subscriptions */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Assinaturas Ativas</h2>
        {subscriptions.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhuma assinatura encontrada</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {subscriptions.map(sub => (
              <div key={sub.subscription_id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{sub.display_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 truncate">{sub.subscription_id}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                    sub.state === 'Enabled'
                      ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {sub.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Resource Groups */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Grupos de Recursos</h2>
        {resourceGroups.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhum grupo de recursos encontrado</p>
        ) : (
          <div className="space-y-2">
            {resourceGroups.map(rg => (
              <ResourceGroupAccordion key={rg.name} rg={rg} />
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
};

export default AzureOverview;
