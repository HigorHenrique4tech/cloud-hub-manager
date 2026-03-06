const StatsCard = ({ title, value, icon: Icon, color = 'primary' }) => {
  const colorClasses = {
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    danger:  'text-danger',
  };

  return (
    <div className="card-interactive group">
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
          <div className={`${colorClasses[color]} transition-transform duration-200 group-hover:scale-110`}>
            <Icon className="w-12 h-12" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsCard;
