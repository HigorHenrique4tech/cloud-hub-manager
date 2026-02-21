import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import alertService from '../../../services/alertService';
import { useOrgWorkspace } from '../../../contexts/OrgWorkspaceContext';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PROVIDER_COLORS = {
  aws:   'text-orange-400',
  azure: 'text-sky-400',
};

const AlertsWidget = () => {
  const navigate = useNavigate();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const wsReady = !!currentOrg && !!currentWorkspace;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-alert-events', currentWorkspace?.id],
    queryFn: () => alertService.getEvents({ limit: 5 }),
    enabled: wsReady,
    staleTime: 60 * 1000,
    retry: false,
  });

  const events = data?.events || data || [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <Bell className="w-4 h-4 text-yellow-400" />
          Alertas de Custo
        </h2>
        <button
          onClick={() => navigate('/costs')}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Ver custos <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="w-7 h-7 text-green-400 opacity-60" />
          <p className="text-sm text-gray-400">Nenhum alerta de custo recente</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30">
              <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {ev.alert_name || ev.message || 'Alerta ativado'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {ev.provider && (
                    <span className={`text-xs font-semibold ${PROVIDER_COLORS[ev.provider] || 'text-gray-400'}`}>
                      {ev.provider.toUpperCase()}
                    </span>
                  )}
                  {ev.current_value != null && (
                    <span className="text-xs text-gray-400">
                      {fmtUSD(ev.current_value)}
                      {ev.threshold != null && ` / limite ${fmtUSD(ev.threshold)}`}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AlertsWidget;
