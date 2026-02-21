import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Play, Square } from 'lucide-react';
import scheduleService from '../../../services/scheduleService';
import { useOrgWorkspace } from '../../../contexts/OrgWorkspaceContext';

const PLAN_ORDER = { free: 0, pro: 1, enterprise: 2 };

const PROVIDER_COLOR = {
  aws:   'text-orange-400',
  azure: 'text-sky-400',
};

function fmtNextRun(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d - now;
  if (diffMs < 0) return 'Atrasado';
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return 'Em breve';
  if (diffH < 24) return `Em ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return diffD === 1 ? 'Amanhã' : `Em ${diffD} dias`;
}

const SchedulesWidget = () => {
  const navigate = useNavigate();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const plan = (currentOrg?.plan_tier || 'free').toLowerCase();
  const isPro = (PLAN_ORDER[plan] ?? 0) >= 1;
  const wsReady = !!currentOrg && !!currentWorkspace;

  const { data = [], isLoading } = useQuery({
    queryKey: ['schedules', currentWorkspace?.id],
    queryFn: () => scheduleService.getSchedules(),
    enabled: wsReady && isPro,
    staleTime: 60 * 1000,
    retry: false,
  });

  const upcoming = [...data]
    .filter((s) => s.is_enabled)
    .sort((a, b) => {
      if (!a.next_run_at) return 1;
      if (!b.next_run_at) return -1;
      return new Date(a.next_run_at) - new Date(b.next_run_at);
    })
    .slice(0, 5);

  if (!isPro) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-indigo-400" />
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Próximos Agendamentos</h2>
        </div>
        <div className="rounded-lg border border-dashed border-indigo-700 bg-indigo-900/20 px-4 py-5 text-center">
          <p className="text-sm text-indigo-300 font-medium mb-1">Recurso Pro</p>
          <p className="text-xs text-slate-400 mb-3">Faça upgrade para agendar ligar/desligar recursos automaticamente.</p>
          <button
            onClick={() => navigate('/billing')}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Ver planos <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          Próximos Agendamentos
        </h2>
        <button
          onClick={() => navigate('/schedules')}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Ver todos <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Clock className="w-7 h-7 text-gray-300 dark:text-gray-600 opacity-60" />
          <p className="text-sm text-gray-400">Nenhum agendamento ativo</p>
          <button
            onClick={() => navigate('/schedules')}
            className="text-xs text-primary hover:underline"
          >
            Criar agendamento
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                s.action === 'start'
                  ? 'bg-green-500/20 text-green-500'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {s.action === 'start'
                  ? <Play className="w-3 h-3" />
                  : <Square className="w-3 h-3" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {s.resource_name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-semibold ${PROVIDER_COLOR[s.provider] || 'text-gray-400'}`}>
                    {s.provider?.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-400">{s.schedule_time}</span>
                </div>
              </div>
              <span className="text-xs text-indigo-400 font-medium whitespace-nowrap flex-shrink-0">
                {fmtNextRun(s.next_run_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SchedulesWidget;
