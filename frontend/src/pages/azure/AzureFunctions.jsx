import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, RefreshCw, ChevronDown, ChevronRight, Play, Square, RotateCw } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import PermissionGate from '../../components/common/PermissionGate';
import { useToast } from '../../contexts/ToastContext';
import azureService from '../../services/azureservices';

const AppPanel = ({ app, toast, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fnsQ = useQuery({
    queryKey: ['azure-functions', app.resource_group, app.name],
    queryFn: () => azureService.listFunctions(app.resource_group, app.name),
    enabled: open, retry: false,
  });
  const fns = fnsQ.data?.functions || [];

  const action = async (act) => {
    if (act !== 'start' && !window.confirm(`${act === 'stop' ? 'Parar' : 'Reiniciar'} o function app ${app.name}?`)) return;
    setBusy(true);
    try {
      await azureService.functionAppAction(app.resource_group, app.name, act);
      toast.success(`Ação "${act}" executada em ${app.name}.`);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Falha na ação.');
    } finally { setBusy(false); }
  };

  const running = app.state === 'Running';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          <Zap size={16} className="text-yellow-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{app.name}</p>
            <p className="text-[11px] text-gray-400 truncate">{app.default_hostname}</p>
          </div>
        </button>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${running ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>{app.state}</span>
        <PermissionGate permission="resources.start_stop">
          <div className="flex items-center gap-1">
            {!running && <button onClick={() => action('start')} disabled={busy} title="Iniciar" className="p-1.5 rounded text-gray-400 hover:text-green-500 disabled:opacity-50"><Play size={13} /></button>}
            {running && <button onClick={() => action('stop')} disabled={busy} title="Parar" className="p-1.5 rounded text-gray-400 hover:text-amber-500 disabled:opacity-50"><Square size={13} /></button>}
            <button onClick={() => action('restart')} disabled={busy} title="Reiniciar" className="p-1.5 rounded text-gray-400 hover:text-sky-500 disabled:opacity-50"><RotateCw size={13} /></button>
          </div>
        </PermissionGate>
      </div>
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Funções</p>
          {fnsQ.isLoading ? <LoadingSpinner /> : fns.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">Nenhuma função encontrada.</p>
          ) : (
            <div className="space-y-1">
              {fns.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${f.disabled ? 'bg-gray-300' : 'bg-green-500'}`} />
                  <span className="font-medium text-gray-700 dark:text-gray-300">{f.name}</span>
                  {f.trigger && <span className="text-gray-400">· {f.trigger}</span>}
                  {f.disabled && <span className="text-gray-400">(desabilitada)</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AzureFunctions = () => {
  const { toast } = useToast();
  const q = useQuery({ queryKey: ['azure-functionapps'], queryFn: () => azureService.listFunctionApps(), retry: false });
  if (q.error?.response?.status === 400) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;
  const apps = q.data?.function_apps || [];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <Zap size={20} className="text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Function Apps</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{apps.length} function app(s)</p>
            </div>
          </div>
          <button onClick={() => q.refetch()} disabled={q.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner text="Carregando function apps..." /></div>
        ) : apps.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhum Function App encontrado.</p>
        ) : (
          <div className="space-y-2">
            {apps.map((a) => <AppPanel key={a.name} app={a} toast={toast} onChanged={() => q.refetch()} />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AzureFunctions;
