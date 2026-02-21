import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Server, Cloud, Database, Box, Zap, ExternalLink, ChevronRight,
} from 'lucide-react';
import logsService from '../../../services/logsService';
import { useOrgWorkspace } from '../../../contexts/OrgWorkspaceContext';

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

const ActivityWidget = () => {
  const navigate = useNavigate();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const wsReady = !!currentOrg && !!currentWorkspace;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-logs'],
    queryFn: () => logsService.getLogs({ limit: 8 }),
    enabled: wsReady,
    staleTime: 30 * 1000,
    retry: false,
  });

  const logs = data?.logs || [];

  if (!isLoading && logs.length === 0) return null;

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

export default ActivityWidget;
