import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Server, Play, Square, Cloud, TrendingUp, ChevronRight,
  Database, Box, Zap, ExternalLink, Settings,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import StatsCard from '../components/dashboard/statscard';
import LoadingSpinner from '../components/common/loadingspinner';
import awsService from '../services/awsservices';
import azureService from '../services/azureservices';
import costService from '../services/costService';
import logsService from '../services/logsService';
import orgService from '../services/orgService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';

/* ── helpers ───────────────────────────────────────────────── */
const today   = new Date();
const end30   = today.toISOString().slice(0, 10);
const start30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Agora';
  if (m < 60) return `Há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Há ${h}h`;
  const d = Math.floor(h / 24);
  return `Há ${d} dia${d > 1 ? 's' : ''}`;
}

const statusBadge = (s) => {
  const norm = (s || '').toLowerCase();
  if (['running', 'available', 'active'].includes(norm))
    return <span className="badge-success text-xs py-0.5 px-2">{s}</span>;
  if (['stopped', 'deallocated'].includes(norm))
    return <span className="badge-danger text-xs py-0.5 px-2">{s}</span>;
  return <span className="badge-warning text-xs py-0.5 px-2">{s || '—'}</span>;
};

/* ── CostForecastCard ──────────────────────────────────────── */
const CostForecastCard = ({ data, isLoading }) => {
  const hasAws   = !!data?.aws;
  const hasAzure = !!data?.azure;
  const hasData  = (data?.combined?.length || 0) > 0;

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Cost Forecast
        </h2>
        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">30d</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col gap-3 animate-pulse">
          <div className="h-8 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="flex gap-2">
            <div className="h-7 w-28 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
        </div>
      ) : !hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500 text-sm gap-2">
          <TrendingUp className="w-8 h-8 opacity-25" />
          <p>Configure credenciais AWS/Azure para ver custos</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Big total */}
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-0.5">
            {fmtUSD(data?.total)}
          </p>
          <p className="text-xs text-gray-400 mb-4">{start30} → {end30}</p>

          {/* Chart */}
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.combined} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: '#1f2937',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 11,
                    padding: '6px 10px',
                    color: '#f9fafb',
                  }}
                  labelStyle={{ color: '#d1d5db', marginBottom: 2 }}
                  formatter={(v, name) => [fmtUSD(v), name]}
                />
                {hasAws   && <Line type="monotone" dataKey="aws"   name="AWS"   stroke="#f97316" strokeWidth={2} dot={false} />}
                {hasAzure && <Line type="monotone" dataKey="azure" name="Azure" stroke="#0ea5e9" strokeWidth={2} dot={false} />}
                <Line type="monotone" dataKey="total" name="Total" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Provider chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
              Total {fmtUSD(data?.total)}
            </span>
            {hasAws && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                AWS {fmtUSD(data?.aws?.total)}
              </span>
            )}
            {hasAzure && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 px-3 py-1 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
                Azure {fmtUSD(data?.azure?.total)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── InstancesCard ─────────────────────────────────────────── */
const InstancesCard = ({ cloud, awsInstances, azureVMs, awsRegion, azureSubId }) => {
  const navigate = useNavigate();
  const isAws = cloud === 'aws';
  const items = isAws
    ? (awsInstances || []).slice(0, 5)
    : (azureVMs || []).slice(0, 5);

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            {isAws ? 'Instâncias EC2' : 'VMs Azure'}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {isAws
              ? `Região: ${awsRegion || 'N/A'}`
              : `Sub: ${azureSubId ? azureSubId.slice(0, 8) + '...' : 'N/A'}`}
          </p>
        </div>
        <Server className="w-5 h-5 text-gray-300 dark:text-gray-600" />
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-6 text-gray-400 text-sm">
          Nenhuma instância encontrada
        </div>
      ) : (
        <ul className="flex-1 space-y-1.5 overflow-hidden">
          {items.map((item, idx) => {
            const name  = isAws ? (item.name || item.instance_id) : item.name;
            const type  = isAws ? item.instance_type : item.vm_size;
            const ip    = isAws ? (item.public_ip || item.private_ip) : item.location;
            const state = isAws ? item.state : item.power_state;

            return (
              <li key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold
                  ${isAws ? 'bg-orange-500' : 'bg-sky-500'}`}>
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
  );
};

/* ── RecentActivitiesCard ──────────────────────────────────── */
const ACTION_LABELS = {
  'ec2.start':         'EC2 Iniciada',
  'ec2.stop':          'EC2 Parada',
  'azurevm.start':     'VM Azure Iniciada',
  'azurevm.stop':      'VM Azure Parada',
  'appservice.start':  'App Service Iniciado',
  'appservice.stop':   'App Service Parado',
  'credential.add':    'Credencial Adicionada',
  'credential.remove': 'Credencial Removida',
  'alert.create':      'Alerta Criado',
  'alert.delete':      'Alerta Excluído',
  'auth.login':        'Login',
  'auth.register':     'Cadastro',
};

const ACTION_ICONS = {
  'ec2.start':         <Server   className="w-4 h-4 text-orange-500" />,
  'ec2.stop':          <Server   className="w-4 h-4 text-orange-400" />,
  'azurevm.start':     <Server   className="w-4 h-4 text-sky-500"    />,
  'azurevm.stop':      <Server   className="w-4 h-4 text-sky-400"    />,
  'appservice.start':  <Zap      className="w-4 h-4 text-sky-500"    />,
  'appservice.stop':   <Zap      className="w-4 h-4 text-sky-400"    />,
  'credential.add':    <Database className="w-4 h-4 text-green-500"  />,
  'credential.remove': <Database className="w-4 h-4 text-red-400"    />,
  'alert.create':      <Box      className="w-4 h-4 text-yellow-500" />,
  'alert.delete':      <Box      className="w-4 h-4 text-red-400"    />,
  'auth.login':        <Cloud    className="w-4 h-4 text-primary"     />,
  'auth.register':     <Cloud    className="w-4 h-4 text-primary"     />,
};

const PROVIDER_DOT = {
  aws:    <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />,
  azure:  <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />,
  system: <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />,
};

const RecentActivitiesCard = ({ logs, isLoading }) => {
  const navigate = useNavigate();

  if (!isLoading && (!logs || logs.length === 0)) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-gray-400" />
          Atividades Recentes
        </h2>
        <button
          onClick={() => navigate('/logs')}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Ver todos <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center flex-shrink-0">
                {ACTION_ICONS[log.action] || <Server className="w-4 h-4 text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {ACTION_LABELS[log.action] || log.action}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {PROVIDER_DOT[log.provider] || PROVIDER_DOT.system}
                  <span className="text-xs text-gray-400 truncate">
                    {log.provider.toUpperCase()}
                    {log.resource_name ? ` · ${log.resource_name}` : ''}
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                {timeAgo(log.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── EmptyWorkspaceState ──────────────────────────────────── */
const EmptyWorkspaceState = () => {
  const navigate = useNavigate();
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <Cloud className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Nenhuma conta cloud configurada
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mb-6">
          Este workspace não possui contas AWS ou Azure. Adicione suas credenciais cloud para começar a monitorar recursos e custos.
        </p>
        <button
          onClick={() => navigate('/workspace/settings')}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configurar Workspace
        </button>
      </div>
    </Layout>
  );
};

/* ── Dashboard (main) ──────────────────────────────────────── */
const Dashboard = () => {
  const [selectedCloud, setSelectedCloud] = useState('aws');
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const wsReady = !!currentOrg && !!currentWorkspace;

  /* Cloud accounts in this workspace */
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

  /* Main queries — only run when workspace has corresponding provider */
  const { data: awsData,   isLoading: awsLoading   } = useQuery({
    queryKey: ['dashboard-aws'],
    queryFn: () => awsService.listEC2Instances(),
    enabled: wsReady && hasAws,
    retry: false,
  });
  const { data: azureData, isLoading: azureLoading } = useQuery({
    queryKey: ['dashboard-azure'],
    queryFn: () => azureService.listVMs(),
    enabled: wsReady && hasAzure,
    retry: false,
  });

  /* Lazy background queries */
  const { data: costsData,  isLoading: costsLoading } = useQuery({
    queryKey: ['dashboard-costs', start30, end30],
    queryFn:  () => costService.getCombinedCosts(start30, end30, 'DAILY'),
    enabled: wsReady && (hasAws || hasAzure),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['dashboard-logs'],
    queryFn:  () => logsService.getLogs({ limit: 8 }),
    enabled: wsReady,
    staleTime: 30 * 1000,
    retry: false,
  });

  /* Empty state: workspace without cloud accounts */
  if (wsReady && accountsData && accounts.length === 0) {
    return <EmptyWorkspaceState />;
  }

  /* Derived stats */
  const awsInstances = awsData?.instances  || [];
  const azureVMs     = azureData?.virtual_machines || [];
  const totalVMs     = (awsData?.total_instances || 0) + (azureData?.total_vms || 0);
  const runningVMs   =
    awsInstances.filter((i) => i.state === 'running').length +
    azureVMs.filter((v) => v.power_state === 'running').length;
  const stoppedVMs   = totalVMs - runningVMs;

  if ((awsLoading && hasAws) || (azureLoading && hasAzure)) {
    return <Layout><LoadingSpinner text="Carregando recursos..." /></Layout>;
  }

  return (
    <Layout>
      {/* ── Stat Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatsCard title="Total de VMs" value={totalVMs}   icon={Server} color="primary" />
        <StatsCard title="Em Execução"  value={runningVMs} icon={Play}   color="success" />
        <StatsCard title="Paradas"      value={stoppedVMs} icon={Square} color="danger"  />
        <StatsCard title="Clouds"       value={cloudCount} icon={Cloud}  color="primary" />
      </div>

      {/* ── Cloud Tabs ──────────────────────────────────── */}
      <div className="flex gap-2 mb-5">
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

      {/* ── Main Grid: 2/3 Cost + 1/3 Instances ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <div className="lg:col-span-2">
          <CostForecastCard data={costsData} isLoading={costsLoading} />
        </div>
        <div className="lg:col-span-1">
          <InstancesCard
            cloud={selectedCloud}
            awsInstances={awsInstances}
            azureVMs={azureVMs}
            awsRegion={awsData?.region}
            azureSubId={azureData?.subscription_id}
          />
        </div>
      </div>

      {/* ── Recent Activities ───────────────────────────── */}
      <RecentActivitiesCard
        logs={logsData?.logs}
        isLoading={logsLoading}
      />
    </Layout>
  );
};

export default Dashboard;
