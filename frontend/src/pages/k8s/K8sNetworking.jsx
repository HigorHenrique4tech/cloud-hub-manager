import { useState } from 'react';
import { Network, RefreshCw, Boxes, Globe, Lock, ShieldOff, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import { useActiveCluster, useNamespaces, useIngresses } from '../../hooks/useK8s';

const NoCluster = () => (
  <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
    <Boxes size={48} className="mb-4 opacity-20" />
    <p className="text-base font-medium">Nenhum cluster selecionado</p>
    <Link to="/k8s" className="text-sm mt-1 text-cyan-600 dark:text-cyan-400 hover:underline">Selecionar um cluster</Link>
  </div>
);

const IngressCard = ({ ing }) => {
  const hasTls = (ing.tls || []).length > 0;
  const tlsHosts = new Set((ing.tls || []).flatMap(t => t.hosts || []));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 shadow-sm p-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Globe size={15} className="text-cyan-500" />
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{ing.name}</p>
        <span className="text-xs text-gray-400">· {ing.namespace}</span>
        {ing.ingress_class && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {ing.ingress_class}
          </span>
        )}
        {hasTls
          ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><Lock size={9} /> TLS</span>
          : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><ShieldOff size={9} /> Sem TLS</span>
        }
      </div>

      <div className="space-y-1.5">
        {(ing.rules || []).map((rule, ri) => (
          <div key={ri} className="text-xs">
            <div className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
              {rule.host || '*'}
              {tlsHosts.has(rule.host) && <Lock size={10} className="text-green-500" />}
            </div>
            {(rule.paths || []).map((p, pi) => (
              <div key={pi} className="flex items-center gap-1.5 ml-3 text-gray-500 dark:text-gray-400 font-mono">
                <span>{p.path || '/'}</span>
                <ArrowRight size={10} />
                <span className="text-cyan-600 dark:text-cyan-400">{p.backend || '—'}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60 text-xs text-gray-500 dark:text-gray-400">
        <span>{ing.load_balancer?.length ? ing.load_balancer.join(', ') : 'sem endereço'}</span>
        {hasTls && (
          <span className="font-mono">{ing.tls.map(t => t.secret_name).filter(Boolean).join(', ')}</span>
        )}
      </div>
    </div>
  );
};

const K8sNetworking = () => {
  const [activeCluster] = useActiveCluster();
  const [namespace, setNamespace] = useState('');
  const nsQ = useNamespaces(activeCluster);
  const ingQ = useIngresses(activeCluster, namespace);

  if (!activeCluster) return <Layout><NoCluster /></Layout>;

  const ingresses = ingQ.data?.ingresses || [];
  const withoutTls = ingresses.filter(i => !(i.tls || []).length).length;

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Network size={18} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Networking & Ingress</h1>
              {withoutTls > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{withoutTls} ingress(es) sem TLS</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={namespace} onChange={(e) => setNamespace(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500">
              <option value="">Todos os namespaces</option>
              {(nsQ.data?.namespaces || []).map((ns) => <option key={ns.name} value={ns.name}>{ns.name}</option>)}
            </select>
            <button onClick={() => ingQ.refetch()} disabled={ingQ.isFetching}
              className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              <RefreshCw size={14} className={ingQ.isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {ingQ.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner text="Carregando ingresses..." /></div>
        ) : ingresses.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhum ingress encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {ingresses.map((ing, i) => <IngressCard key={i} ing={ing} />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default K8sNetworking;
