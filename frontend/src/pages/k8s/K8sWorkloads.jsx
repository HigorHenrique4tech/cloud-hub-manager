import { useState } from 'react';
import { Layers, RefreshCw, Boxes } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import WorkloadStatusBadge from '../../components/k8s/WorkloadStatusBadge';
import { useActiveCluster, useNamespaces, useWorkloads } from '../../hooks/useK8s';

const TABS = [
  { key: 'pods', label: 'Pods' },
  { key: 'deployments', label: 'Deployments' },
  { key: 'services', label: 'Services' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'cronjobs', label: 'CronJobs' },
];

const NoCluster = () => (
  <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
    <Boxes size={48} className="mb-4 opacity-20" />
    <p className="text-base font-medium">Nenhum cluster selecionado</p>
    <Link to="/k8s" className="text-sm mt-1 text-cyan-600 dark:text-cyan-400 hover:underline">
      Selecionar um cluster
    </Link>
  </div>
);

const NamespaceSelector = ({ clusterId, namespace, setNamespace }) => {
  const nsQ = useNamespaces(clusterId);
  const namespaces = nsQ.data?.namespaces || [];
  return (
    <select
      value={namespace} onChange={(e) => setNamespace(e.target.value)}
      className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
    >
      <option value="">Todos os namespaces</option>
      {namespaces.map((ns) => <option key={ns.name} value={ns.name}>{ns.name}</option>)}
    </select>
  );
};

const Cell = ({ children, className = '' }) => (
  <td className={`px-4 py-2.5 text-gray-700 dark:text-gray-300 ${className}`}>{children}</td>
);

const K8sWorkloads = () => {
  const [activeCluster] = useActiveCluster();
  const [namespace, setNamespace] = useState('');
  const [tab, setTab] = useState('pods');
  const workloadsQ = useWorkloads(activeCluster, namespace);

  if (!activeCluster) return <Layout><NoCluster /></Layout>;

  const data = workloadsQ.data || {};
  const rows = data[tab] || [];

  const renderHead = () => {
    switch (tab) {
      case 'pods': return ['Nome', 'Namespace', 'Status', 'Ready', 'Restarts', 'Node', 'Idade'];
      case 'deployments': return ['Nome', 'Namespace', 'Réplicas', 'Disponíveis', 'Imagem', 'Idade'];
      case 'services': return ['Nome', 'Namespace', 'Tipo', 'Cluster IP', 'External IP', 'Portas', 'Idade'];
      case 'jobs': return ['Nome', 'Namespace', 'Completados', 'Sucesso', 'Falhas', 'Idade'];
      case 'cronjobs': return ['Nome', 'Namespace', 'Schedule', 'Suspenso', 'Ativos', 'Idade'];
      default: return [];
    }
  };

  const renderRow = (r, i) => {
    switch (tab) {
      case 'pods': return (
        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <Cell className="font-medium max-w-[240px] truncate">{r.name}</Cell>
          <Cell className="text-gray-500">{r.namespace}</Cell>
          <Cell><WorkloadStatusBadge status={r.phase} /></Cell>
          <Cell>{r.ready}</Cell>
          <Cell className={r.restarts > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>{r.restarts}</Cell>
          <Cell className="text-gray-500 max-w-[160px] truncate">{r.node || '—'}</Cell>
          <Cell className="text-gray-400">{r.age}</Cell>
        </tr>
      );
      case 'deployments': return (
        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <Cell className="font-medium max-w-[240px] truncate">{r.name}</Cell>
          <Cell className="text-gray-500">{r.namespace}</Cell>
          <Cell><span className={r.ready_replicas < r.replicas ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>{r.ready_replicas}/{r.replicas}</span></Cell>
          <Cell>{r.available}</Cell>
          <Cell className="text-gray-500 max-w-[260px] truncate font-mono text-xs">{(r.images || []).join(', ')}</Cell>
          <Cell className="text-gray-400">{r.age}</Cell>
        </tr>
      );
      case 'services': return (
        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <Cell className="font-medium max-w-[200px] truncate">{r.name}</Cell>
          <Cell className="text-gray-500">{r.namespace}</Cell>
          <Cell>{r.type}</Cell>
          <Cell className="font-mono text-xs">{r.cluster_ip}</Cell>
          <Cell className="font-mono text-xs">{r.external_ip || '—'}</Cell>
          <Cell className="text-xs">{(r.ports || []).map(p => `${p.port}/${p.protocol}`).join(', ')}</Cell>
          <Cell className="text-gray-400">{r.age}</Cell>
        </tr>
      );
      case 'jobs': return (
        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <Cell className="font-medium max-w-[240px] truncate">{r.name}</Cell>
          <Cell className="text-gray-500">{r.namespace}</Cell>
          <Cell>{r.completions ?? '—'}</Cell>
          <Cell className="text-green-600 dark:text-green-400">{r.succeeded}</Cell>
          <Cell className={r.failed > 0 ? 'text-red-500 font-medium' : ''}>{r.failed}</Cell>
          <Cell className="text-gray-400">{r.age}</Cell>
        </tr>
      );
      case 'cronjobs': return (
        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <Cell className="font-medium max-w-[240px] truncate">{r.name}</Cell>
          <Cell className="text-gray-500">{r.namespace}</Cell>
          <Cell className="font-mono text-xs">{r.schedule}</Cell>
          <Cell>{r.suspend ? 'Sim' : 'Não'}</Cell>
          <Cell>{r.active}</Cell>
          <Cell className="text-gray-400">{r.age}</Cell>
        </tr>
      );
      default: return null;
    }
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Layers size={18} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Workloads</h1>
          </div>
          <div className="flex items-center gap-2">
            <NamespaceSelector clusterId={activeCluster} namespace={namespace} setNamespace={setNamespace} />
            <button onClick={() => workloadsQ.refetch()} disabled={workloadsQ.isFetching}
              className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              <RefreshCw size={14} className={workloadsQ.isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {TABS.map((t) => {
            const count = (data[t.key] || []).length;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                {t.label} {count > 0 && <span className="text-xs text-gray-400">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Table */}
        {workloadsQ.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner text="Carregando workloads..." /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhum recurso encontrado neste namespace.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/80">
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  {renderHead().map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map(renderRow)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default K8sWorkloads;
