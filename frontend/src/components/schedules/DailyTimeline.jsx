import { useMemo } from 'react';

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

export default function DailyTimeline({ schedules = [] }) {
  const markers = useMemo(() => {
    return schedules
      .filter(s => s.is_enabled && s.schedule_time)
      .map(s => {
        const [h, m] = s.schedule_time.split(':').map(Number);
        const pct = ((h * 60 + m) / 1440) * 100;
        return { ...s, pct };
      })
      .sort((a, b) => a.pct - b.pct);
  }, [schedules]);

  if (markers.length === 0) return null;

  // Group markers that are too close (within 1.5%)
  const groups = [];
  for (const m of markers) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(m.pct - last.pct) < 1.5) {
      last.items.push(m);
    } else {
      groups.push({ pct: m.pct, items: [m] });
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        Timeline Diária
      </h3>
      <div className="relative h-10">
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />

        {/* Hour labels */}
        {HOURS.map(h => (
          <div
            key={h}
            className="absolute top-full mt-1 text-[10px] text-gray-400 dark:text-gray-500 -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {h === 24 ? '' : `${String(h).padStart(2, '0')}h`}
          </div>
        ))}

        {/* Hour ticks */}
        {HOURS.map(h => (
          <div
            key={`tick-${h}`}
            className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-gray-300 dark:bg-gray-600"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}

        {/* Schedule markers */}
        {groups.map((group, gi) => (
          <div
            key={gi}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5"
            style={{ left: `${group.pct}%` }}
          >
            {group.items.map((m, mi) => (
              <div
                key={m.id}
                className="group relative"
                style={{ marginTop: mi > 0 ? '-2px' : undefined }}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-800 shadow-sm cursor-pointer transition-transform hover:scale-125 ${
                    m.action === 'start'
                      ? 'bg-emerald-500'
                      : 'bg-red-500'
                  }`}
                />
                {/* Tooltip */}
                <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap">
                  <div className="bg-gray-900 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg">
                    <span className="font-medium">{m.resource_name}</span>
                    <span className="text-gray-300 mx-1">·</span>
                    <span className={m.action === 'start' ? 'text-emerald-400' : 'text-red-400'}>
                      {m.action.toUpperCase()}
                    </span>
                    <span className="text-gray-300 mx-1">·</span>
                    <span className="text-gray-300">{m.schedule_time}</span>
                    <span className="text-gray-400 ml-1">({m.provider.toUpperCase()})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-5 text-[11px] text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Start</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Stop</span>
        <span className="ml-auto">{markers.length} agendamento{markers.length !== 1 ? 's' : ''} ativo{markers.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
