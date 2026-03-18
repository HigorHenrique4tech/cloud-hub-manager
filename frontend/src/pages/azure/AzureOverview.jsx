import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown, ChevronRight, RefreshCw, Layers, Search,
  Server, HardDrive, Database, Globe, Network, Cloud,
  Cpu, LayoutGrid, MapPin, CreditCard, Box,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import ResourceMetricsPanel from '../../components/monitoring/ResourceMetricsPanel';
import azureService from '../../services/azureservices';

// ─ Resource type → icon + color ──────────────────────────────────────────────
const RESOURCE_TYPE_MAP = {
  virtualMachines:      { icon: Server,     color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
  storageAccounts:      { icon: HardDrive,  color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20' },
  servers:              { icon: Database,   color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  managedClusters:      { icon: Cpu,        color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  virtualNetworks:      { icon: Network,    color: 'text-teal-500',   bg: 'bg-teal-50 dark:bg-teal-900/20' },
  sites:                { icon: Globe,      color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20' },
  vaults:               { icon: Cloud,      color: 'text-sky-500',    bg: 'bg-sky-50 dark:bg-sky-900/20' },
};

function getTypeInfo(type) {
  if (!type) return { icon: Box, color: 'text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700' };
  const key = type.split('/').pop();
  return RESOURCE_TYPE_MAP[key] || { icon: Box, color: 'text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700' };
}

// ─ Location pill ──────────────────────────────────────────────────────────────
const LOCATION_COLORS = {
  brazilsouth: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  eastus:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  westus2:     'bg-primary-50 text-primary-dark dark:bg-indigo-900/30 dark:text-primary-light',
  eastus2:     'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  westeurope:  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  northeurope: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
};

function LocationPill({ location }) {
  const cls = LOCATION_COLORS[location?.toLowerCase()] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <MapPin size={9} />
      {location}
    </span>
  );
}

// ─ Resource Row ───────────────────────────────────────────────────────────────
const ResourceRow = ({ resource }) => {
  const { icon: Icon, color, bg } = getTypeInfo(resource.type);
  const typeName = resource.type?.split('/').pop() || '—';
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white dark:hover:bg-gray-800/60 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0 ${bg}`}>
          <Icon size={14} className={color} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{resource.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{typeName}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        <LocationPill location={resource.location} />
        {resource.provisioning_state && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            resource.provisioning_state === 'Succeeded'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          }`}>
            {resource.provisioning_state}
          </span>
        )}
      </div>
    </div>
  );
};

// ─ Resource Group Accordion ───────────────────────────────────────────────────
const ResourceGroupAccordion = ({ rg }) => {
  const [open, setOpen]         = useState(false);
  const [resources, setResources] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [loaded, setLoaded]     = useState(false);

  const toggle = async () => {
    if (!open && !loaded) {
      setLoading(true);
      try {
        const data = await azureService.listResourceGroupResources(rg.name);
        setResources(data.resources || []);
        setLoaded(true);
      } catch {
        setResources([]);
        setLoaded(true);
      } finally {
        setLoading(false);
      }
    }
    setOpen(prev => !prev);
  };

  // Build a tiny type breakdown for the header badge
  const typeBreakdown = useMemo(() => {
    if (!loaded || resources.length === 0) return [];
    const counts = {};
    resources.forEach(r => {
      const k = r.type?.split('/').pop() || 'Other';
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts).slice(0, 3);
  }, [resources, loaded]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/20 flex-shrink-0">
            <Layers size={15} className="text-sky-500" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{rg.name}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <LocationPill location={rg.location} />
              {loaded && resources.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {resources.length} {resources.length === 1 ? 'recurso' : 'recursos'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {loaded && typeBreakdown.map(([type, count]) => (
            <span key={type} className="hidden sm:inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              {count}× {type}
            </span>
          ))}
          {rg.provisioning_state && rg.provisioning_state !== 'Succeeded' && (
            <span className="text-xs text-amber-500">{rg.provisioning_state}</span>
          )}
          {open
            ? <ChevronDown size={15} className="text-gray-400" />
            : <ChevronRight size={15} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-4 py-3">
          {loading ? (
            <LoadingSpinner size="sm" text="Carregando recursos..." />
          ) : resources.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2 text-center">Nenhum recurso neste grupo</p>
          ) : (
            <div className="space-y-0.5">
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

// ─ Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'sky' }) {
  const colors = {
    sky:    { bg: 'bg-sky-50 dark:bg-sky-900/20',    icon: 'text-sky-500',    border: 'border-sky-100 dark:border-sky-800/30' },
    green:  { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-500', border: 'border-green-100 dark:border-green-800/30' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20',icon:'text-purple-500',border: 'border-purple-100 dark:border-purple-800/30' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-500', border: 'border-amber-100 dark:border-amber-800/30' },
  };
  const c = colors[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4 flex items-center gap-4`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 dark:bg-gray-800/50 flex-shrink-0`}>
        <Icon size={20} className={c.icon} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value ?? '—'}</p>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{label}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─ Subscription Card ─────────────────────────────────────────────────────────
function SubscriptionCard({ sub }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 flex flex-col gap-3 hover:border-sky-300 dark:hover:border-sky-700 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/20">
            <CreditCard size={16} className="text-sky-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{sub.display_name}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{sub.subscription_id}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
          sub.state === 'Enabled'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
        }`}>
          {sub.state}
        </span>
      </div>
      {sub.tenant_id && (
        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate border-t border-gray-100 dark:border-gray-700 pt-2">
          Tenant: {sub.tenant_id}
        </p>
      )}
    </div>
  );
}

// ─ Main Page ──────────────────────────────────────────────────────────────────
const AzureOverview = () => {
  const queryClient = useQueryClient();
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [noCredentials, setNoCredentials] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [resourceGroups, setResourceGroups] = useState([]);
  const [rgSearch, setRgSearch]         = useState('');

  const metricsQ = useQuery({
    queryKey: ['azure-metrics'],
    queryFn: () => azureService.getMetrics(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !noCredentials,
  });

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
      if (err.response?.status === 400) setNoCredentials(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredRGs = useMemo(() =>
    rgSearch
      ? resourceGroups.filter(rg => rg.name.toLowerCase().includes(rgSearch.toLowerCase()) || rg.location?.toLowerCase().includes(rgSearch.toLowerCase()))
      : resourceGroups
  , [resourceGroups, rgSearch]);

  const uniqueRegions = useMemo(() =>
    new Set(resourceGroups.map(rg => rg.location).filter(Boolean)).size
  , [resourceGroups]);

  if (loading) return <Layout><LoadingSpinner text="Carregando Azure..." /></Layout>;
  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Azure — Visão Geral</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {subscriptions.length} assinatura(s) · {resourceGroups.length} grupos de recursos · {uniqueRegions} regiões
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Assinaturas"       value={subscriptions.length}  icon={CreditCard}  color="sky" />
        <StatCard label="Grupos de Recursos" value={resourceGroups.length} icon={Layers}      color="purple" />
        <StatCard label="Regiões"            value={uniqueRegions}          icon={MapPin}      color="green" />
        <StatCard label="Instâncias monit."  value={metricsQ.data?.resources?.length ?? '…'} icon={LayoutGrid} color="amber" />
      </div>

      {/* Subscriptions */}
      {subscriptions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
            <CreditCard size={16} className="text-sky-500" />
            Assinaturas Ativas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {subscriptions.map(sub => (
              <SubscriptionCard key={sub.subscription_id} sub={sub} />
            ))}
          </div>
        </section>
      )}

      {/* Resource Groups */}
      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <Layers size={16} className="text-sky-500" />
            Grupos de Recursos
            <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
              ({filteredRGs.length}{rgSearch ? ` de ${resourceGroups.length}` : ''})
            </span>
          </h2>
          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={rgSearch}
              onChange={(e) => setRgSearch(e.target.value)}
              placeholder="Filtrar por nome ou região…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
        {filteredRGs.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
            {rgSearch ? 'Nenhum grupo encontrado para este filtro.' : 'Nenhum grupo de recursos encontrado.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredRGs.map(rg => (
              <ResourceGroupAccordion key={rg.name} rg={rg} />
            ))}
          </div>
        )}
      </section>

      <ResourceMetricsPanel
        resources={metricsQ.data?.resources}
        isLoading={metricsQ.isLoading}
        isError={metricsQ.isError}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['azure-metrics'] })}
      />
    </Layout>
  );
};

export default AzureOverview;
