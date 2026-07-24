import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, RefreshCw, ChevronDown, ChevronRight, Maximize2, Square, X } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import PermissionGate from '../../components/common/PermissionGate';
import { useToast } from '../../contexts/ToastContext';
import awsService from '../../services/awsservices';

const ClusterPanel = ({ cluster, toast }) => {
  const [open, setOpen] = useState(false);
  const [scaleTarget, setScaleTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const servicesQ = useQuery({
    queryKey: ['ecs-services', cluster.name],
    queryFn: () => awsService.listEcsServices(cluster.name),
    enabled: open, retry: false,
  });
  const tasksQ = useQuery({
    queryKey: ['ecs-tasks', cluster.name],
    queryFn: () => awsService.listEcsTasks(cluster.name),
    enabled: open, retry: false,
  });

  const handleScale = async (service, count) => {
    setBusy(true);
    try {
      await awsService.scaleEcsService(cluster.name, service, count);
      toast.success(`Serviço ${service} escalado para ${count}.`);
      setScaleTarget(null);
      servicesQ.refetch();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Falha ao escalar.');
    } finally { setBusy(false); }
  };

  const handleStop = async (taskId) => {
    if (!window.confirm(`Parar a task ${taskId}?`)) return;
    try {
      await awsService.stopEcsTask(cluster.name, taskId);
      toast.success('Task parada.');
      tasksQ.refetch();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Falha ao parar task.');
    }
  };

  const services = servicesQ.data?.services || [];
  const tasks = tasksQ.data?.tasks || [];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        <Boxes size={16} className="text-orange-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{cluster.name}</p>
          <p className="text-[11px] text-gray-400">{cluster.active_services} serviços · {cluster.running_tasks} tasks rodando</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cluster.status === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>{cluster.status}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 px-4 py-3 space-y-4">
          {/* Services */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Serviços</p>
            {servicesQ.isLoading ? <LoadingSpinner /> : services.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nenhum serviço.</p>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-400">
                  <th className="py-1 font-medium">Nome</th><th className="py-1 font-medium">Desired/Running</th>
                  <th className="py-1 font-medium">Launch</th><th className="py-1 font-medium">Task Def</th><th></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {services.map((s, i) => (
                    <tr key={i}>
                      <td className="py-1.5 font-medium text-gray-700 dark:text-gray-300">{s.name}</td>
                      <td className="py-1.5"><span className={s.running_count < s.desired_count ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-600 dark:text-gray-300'}>{s.desired_count}/{s.running_count}</span></td>
                      <td className="py-1.5 text-gray-500">{s.launch_type || '—'}</td>
                      <td className="py-1.5 text-gray-500 font-mono max-w-[140px] truncate">{s.task_definition}</td>
                      <td className="py-1.5 text-right">
                        <PermissionGate permission="resources.manage">
                          <button onClick={() => setScaleTarget(s)} title="Escalar" className="p-1 rounded text-gray-400 hover:text-orange-500"><Maximize2 size={12} /></button>
                        </PermissionGate>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* Tasks */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Tasks</p>
            {tasksQ.isLoading ? <LoadingSpinner /> : tasks.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nenhuma task.</p>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-400">
                  <th className="py-1 font-medium">Task ID</th><th className="py-1 font-medium">Status</th>
                  <th className="py-1 font-medium">Launch</th><th className="py-1 font-medium">CPU/Mem</th><th></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {tasks.map((t, i) => (
                    <tr key={i}>
                      <td className="py-1.5 font-mono text-gray-600 dark:text-gray-400">{t.task_id?.slice(0, 12)}</td>
                      <td className="py-1.5 text-gray-600 dark:text-gray-300">{t.last_status}</td>
                      <td className="py-1.5 text-gray-500">{t.launch_type || '—'}</td>
                      <td className="py-1.5 text-gray-500">{t.cpu}/{t.memory}</td>
                      <td className="py-1.5 text-right">
                        <PermissionGate permission="resources.start_stop">
                          <button onClick={() => handleStop(t.task_id)} title="Parar task" className="p-1 rounded text-gray-400 hover:text-red-500"><Square size={12} /></button>
                        </PermissionGate>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {scaleTarget && (
        <ScaleModal service={scaleTarget} onClose={() => setScaleTarget(null)} onScale={handleScale} busy={busy} />
      )}
    </div>
  );
};

const ScaleModal = ({ service, onClose, onScale, busy }) => {
  const [count, setCount] = useState(service.desired_count ?? 1);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-900 dark:text-gray-100">Escalar serviço ECS</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{service.name}</p>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Desired count</label>
        <input type="number" min={0} value={count} onChange={(e) => setCount(Math.max(0, parseInt(e.target.value || '0', 10)))}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500" />
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">Cancelar</button>
          <button onClick={() => onScale(service.name, count)} disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
            {busy && <RefreshCw className="w-4 h-4 animate-spin" />} Escalar
          </button>
        </div>
      </div>
    </div>
  );
};

const AwsECS = () => {
  const { toast } = useToast();
  const q = useQuery({ queryKey: ['aws-ecs'], queryFn: () => awsService.listEcsClusters(), retry: false });
  if (q.error?.response?.status === 400) return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  const clusters = q.data?.clusters || [];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Boxes size={20} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">ECS / Fargate</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{q.data?.region || ''} · {clusters.length} cluster(s)</p>
            </div>
          </div>
          <button onClick={() => q.refetch()} disabled={q.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner text="Carregando clusters ECS..." /></div>
        ) : clusters.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhum cluster ECS encontrado.</p>
        ) : (
          <div className="space-y-2">
            {clusters.map((c) => <ClusterPanel key={c.arn} cluster={c} toast={toast} />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AwsECS;
