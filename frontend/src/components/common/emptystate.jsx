import { Cloud } from 'lucide-react';

/**
 * Reusable empty-state illustration.
 *
 * Props:
 *   icon        — lucide icon component (default: Cloud)
 *   title       — main message
 *   description — optional sub-text
 *   action      — callback OR ReactNode.
 *                 If callback + actionLabel: renders a button.
 *                 If ReactNode: renders it directly.
 *   actionLabel — button label (used when action is a callback)
 *   iconColor   — tailwind text class for icon color
 *   message     — legacy alias for title
 */
const EmptyState = ({
  message,
  icon: Icon = Cloud,
  title,
  description,
  action,
  actionLabel,
  iconColor = 'text-gray-300 dark:text-gray-600',
}) => (
  <div className="flex flex-col items-center justify-center p-12 text-center select-none">
    <Icon className={`w-12 h-12 mb-4 ${iconColor}`} />
    <p className="text-base font-medium text-gray-700 dark:text-gray-300">
      {title || message || 'Nenhum recurso encontrado'}
    </p>
    {description && (
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">{description}</p>
    )}
    {action && typeof action === 'function' && actionLabel ? (
      <button
        onClick={action}
        className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
      >
        {actionLabel}
      </button>
    ) : action ? (
      <div className="mt-4">{action}</div>
    ) : null}
  </div>
);

export default EmptyState;