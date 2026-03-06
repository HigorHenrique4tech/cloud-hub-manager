import { Cloud } from 'lucide-react';

/**
 * Reusable empty-state illustration.
 *
 * Props:
 *   icon            — lucide icon component (default: Cloud)
 *   title           — main message
 *   description     — optional sub-text
 *   action          — callback OR ReactNode.
 *                     If callback + actionLabel: renders a primary button.
 *                     If ReactNode: renders it directly.
 *   actionLabel     — button label (used when action is a callback)
 *   secondaryAction — ReactNode for an additional secondary link/button
 *   iconColor       — tailwind text class for icon color
 *   message         — legacy alias for title
 */
const EmptyState = ({
  message,
  icon: Icon = Cloud,
  title,
  description,
  action,
  actionLabel,
  secondaryAction,
  iconColor = 'text-gray-400 dark:text-gray-500',
}) => (
  <div className="flex flex-col items-center justify-center p-12 text-center select-none animate-fade-in">
    {/* Icon with subtle gradient background */}
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl
                    bg-gradient-to-br from-gray-100 to-gray-50
                    dark:from-gray-800 dark:to-gray-900
                    shadow-inner">
      <Icon className={`w-8 h-8 ${iconColor}`} />
    </div>

    <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
      {title || message || 'Nenhum recurso encontrado'}
    </p>

    {description && (
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm leading-relaxed">
        {description}
      </p>
    )}

    {/* Primary action */}
    {action && typeof action === 'function' && actionLabel ? (
      <button
        onClick={action}
        className="mt-5 px-5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white
                   hover:bg-indigo-500 transition-all duration-150 active:scale-[0.97] focus-ring"
      >
        {actionLabel}
      </button>
    ) : action ? (
      <div className="mt-5">{action}</div>
    ) : null}

    {/* Secondary action */}
    {secondaryAction && (
      <div className="mt-2">{secondaryAction}</div>
    )}
  </div>
);

export default EmptyState;
