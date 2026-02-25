import { Cloud } from 'lucide-react';

const EmptyState = ({
  message,
  icon: Icon = Cloud,
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center p-12 text-center">
    <Icon className="w-12 h-12 mb-4 text-gray-300 dark:text-gray-600" />
    <p className="text-base font-medium text-gray-700 dark:text-gray-300">
      {title || message || 'Nenhum recurso encontrado'}
    </p>
    {description && (
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">{description}</p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export default EmptyState;