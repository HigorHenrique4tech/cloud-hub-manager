import { getStatusColor, getStatusText } from '../../utils/formatters';

const StatusBadge = ({ state }) => {
  const color = getStatusColor(state);
  const text = getStatusText(state);
  
  const colorClasses = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    gray: 'badge-gray'
  };

  return (
    <span className={colorClasses[color] || 'badge-gray'}>
      {text}
    </span>
  );
};

export default StatusBadge;