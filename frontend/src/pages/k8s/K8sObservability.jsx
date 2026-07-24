import { useState } from 'react';
import { Activity, RefreshCw, Boxes, Server, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import { useActiveCluster, useNamespaces, useEvents, useNodes } from '../../hooks/useK8s';

const NoCluster = () => (
  <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
    <Boxes size={48} className="mb-4 opacity-20" />
    <p className="text-base font-medium">Nenhum cluster selecionado</p>
    <Link to="/k8s" className="text-sm mt-1 text-cyan-600 dark:text-cyan-400 hover:underline">Selecionar um cluster</Link>
  </div>
);

const TABS = [
  { key: 'events', label: 'Eventos', icon: Activity },
  { key: 'nodes', label: 'Nodes', icon: Server },
];

const EventsTab = ({ clusterId, namespace, setNamespace }) => {
  const nsQ = useNamespaces(clusterId);
  const eventsQ = useEvents(clusterId, namespace);
  const events = eventsQ.data?.events || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={namespace} onChange={(e) => setNamespace(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500">
          <option value="">Todos os namespaces</option>
          {(nsQ.data?.namespaces || []).map((ns) => <option key={ns.name} value={ns.name}>{ns.name}</option>)}
        </select>
        <button onClick={() => eventsQ.refetch()} disabled={eventsQ.isFetching}
          className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          <RefreshCw size={14} className={eventsQ.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
      {eventsQ.isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner text="Carregando eventos..." /></div>
      ) : events.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhum evento recente.</p>
      ) : (
        <div className="space-y-1.5">
          {events.map((e, i) => (
            <div key={i} className={`flex items-start gap-3 px-3 py-2 rounded-lg border ${
              e.type === 'Warning'
                ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700/40'
                : 'bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700'
            }`}>
              {e.type === 'Warning'
                ? <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                : <Activity size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{e.reason}</span>
                  <span className="text-[10px] text-gray-400">{e.object}</span>
                  {e.count > 1 && <span className="text-[10px] text-gray-400">×{e.count}</span>}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{e.message}</p>
              </div>
              <span className="text-[10px] text-gray-400 flex-shrink-0">
                {e.last_seen ? new Date(e.last_seen).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const NodesTab = ({ clusterId }) => {
  const nodesQ = useNodes(clusterId);
  const nodes = nodesQ.data?.nodes || [];
  if (nodesQ.isLoading) return <div className="flex justify-center py-12"><LoadingSpinner text="Carregando nodes..." /></div>;
  if (nodes.length === 0) return <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhum node encontrado.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800/80">
          <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
            {['Nome', 'Status', 'Roles', 'CPU', 'Memória', 'Kubelet', 'OS', 'Idade'].map(h =>
              <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {nodes.map((n, i) => (
            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200 max-w-[220px] truncate">{n.name}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  n.ready ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
                  {n.ready ? 'Ready' : 'NotReady'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-gray-500">{(n.roles || []).join(', ')}</td>
              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{n.cpu_capacity}</td>
              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{n.memory_capacity}</td>
              <td className="px-4 py-2.5 text-gray-500 text-xs">{n.kubelet_version}</td>
              <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[180px] truncate">{n.os_image}</td>
              <td className="px-4 py-2.5 text-gray-400">{n.age}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const K8sObservability = () => {
  const [activeCluster] = useActiveCluster();
  const [namespace, setNamespace] = useState('');
  const [tab, setTab] = useState('events');

  if (!activeCluster) return <Layout><NoCluster /></Layout>;

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
            <Activity size={18} className="text-cyan-600 dark:text-cyan-400" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Observabilidade</h1>
        </div>

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {tab === 'events'
          ? <EventsTab clusterId={activeCluster} namespace={namespace} setNamespace={setNamespace} />
          : <NodesTab clusterId={activeCluster} />}
      </div>
    </Layout>
  );
};

export default K8sObservability;
