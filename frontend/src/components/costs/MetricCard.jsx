const BG = {
  blue:   'from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20',
  green:  'from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20',
  orange: 'from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20',
  purple: 'from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20',
};

const ICON_COLOR = {
  blue: 'text-blue-400', green: 'text-green-400',
  orange: 'text-orange-400', purple: 'text-purple-400',
};

const SPARK_STROKE = {
  blue: '#60a5fa', green: '#34d399', orange: '#fb923c', purple: '#a78bfa',
};

// delta: positive = increase (bad for costs = red), negative = decrease (good = green)
// invertColor: true means increase is good (e.g. for savings)
const DeltaBadge = ({ delta, invertColor = false }) => {
  if (delta == null || isNaN(delta)) return null;
  const isUp = delta >= 0;
  const isBad = invertColor ? !isUp : isUp;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${
      isBad
        ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
        : 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
    }`}>
      {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
    </span>
  );
};

/** Mini sparkline SVG — renders last N daily values as a tiny area chart */
const Sparkline = ({ data = [], color = '#60a5fa', height = 32, width = 80 }) => {
  if (!data.length || data.length < 2) return null;
  const max = Math.max(...data, 0.01);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height * 0.85) - height * 0.05;
    return `${x},${y}`;
  }).join(' ');

  // Area fill path
  const areaPath = `M0,${height} L${points.split(' ').map((p, i) => {
    const [x, y] = p.split(',');
    return i === 0 ? `${x},${y}` : ` L${x},${y}`;
  }).join('')} L${width},${height} Z`;

  return (
    <svg width={width} height={height} className="opacity-60 flex-shrink-0" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`spark-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-fill-${color.replace('#', '')})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dot on last point */}
      {(() => {
        const lastPt = points.split(' ').pop().split(',');
        return <circle cx={lastPt[0]} cy={lastPt[1]} r="2" fill={color} />;
      })()}
    </svg>
  );
};

const DELAYS = ['animate-delay-0', 'animate-delay-75', 'animate-delay-150', 'animate-delay-200'];

const MetricCard = ({ icon: Icon, label, value, sub, color = 'blue', delta, invertColor, sparkline, delay = 0 }) => (
  <div
    className={`bg-gradient-to-br ${BG[color]} rounded-lg shadow-md p-5 animate-fade-in-up group`}
    style={{ animationDelay: `${delay * 80}ms`, animationFillMode: 'both' }}
  >
    <div className="flex items-start justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">{value}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {sub && <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
          {delta != null && (
            <div className="flex items-center gap-1">
              <DeltaBadge delta={delta} invertColor={invertColor} />
              <span className="text-[10px] text-gray-400 dark:text-gray-500">vs período ant.</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-2">
        <Icon className={`w-10 h-10 ${ICON_COLOR[color]} opacity-50 transition-transform group-hover:scale-110`} />
        {sparkline && <Sparkline data={sparkline} color={SPARK_STROKE[color]} />}
      </div>
    </div>
  </div>
);

export default MetricCard;
