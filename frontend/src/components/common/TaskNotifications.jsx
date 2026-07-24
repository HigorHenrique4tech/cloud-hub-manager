import { useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, X, Zap } from 'lucide-react';
import { useBackgroundTasks } from '../../contexts/BackgroundTasksContext';

const statusIcon = {
  queued: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="w-4 h-4 text-green-500" />,
  failed: <XCircle className="w-4 h-4 text-red-500" />,
};

const statusLabel = {
  queued: 'Na fila',
  running: 'Em progresso',
  completed: 'Concluído',
  failed: 'Falhou',
};

// Floating banner for in-progress tasks
function ActiveTasksBanner({ activeTasks }) {
  if (activeTasks.length === 0) return null;
  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-xs w-full">
      {activeTasks.map(task => (
        <div
          key={task.id}
          className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-gray-200
                     dark:border-gray-700 rounded-xl shadow-lg px-4 py-3"
        >
          {statusIcon[task.status] || statusIcon.running}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {task.label}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {statusLabel[task.status]}...
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// Toast for completed/failed tasks
function CompletionToast({ notification, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(notification.id), 6000);
    return () => clearTimeout(t);
  }, [notification.id, onDismiss]);

  const isOk = notification.status === 'completed';

  return (
    <div
      className={`flex items-start gap-3 rounded-xl shadow-lg px-4 py-3 border
        ${isOk
          ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700'
          : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'
        }`}
    >
      {isOk
        ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
        : <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${isOk ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
          {isOk ? 'Recurso criado!' : 'Falha na criação'}
        </p>
        <p className={`text-xs mt-0.5 ${isOk ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'} truncate`}>
          {notification.label}
          {!isOk && notification.error ? ` — ${notification.error}` : ''}
        </p>
      </div>
      <button
        onClick={() => onDismiss(notification.id)}
        className="ml-1 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function TaskNotifications() {
  const { activeTasks, notifications, dismissNotification } = useBackgroundTasks();

  return (
    <>
      <ActiveTasksBanner activeTasks={activeTasks} />
      {notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-xs w-full">
          {notifications.map(n => (
            <CompletionToast key={n.id} notification={n} onDismiss={dismissNotification} />
          ))}
        </div>
      )}
    </>
  );
}
