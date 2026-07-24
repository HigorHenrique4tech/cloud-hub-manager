import { useMemo, useState, useEffect } from 'react';
import { Zap, PauseCircle, AlertTriangle, Clock } from 'lucide-react';

function formatCountdown(isoStr) {
  if (!isoStr) return null;
  const diff = new Date(isoStr) - Date.now();
  if (diff <= 0) return 'agora';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `em ${mins}min`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  if (hrs < 24) return `em ${hrs}h ${rm > 0 ? `${rm}min` : ''}`.trim();
  const days = Math.floor(hrs / 24);
  return `em ${days}d ${hrs % 24}h`;
}

const CARDS = [
  { key: 'active',   label: 'Ativos',          icon: Zap,             color: 'emerald' },
  { key: 'paused',   label: 'Pausados',         icon: PauseCircle,     color: 'amber' },
  { key: 'failures', label: 'Falhas Recentes',  icon: AlertTriangle,   color: 'red' },
  { key: 'next',     label: 'Próxima Execução', icon: Clock,           color: 'blue' },
];

const colorMap = {
  emerald: 'border-l-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber:   'border-l-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red:     'border-l-red-500 bg-red-500/10 text-red-600 dark:text-red-400',
  blue:    'border-l-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

export default function ScheduleStats({ schedules = [] }) {
  const [, setTick] = useState(0);

  // Re-render every 60s for countdown
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const active = schedules.filter(s => s.is_enabled).length;
    const paused = schedules.filter(s => !s.is_enabled).length;

    // Count schedules with failures in last 24h from last_runs
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let failures = 0;
    for (const s of schedules) {
      for (const r of (s.last_runs || [])) {
        if (r.status === 'failed' && r.triggered_at && (now - new Date(r.triggered_at)) < day) {
          failures++;
          break;
        }
      }
    }

    // Nearest next run
    let nearest = null;
    let nearestName = null;
    for (const s of schedules) {
      if (s.next_run_at) {
        const t = new Date(s.next_run_at).getTime();
        if (!nearest || t < nearest) {
          nearest = t;
          nearestName = s.resource_name;
        }
      }
    }

    return { active, paused, failures, nearest, nearestName };
  }, [schedules]);

  const values = {
    active:   stats.active,
    paused:   stats.paused,
    failures: stats.failures,
    next:     stats.nearest ? formatCountdown(new Date(stats.nearest).toISOString()) : '—',
  };

  const subtitles = {
    active:   `de ${schedules.length} total`,
    paused:   schedules.length === 0 ? '' : `de ${schedules.length} total`,
    failures: 'últimas 24h',
    next:     stats.nearestName || '',
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map(({ key, label, icon: Icon, color }) => (
        <div
          key={key}
          className={`border-l-4 rounded-lg p-4 ${colorMap[color]} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {label}
            </span>
            <Icon className="w-4 h-4 opacity-60" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {values[key]}
          </div>
          {subtitles[key] && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
              {subtitles[key]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
