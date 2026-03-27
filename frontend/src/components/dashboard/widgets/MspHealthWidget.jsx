import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, AlertCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrgWorkspace } from '../../../contexts/OrgWorkspaceContext';
import { AwsIcon, AzureIcon, GcpIcon } from '../../common/CloudProviderIcons';
import orgService from '../../../services/orgService';

const HEALTH = {
  healthy:  { dot: 'bg-green-500', pulse: true },
  warning:  { dot: 'bg-amber-500', pulse: false },
  critical: { dot: 'bg-red-500',   pulse: false },
};

const PROVIDER_ICON = {
  aws:   { icon: AwsIcon,   color: 'text-orange-500' },
  azure: { icon: AzureIcon, color: 'text-sky-500' },
  gcp:   { icon: GcpIcon,   color: 'text-green-500' },
};

const MspHealthWidget = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrgWorkspace();

  const isMaster = currentOrg?.org_type === 'master' || currentOrg?.org_type === 'standalone';
  const isEnterprise = (currentOrg?.effective_plan || currentOrg?.plan_tier) === 'enterprise';

  const summaryQ = useQuery({
    queryKey: ['msp-widget', currentOrg?.slug],
    queryFn: () => orgService.getMspWidgetSummary(currentOrg.slug),
    enabled: Boolean(currentOrg?.slug) && isMaster && isEnterprise,
    staleTime: 60_000,
    retry: false,
  });

  if (!isMaster || !isEnterprise) return null;

  if (summaryQ.isLoading) {
    return (
      <div className="card p-5 rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Saúde dos Parceiros</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (summaryQ.isError) {
    return (
      <div className="card p-5 rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Saúde dos Parceiros</h3>
        </div>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <AlertCircle className="w-7 h-7 text-red-400 opacity-60" />
          <p className="text-sm text-red-500 dark:text-red-400">Erro ao carregar dados</p>
          <button onClick={() => summaryQ.refetch()} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <RefreshCw className="w-3 h-3" /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const data = summaryQ.data;
  if (!data || data.total_partners === 0) {
    return (
      <div className="card p-5 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Saúde dos Parceiros</h3>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">Nenhuma organização parceira.</p>
      </div>
    );
  }

  return (
    <div className="card p-5 rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Saúde dos Parceiros</h3>
        </div>
        <button onClick={() => navigate('/org/managed')}
          className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
          Ver todas <ExternalLink size={10} />
        </button>
      </div>

      {/* Counters */}
      <div className="flex items-center gap-4 mb-4">
        {[
          { label: 'Saudáveis', count: data.healthy, color: 'text-green-600 dark:text-green-400' },
          { label: 'Alertas', count: data.warning, color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Críticas', count: data.critical, color: 'text-red-600 dark:text-red-400' },
        ].map(({ label, count, color }) => (
          <div key={label} className="text-center">
            <p className={`text-lg font-bold ${color}`}>{count}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
          </div>
        ))}
        <div className="text-center ml-auto">
          <p className="text-lg font-bold text-gray-700 dark:text-gray-200">{data.total_partners}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Total</p>
        </div>
      </div>

      {/* Partner mini-list */}
      <div className="space-y-1.5">
        {data.partners_summary.map((p) => {
          const h = HEALTH[p.health] || HEALTH.healthy;
          return (
            <div key={p.slug} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                {h.pulse && <span className={`absolute inset-0 rounded-full ${h.dot} animate-ping opacity-40`} />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${h.dot}`} />
              </span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{p.name}</span>
              <div className="flex items-center gap-1">
                {p.providers.map(prov => {
                  const cfg = PROVIDER_ICON[prov];
                  if (!cfg) return null;
                  const Icon = cfg.icon;
                  return <Icon key={prov} className={`w-3 h-3 ${cfg.color}`} />;
                })}
              </div>
              {!p.is_active && (
                <span className="text-[9px] font-medium text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">OFF</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MspHealthWidget;
