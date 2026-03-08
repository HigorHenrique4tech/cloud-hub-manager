import { useMemo } from 'react';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Map spend intensity to Tailwind bg class
function getIntensityClass(value, max) {
  if (!value || value <= 0) return 'bg-gray-100 dark:bg-gray-800';
  const pct = value / max;
  if (pct < 0.1)  return 'bg-blue-100 dark:bg-blue-900/40';
  if (pct < 0.25) return 'bg-blue-200 dark:bg-blue-800/60';
  if (pct < 0.4)  return 'bg-blue-300 dark:bg-blue-700/70';
  if (pct < 0.6)  return 'bg-blue-400 dark:bg-blue-600/80';
  if (pct < 0.8)  return 'bg-blue-500 dark:bg-blue-500';
  return 'bg-blue-700 dark:bg-blue-400';
}

const CostHeatmap = ({ combined = [], providerFilter = 'all' }) => {
  const { weeks, maxVal, monthLabels } = useMemo(() => {
    if (!combined.length) return { weeks: [], maxVal: 0, monthLabels: [] };

    // Build date→value map
    const dayMap = {};
    for (const d of combined) {
      const val = providerFilter === 'all'
        ? (d.total || 0)
        : (d[providerFilter] || 0);
      dayMap[d.date] = val;
    }

    // Find date range
    const dates = combined.map((d) => d.date).sort();
    if (!dates.length) return { weeks: [], maxVal: 0, monthLabels: [] };

    // Start from the Sunday before the first date
    const firstDate = new Date(dates[0] + 'T00:00:00');
    const startSunday = new Date(firstDate);
    startSunday.setDate(firstDate.getDate() - firstDate.getDay());

    // End on the Saturday after the last date
    const lastDate = new Date(dates[dates.length - 1] + 'T00:00:00');
    const endSaturday = new Date(lastDate);
    endSaturday.setDate(lastDate.getDate() + (6 - lastDate.getDay()));

    // Build week columns
    const weeksArr = [];
    const monthLabelArr = [];
    let cur = new Date(startSunday);
    let prevMonth = -1;

    while (cur <= endSaturday) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = cur.toISOString().slice(0, 10);
        const val = dayMap[dateStr] ?? null;
        const inRange = dateStr >= dates[0] && dateStr <= dates[dates.length - 1];
        week.push({ date: dateStr, value: val, inRange, day: cur.getDay(), month: cur.getMonth() });
        cur.setDate(cur.getDate() + 1);
      }
      // Track month label position
      const firstInRange = week.find((c) => c.inRange);
      if (firstInRange && firstInRange.month !== prevMonth) {
        monthLabelArr.push({ weekIdx: weeksArr.length, month: firstInRange.month });
        prevMonth = firstInRange.month;
      }
      weeksArr.push(week);
    }

    const maxVal = Math.max(...Object.values(dayMap).filter(Boolean), 1);
    return { weeks: weeksArr, maxVal, monthLabels: monthLabelArr };
  }, [combined, providerFilter]);

  if (!weeks.length) return null;

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Mapa de Calor Semanal</h2>
        {/* Legend */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span>Menor</span>
          {['bg-blue-100 dark:bg-blue-900/40','bg-blue-200 dark:bg-blue-800/60','bg-blue-300 dark:bg-blue-700/70','bg-blue-400 dark:bg-blue-600/80','bg-blue-500 dark:bg-blue-500','bg-blue-700 dark:bg-blue-400'].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
          <span>Maior</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-0">
          {/* Day labels column */}
          <div className="flex flex-col gap-1 pt-5 mr-1 flex-shrink-0">
            {DAY_LABELS.map((label, i) => (
              <div key={i} className={`h-3 text-[10px] text-gray-400 dark:text-gray-500 leading-none flex items-center ${i % 2 === 0 ? 'opacity-0' : ''}`}>
                {label}
              </div>
            ))}
          </div>

          {/* Weeks grid */}
          <div className="flex flex-col gap-0">
            {/* Month labels row */}
            <div className="relative h-5 mb-1">
              {monthLabels.map(({ weekIdx, month }) => (
                <span
                  key={weekIdx}
                  className="absolute text-[10px] text-gray-500 dark:text-gray-400 leading-none"
                  style={{ left: `${weekIdx * 16}px` }}
                >
                  {MONTH_NAMES[month]}
                </span>
              ))}
            </div>

            {/* Day cells */}
            <div className="flex gap-1">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((cell) => (
                    <div
                      key={cell.date}
                      title={cell.inRange && cell.value != null ? `${cell.date}: ${fmtUSD(cell.value)}` : cell.date}
                      className={`w-3 h-3 rounded-sm transition-colors cursor-default ${
                        !cell.inRange
                          ? 'bg-transparent'
                          : getIntensityClass(cell.value, maxVal)
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary row — highest/lowest day */}
      {combined.length > 0 && (() => {
        const vals = combined
          .map((d) => ({ date: d.date, val: providerFilter === 'all' ? d.total : d[providerFilter] || 0 }))
          .filter((d) => d.val > 0);
        if (!vals.length) return null;
        const maxDay = vals.reduce((a, b) => b.val > a.val ? b : a);
        const minDay = vals.reduce((a, b) => b.val < a.val ? b : a);
        const avg = vals.reduce((s, d) => s + d.val, 0) / vals.length;
        return (
          <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            <span>Dia mais caro: <strong className="text-red-500">{maxDay.date} ({fmtUSD(maxDay.val)})</strong></span>
            <span>Dia mais barato: <strong className="text-green-500">{minDay.date} ({fmtUSD(minDay.val)})</strong></span>
            <span>Média diária: <strong className="text-gray-700 dark:text-gray-300">{fmtUSD(avg)}</strong></span>
          </div>
        );
      })()}
    </div>
  );
};

export default CostHeatmap;
