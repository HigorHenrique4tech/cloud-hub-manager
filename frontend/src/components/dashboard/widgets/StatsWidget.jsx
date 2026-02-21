import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Server, Play, Square, Cloud, ChevronRight } from 'lucide-react';
import StatsCard from '../statscard';
import awsService from '../../../services/awsservices';
import azureService from '../../../services/azureservices';
import orgService from '../../../services/orgService';
import { useOrgWorkspace } from '../../../contexts/OrgWorkspaceContext';

const statusBadge = (s) => {
  const norm = (s || '').toLowerCase();
  if (['running', 'available', 'active'].includes(norm))
    return <span className="badge-success text-xs py-0.5 px-2">{s}</span>;
  if (['stopped', 'deallocated'].includes(norm))
    return <span className="badge-danger text-xs py-0.5 px-2">{s}</span>;
  return <span className="badge-warning text-xs py-0.5 px-2">{s || '—'}</span>;
};

const StatsWidget = () => {
  const [selectedCloud, setSelectedCloud] = useState('aws');
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

  const { data: awsData } = useQuery({
    queryKey: ['dashboard-aws'],
    queryFn: () => awsService.listEC2Instances(),
    enabled: wsReady && hasAws,
    retry: false,
  });
  const { data: azureData } = useQuery({
    queryKey: ['dashboard-azure'],
    queryFn: () => azureService.listVMs(),
    enabled: wsReady && hasAzure,
    retry: false,
  });

  const awsInstances = awsData?.instances || [];
  const azureVMs = azureData?.virtual_machines || [];
  const totalVMs = (awsData?.total_instances || 0) + (azureData?.total_vms || 0);
  const runningVMs =
    awsInstances.filter((i) => i.state === 'running').length +
    azureVMs.filter((v) => v.power_state === 'running').length;
  const stoppedVMs = totalVMs - runningVMs;

  const isAws = selectedCloud === 'aws';
  const previewItems = isAws
    ? awsInstances.slice(0, 5)
    : azureVMs.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard title="Total de VMs" value={totalVMs}   icon={Server} color="primary" />
        <StatsCard title="Em Execução"  value={runningVMs} icon={Play}   color="success" />
        <StatsCard title="Paradas"      value={stoppedVMs} icon={Square} color="danger"  />
        <StatsCard title="Clouds"       value={cloudCount} icon={Cloud}  color="primary" />
      </div>

      {/* Cloud tabs + instances preview */}
      {(hasAws || hasAzure) && (
        <div className="card">
          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            {[
              hasAws   && { key: 'aws',   label: `AWS (${awsData?.total_instances ?? '…'})` },
              hasAzure && { key: 'azure', label: `Azure (${azureData?.total_vms ?? '…'})` },
            ].filter(Boolean).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedCloud(key)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-colors
                  ${selectedCloud === key
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Instances list */}
          {previewItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Nenhuma instância encontrada</p>
          ) : (
            <ul className="space-y-1.5">
              {previewItems.map((item, idx) => {
                const name  = isAws ? (item.name || item.instance_id) : item.name;
                const type  = isAws ? item.instance_type : item.vm_size;
                const ip    = isAws ? (item.public_ip || item.private_ip) : item.location;
                const state = isAws ? item.state : item.power_state;
                return (
                  <li key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold ${isAws ? 'bg-orange-500' : 'bg-sky-500'}`}>
                      {isAws ? 'A' : 'Az'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{name}</p>
                      <p className="text-xs text-gray-400 truncate">{type} · {ip || '—'}</p>
                    </div>
                    {statusBadge(state)}
                  </li>
                );
              })}
            </ul>
          )}

          <button
            onClick={() => navigate(isAws ? '/aws/ec2' : '/azure/vms')}
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
