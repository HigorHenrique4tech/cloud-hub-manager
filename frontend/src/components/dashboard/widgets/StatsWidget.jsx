import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Server, Play, Square, Cloud, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import awsService from '../../../services/awsservices';
import azureService from '../../../services/azureservices';
import gcpService from '../../../services/gcpService';
import orgService from '../../../services/orgService';
import { useOrgWorkspace } from '../../../contexts/OrgWorkspaceContext';

const statusBadge = (s) => {
  const norm = (s || '').toLowerCase();
  if (['running', 'available', 'active'].includes(norm))
    return <span className="badge-success text-xs py-0.5 px-2">{s}</span>;
  if (['stopped', 'deallocated', 'terminated'].includes(norm))
    return <span className="badge-danger text-xs py-0.5 px-2">{s}</span>;
  return <span className="badge-warning text-xs py-0.5 px-2">{s || '—'}</span>;
};

const CLOUD_TABS = {
  aws:   { label: 'AWS',   badge: 'bg-orange-500', abbr: 'A',  route: '/aws/ec2' },
  azure: { label: 'Azure', badge: 'bg-sky-500',    abbr: 'Az', route: '/azure/vms' },
  gcp:   { label: 'GCP',   badge: 'bg-green-500',  abbr: 'G',  route: '/gcp/compute' },
};

const StatsWidget = () => {
  const [selectedCloud, setSelectedCloud] = useState(null);
  const navigate = useNavigate();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const wsReady = !!currentOrg && !!currentWorkspace;

  const { data: accountsData } = useQuery({
    queryKey: ['dashboard-accounts', currentOrg?.slug, currentWorkspace?.id],
    queryFn: () => orgService.listAccounts(currentOrg.slug, currentWorkspace.id),
    enabled: wsReady,
    retry: false,
    staleTime: 60 * 1000,
  });

  const accounts = accountsData?.accounts || accountsData || [];
  const uniqueProviders = [...new Set(accounts.map((a) => a.provider))];
  const cloudCount = uniqueProviders.length;
  const hasAws = uniqueProviders.includes('aws');
  const hasAzure = uniqueProviders.includes('azure');
  const hasGcp = uniqueProviders.includes('gcp');

  const awsQ = useQuery({
    queryKey: ['dashboard-aws'],
    queryFn: () => awsService.listEC2Instances(),
    enabled: wsReady && hasAws,
    retry: false,
    staleTime: 2 * 60 * 1000,
  });
  const azureQ = useQuery({
    queryKey: ['dashboard-azure'],
    queryFn: () => azureService.listVMs(),
    enabled: wsReady && hasAzure,
    retry: false,
    staleTime: 2 * 60 * 1000,
  });
  const gcpQ = useQuery({
    queryKey: ['dashboard-gcp'],
    queryFn: () => gcpService.listInstances(),
    enabled: wsReady && hasGcp,
    retry: false,
    staleTime: 2 * 60 * 1000,
  });

  const awsInstances = awsQ.data?.instances || [];
  const azureVMs = azureQ.data?.virtual_machines || [];
  const gcpInstances = gcpQ.data?.instances || [];

  const totalVMs = (awsQ.data?.total_instances || awsInstances.length)
    + (azureQ.data?.total_vms || azureVMs.length)
    + gcpInstances.length;
  const runningVMs =
    awsInstances.filter((i) => i.state === 'running').length +
    azureVMs.filter((v) => v.power_state === 'running').length +
    gcpInstances.filter((i) => (i.status || '').toLowerCase() === 'running').length;
  const stoppedVMs = totalVMs - runningVMs;

  // Auto-select first available cloud
  const availableClouds = ['aws', 'azure', 'gcp'].filter(c =>
    c === 'aws' ? hasAws : c === 'azure' ? hasAzure : hasGcp
  );
  const activeCloud = selectedCloud && availableClouds.includes(selectedCloud)
    ? selectedCloud
    : availableClouds[0] || 'aws';

  const instanceMap = { aws: awsInstances, azure: azureVMs, gcp: gcpInstances };
  const queryMap = { aws: awsQ, azure: azureQ, gcp: gcpQ };
  const previewItems = (instanceMap[activeCloud] || []).slice(0, 5);
  const activeQuery = queryMap[activeCloud];

  const isLoading = (hasAws && awsQ.isLoading) || (hasAzure && azureQ.isLoading) || (hasGcp && gcpQ.isLoading);
  const hasError = (hasAws && awsQ.isError) || (hasAzure && azureQ.isError) || (hasGcp && gcpQ.isError);

  const getInstanceFields = (item) => {
    if (activeCloud === 'aws') return {
      name: item.name || item.instance_id,
      type: item.instance_type,
      detail: item.public_ip || item.private_ip,
      state: item.state,
    };
    if (activeCloud === 'azure') return {
      name: item.name,
      type: item.vm_size,
      detail: item.location,
      state: item.power_state,
    };
    return {
      name: item.name || item.id,
      type: item.machine_type,
      detail: item.zone,
      state: (item.status || '').toLowerCase(),
    };
  };

  const countForCloud = (cloud) => {
    if (cloud === 'aws') return awsQ.data?.total_instances ?? awsInstances.length;
    if (cloud === 'azure') return azureQ.data?.total_vms ?? azureVMs.length;
    return gcpInstances.length;
  };

  const stats = [
    { label: 'Total de VMs', value: totalVMs,   icon: Server, tone: 'text-primary bg-primary/10' },
    { label: 'Em Execução',  value: runningVMs, icon: Play,   tone: 'text-success bg-success/10' },
    { label: 'Paradas',      value: stoppedVMs, icon: Square, tone: 'text-danger bg-danger/10' },
    { label: 'Clouds',       value: cloudCount, icon: Cloud,  tone: 'text-primary bg-primary/10' },
  ];

  return (
    <div className="space-y-5">
      {/* Stat Strip — compact horizontal with dividers */}
      {isLoading ? (
        <div className="card p-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 dark:divide-gray-700 flex flex-col sm:flex-row">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 flex items-center gap-3 px-5 py-3.5">
              <div className="skeleton w-9 h-9 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-5 w-12" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-gray-200 dark:divide-gray-700 flex flex-col sm:flex-row">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div
              key={label}
              className="flex-1 flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-700/30"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tone}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-medium truncate">{label}</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-tight tabular-nums">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">
            {[awsQ, azureQ, gcpQ].some(q => q.error?.response?.status === 403)
              ? 'Algumas APIs do cloud provider não estão habilitadas. Verifique o console do provedor.'
              : 'Erro ao carregar dados de algumas clouds.'}
          </span>
          <button
            onClick={() => {
              if (awsQ.isError) awsQ.refetch();
              if (azureQ.isError) azureQ.refetch();
              if (gcpQ.isError) gcpQ.refetch();
            }}
            className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
          >
            <RefreshCw className="w-3 h-3" /> Tentar novamente
          </button>
        </div>
      )}

      {/* Cloud tabs + instances preview */}
      {availableClouds.length > 0 && (
        <div className="card">
          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            {availableClouds.map((key) => {
              const cfg = CLOUD_TABS[key];
              const count = countForCloud(key);
              const q = queryMap[key];
              return (
                <button
                  key={key}
                  onClick={() => setSelectedCloud(key)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-colors
                    ${activeCloud === key
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                >
                  {cfg.label} ({q.isLoading ? '…' : count})
                </button>
              );
            })}
          </div>

          {/* Instances list */}
          {activeQuery?.isLoading ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  <div className="flex-1">
                    <div className="h-3.5 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-1.5" />
                    <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                  <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                </div>
              ))}
            </div>
          ) : activeQuery?.isError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <AlertCircle className="w-7 h-7 text-red-400 opacity-60" />
              <p className="text-sm text-red-500 dark:text-red-400">Erro ao carregar instâncias</p>
              <button onClick={() => activeQuery.refetch()} className="text-xs text-primary hover:underline">
                Tentar novamente
              </button>
            </div>
          ) : previewItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Nenhuma instância encontrada</p>
          ) : (
            <ul className="space-y-1.5">
              {previewItems.map((item, idx) => {
                const { name, type, detail, state } = getInstanceFields(item);
                const cfg = CLOUD_TABS[activeCloud];
                return (
                  <li key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold ${cfg.badge}`}>
                      {cfg.abbr}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{name}</p>
                      <p className="text-xs text-gray-400 truncate">{type} · {detail || '—'}</p>
                    </div>
                    {statusBadge(state)}
                  </li>
                );
              })}
            </ul>
          )}

          <button
            onClick={() => navigate(CLOUD_TABS[activeCloud].route)}
            className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 text-sm text-primary hover:text-primary/80 font-medium border border-primary/20 hover:border-primary/40 rounded-lg transition-colors"
          >
            Ver todas instâncias <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default StatsWidget;
