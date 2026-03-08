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

const MetricCard = ({ icon: Icon, label, value, sub, color = 'blue', delta, invertColor }) => (
  <div className={`bg-gradient-to-br ${BG[color]} rounded-lg shadow-md p-5`}>
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
      <Icon className={`w-10 h-10 ${ICON_COLOR[color]} opacity-50 flex-shrink-0 ml-2`} />
    </div>
  </div>
);

export default MetricCard;
