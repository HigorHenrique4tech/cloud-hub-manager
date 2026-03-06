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

const MetricCard = ({ icon: Icon, label, value, sub, color = 'blue' }) => (
  <div className={`bg-gradient-to-br ${BG[color]} rounded-lg shadow-md p-5`}>
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>}
      </div>
      <Icon className={`w-10 h-10 ${ICON_COLOR[color]} opacity-50 flex-shrink-0 ml-2`} />
    </div>
  </div>
);

export default MetricCard;
