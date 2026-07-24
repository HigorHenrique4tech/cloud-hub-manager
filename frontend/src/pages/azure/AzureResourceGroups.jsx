import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Layers, Server, HardDrive, Database, Globe, Network,
  ChevronDown, ChevronRight, Search, MapPin, Tag,
  RefreshCw, Box, Cpu, AlertCircle, CheckCircle2, Cloud,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import azureService from '../../services/azureservices';

// ── Resource type config ──────────────────────────────────────────────────────
const TYPE_CONFIG = {
  virtualMachines:      { icon: Server,    color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20',   label: 'VMs' },
  storageAccounts:      { icon: HardDrive, color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20', label: 'Storage' },
  servers:              { icon: Database,  color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', label: 'SQL' },
  managedClusters:      { icon: Cpu,       color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20', label: 'AKS' },
  virtualNetworks:      { icon: Network,   color: 'text-teal-500',   bg: 'bg-teal-50 dark:bg-teal-900/20',  label: 'VNets' },
  sites:                { icon: Globe,     color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20', label: 'App Svc' },
  vaults:               { icon: Cloud,     color: 'text-sky-500',    bg: 'bg-sky-50 dark:bg-sky-900/20',    label: 'Vault' },
};

function getTypeCfg(typeKey) {
  return TYPE_CONFIG[typeKey] || { icon: Box, color: 'text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700', label: typeKey };
}

const LOCATION_COLORS = {
  brazilsouth: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  eastus:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  westus2:     'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  eastus2:     'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  westeurope:  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  northeurope: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
};

function LocationPill({ location }) {
  const cls = LOCATION_COLORS[location?.toLowerCase()] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
      <MapPin size={8} /> {location}
    </span>
  );
}

// ── Resource Group Card ───────────────────────────────────────────────────────
const RGCard = ({ rg }) => {
  const [expanded, setExpanded] = useState(false);

  const topTypes = useMemo(() => {
    return Object.entries(rg.resource_counts || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [rg.resource_counts]);

  const tagEntries = Object.entries(rg.tags || {}).slice(0, 3);
  const isPending = rg.provisioning_state && rg.provisioning_state !== 'Succeeded';

  return (
    <div className={`rounded-xl border bg-white dark:bg-gray-800/60 shadow-sm transition-all ${
      isPending
        ? 'border-amber-300/60 dark:border-amber-700/40'
        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
    }`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 flex-shrink-0">
          <Layers size={16} className="text-sky-600 dark:text-sky-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{rg.name}</p>
            {isPending && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <AlertCircle size={9} /> {rg.provisioning_state}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <LocationPill location={rg.location} />
            {tagEntries.map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                <Tag size={8} /> {k}: {v}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{rg.total_resources}</span>
          <span className="text-xs text-gray-500 dark:text-gray-500">recursos</span>
          {expanded
            ? <ChevronDown size={14} className="text-gray-400" />
            : <ChevronRight size={14} className="text-gray-400" />
          }
        </div>
      </button>

      {/* Resource type badges */}
      {topTypes.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {topTypes.map(([typeKey, count]) => {
            const cfg = getTypeCfg(typeKey);
            const Icon = cfg.icon;
            return (
              <span key={typeKey} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                <Icon size={10} /> {cfg.label || typeKey} <span className="font-bold">{count}</span>
              </span>
            );
          })}
          {Object.keys(rg.resource_counts || {}).length > 6 && (
            <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              +{Object.keys(rg.resource_counts).length - 6} tipos
            </span>
          )}
        </div>
      )}

      {/* Expanded resources list */}
      {expanded && rg.resources?.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 px-4 py-3 max-h-64 overflow-y-auto space-y-1">
          {rg.resources.slice(0, 100).map((r, i) => {
            const typeKey = r.type?.split('/').pop() || '';
            const cfg = getTypeCfg(typeKey);
            const Icon = cfg.icon;
            return (
              <div key={i} className="flex items-center gap-2.5 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/40 px-1.5 transition-colors">
                <div className={`flex h-6 w-6 items-center justify-center rounded flex-shrink-0 ${cfg.bg}`}>
                  <Icon size={12} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{r.name}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{r.type}</p>
                </div>
                {r.location && r.location !== rg.location && (
                  <LocationPill location={r.location} />
                )}
              </div>
            );
          })}
          {rg.resources.length > 100 && (
            <p className="text-xs text-gray-400 text-center py-1">
              Mostrando 100 de {rg.resources.length} recursos
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const AzureResourceGroups = () => {
  const [search, setSearch] = useState('');

  const overviewQ = useQuery({
    queryKey: ['azure-rg-overview'],
    queryFn: () => azureService.getResourceGroupsOverview(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const allRGs = overviewQ.data?.resource_groups || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return allRGs;
    const q = search.toLowerCase();
    return allRGs.filter(rg =>
      rg.name.toLowerCase().includes(q) ||
      rg.location?.toLowerCase().includes(q) ||
      Object.keys(rg.tags || {}).some(k => k.toLowerCase().includes(q)) ||
      Object.values(rg.tags || {}).some(v => String(v).toLowerCase().includes(q))
    );
  }, [allRGs, search]);

  const totalResources = overviewQ.data?.total_resources || 0;
  const uniqueLocations = useMemo(() => [...new Set(allRGs.map(r => r.location).filter(Boolean))], [allRGs]);

  if (overviewQ.isError) {
    const msg = overviewQ.error?.response?.data?.detail || '';
    if (msg.includes('credencial') || msg.includes('credential') || overviewQ.error?.response?.status === 404) {
      return <Layout><NoCredentialsMessage provider="azure" /></Layout>;
    }
  }

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
              <Layers size={22} className="text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Resource Groups</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Visão centralizada de todos os grupos de recursos Azure
              </p>
            </div>
          </div>
          <button onClick={() => overviewQ.refetch()}
            disabled={overviewQ.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
            <RefreshCw size={13} className={overviewQ.isFetching ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {/* Summary stats */}
        {!overviewQ.isLoading && allRGs.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Resource Groups', value: allRGs.length, icon: Layers, color: 'text-sky-500', bg: 'bg-sky-100 dark:bg-sky-900/30' },
              { label: 'Total de Recursos', value: totalResources, icon: Box, color: 'text-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
              { label: 'Regiões', value: uniqueLocations.length, icon: MapPin, color: 'text-teal-500', bg: 'bg-teal-100 dark:bg-teal-900/30' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="card rounded-xl p-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${bg}`}>
                  <Icon size={18} className={color} />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        {allRGs.length > 0 && (
          <div className="relative max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, região ou tag…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        )}

        {/* Content */}
        {overviewQ.isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : overviewQ.isError ? (
          <div className="rounded-lg border border-red-300/50 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              Erro ao carregar resource groups: {overviewQ.error?.response?.data?.detail || overviewQ.error?.message}
            </div>
          </div>
        ) : allRGs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
            <Layers size={48} className="mb-4 opacity-20" />
            <p className="text-base font-medium">Nenhum resource group encontrado</p>
            <p className="text-sm mt-1">Configure suas credenciais Azure para visualizar os recursos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                Nenhum resultado para "{search}"
              </p>
            ) : (
              filtered.map((rg) => <RGCard key={rg.name} rg={rg} />)
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AzureResourceGroups;
