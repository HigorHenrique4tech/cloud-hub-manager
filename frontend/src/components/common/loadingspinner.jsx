import { Loader2 } from 'lucide-react';

/**
 * LoadingSpinner — indicador de carregamento.
 *
 * Props:
 *   size     — 'sm' | 'md' | 'lg' (default: 'md')
 *   text     — mensagem opcional (default: 'Carregando...')
 *   variant  — 'spinner' | 'dots' | 'bar' (default: 'spinner')
 */
const LoadingSpinner = ({ size = 'md', text = 'Carregando...', variant = 'spinner' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  if (variant === 'dots') {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-primary animate-pulse-soft"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
        {text && <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>}
      </div>
    );
  }

  if (variant === 'bar') {
    return (
      <div className="w-full space-y-2">
        <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full rounded-full bg-primary animate-[progress_1.5s_ease-in-out_infinite]
                          w-1/3 origin-left" />
        </div>
        {text && <p className="text-xs text-center text-gray-500 dark:text-gray-400">{text}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-primary`} />
      {text && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
