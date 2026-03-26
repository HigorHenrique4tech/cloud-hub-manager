const colorClasses = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger:  'text-danger',
};

const bgClasses = {
  primary: 'bg-primary-50 dark:bg-primary-900/30',
  success: 'bg-green-50 dark:bg-green-900/30',
  warning: 'bg-amber-50 dark:bg-yellow-900/30',
  danger:  'bg-red-50 dark:bg-red-900/30',
};

const borderClasses = {
  primary: 'border-l-primary',
  success: 'border-l-success',
  warning: 'border-l-warning',
  danger:  'border-l-danger',
};

const tintClasses = {
  primary: 'bg-primary-50/40 dark:bg-transparent',
  success: 'bg-green-50/40 dark:bg-transparent',
  warning: 'bg-amber-50/40 dark:bg-transparent',
  danger:  'bg-red-50/40 dark:bg-transparent',
};

const StatsCard = ({ title, value, icon: Icon, color = 'primary' }) => {
  return (
    <div className={`card-interactive group border-l-4 ${borderClasses[color]} ${tintClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1
                        group-hover:text-gray-700 dark:group-hover:text-gray-200
                        transition-colors duration-200">
            {title}
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        </div>
        {Icon && (
          <div className={`${bgClasses[color]} rounded-xl p-3 transition-transform duration-200 group-hover:scale-110`}>
            <Icon className={`w-7 h-7 ${colorClasses[color]}`} />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsCard;
