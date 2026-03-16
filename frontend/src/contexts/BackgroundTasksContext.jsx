import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useOrgWorkspace } from './OrgWorkspaceContext';
import api from '../services/api';

const BackgroundTasksContext = createContext();

const POLL_INTERVAL = 4000;
const STALE_AFTER_MS = 3 * 60 * 1000; // drop banner after 3min if polling keeps failing
const MAX_FAIL_BEFORE_STALE = 5;       // consecutive failures before stale cleanup

export function BackgroundTasksProvider({ children }) {
  const { user } = useAuth();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const [tasks, setTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const intervalRef = useRef(null);
  const prevStatusRef = useRef({});
  const failCountRef = useRef(0);
  const taskCreatedAtRef = useRef({}); // task_id → Date.now() when addTask was called

  const wsUrl = useCallback(() => {
    if (!currentOrg?.slug || !currentWorkspace?.id) return null;
    return `/api/v1/orgs/${currentOrg.slug}/workspaces/${currentWorkspace.id}/tasks/`;
  }, [currentOrg?.slug, currentWorkspace?.id]);

  const fetchTasks = useCallback(async () => {
    const url = wsUrl();
    if (!url || !user) return;
    try {
      const { data } = await api.get(url);
      failCountRef.current = 0; // reset on success

      setTasks(data);

      // Detect status transitions → show notification
      const prev = prevStatusRef.current;
      data.forEach(task => {
        const oldStatus = prev[task.id];
        if (
          oldStatus &&
          oldStatus !== task.status &&
          (task.status === 'completed' || task.status === 'failed')
        ) {
          setNotifications(n => [
            ...n,
            {
              id: Date.now() + Math.random(),
              task_id: task.id,
              label: task.label,
              status: task.status,
              error: task.error,
            },
          ]);
        }
      });
      const next = {};
      data.forEach(t => { next[t.id] = t.status; });
      prevStatusRef.current = next;
    } catch {
      failCountRef.current += 1;
      // After repeated failures, drop optimistic tasks older than STALE_AFTER_MS
      if (failCountRef.current >= MAX_FAIL_BEFORE_STALE) {
        const now = Date.now();
        setTasks(prev => prev.filter(t => {
          const added = taskCreatedAtRef.current[t.id] || 0;
          return now - added < STALE_AFTER_MS;
        }));
      }
    }
  }, [wsUrl, user]);

  // Start/stop polling based on active tasks
  useEffect(() => {
    if (!user || !currentWorkspace) {
      clearInterval(intervalRef.current);
      return;
    }
    fetchTasks();
    intervalRef.current = setInterval(fetchTasks, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchTasks, user, currentWorkspace]);

  const dismissNotification = useCallback((id) => {
    setNotifications(n => n.filter(x => x.id !== id));
  }, []);

  // Add a task optimistically (right after POST returns task_id)
  const addTask = useCallback((task) => {
    setTasks(prev => [task, ...prev]);
    prevStatusRef.current[task.id] = task.status;
    taskCreatedAtRef.current[task.id] = Date.now();
  }, []);

  const activeTasks = tasks.filter(t => t.status === 'queued' || t.status === 'running');

  return (
    <BackgroundTasksContext.Provider value={{ tasks, activeTasks, notifications, addTask, dismissNotification }}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

export const useBackgroundTasks = () => useContext(BackgroundTasksContext);
