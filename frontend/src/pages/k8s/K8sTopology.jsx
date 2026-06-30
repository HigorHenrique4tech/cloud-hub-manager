import { useState, useMemo } from 'react';
import { Share2, RefreshCw, Boxes, Globe, Network, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import k8sService from '../../services/k8sService';
import { useActiveCluster, useNamespaces } from '../../hooks/useK8s';

const NoCluster = () => (
  <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
    <Boxes size={48} className="mb-4 opacity-20" />
    <p className="text-base font-medium">Nenhum cluster selecionado</p>
    <Link to="/k8s" className="text-sm mt-1 text-cyan-600 dark:text-cyan-400 hover:underline">Selecionar um cluster</Link>
  </div>
);

const COL = { ingress: 0, service: 1, deployment: 2 };
const COL_X = [70, 320, 570];
const TYPE_META = {
  ingress:    { icon: Globe,   fill: '#ecfeff', stroke: '#06b6d4', text: '#0e7490' },
  service:    { icon: Network, fill: '#eff6ff', stroke: '#3b82f6', text: '#1d4ed8' },
  deployment: { icon: Layers,  fill: '#f5f3ff', stroke: '#8b5cf6', text: '#6d28d9' },
};
const NODE_W = 170;
const NODE_H = 40;
const ROW_GAP = 56;

// Grafo SVG simples em 3 colunas: Ingress → Service → Deployment.
const TopologyGraph = ({ nodes, edges }) => {
  const layout = useMemo(() => {
    const byCol = { ingress: [], service: [], deployment: [] };
    nodes.forEach((n) => { if (byCol[n.type]) byCol[n.type].push(n); });
    const pos = {};
    Object.entries(byCol).forEach(([type, list]) => {
      list.forEach((n, i) => {
        pos[n.id] = { x: COL_X[COL[type]], y: 40 + i * ROW_GAP, type, node: n };
      });
    });
    const maxRows = Math.max(1, ...Object.values(byCol).map(l => l.length));
    return { pos, height: 80 + maxRows * ROW_GAP };
  }, [nodes, edges]);

  const width = 760;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${layout.height}`} className="min-w-[700px]">
      {edges.map((e, i) => {
        const a = layout.pos[e.from], b = layout.pos[e.to];
        if (!a || !b) return null;
        const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2;
        const x2 = b.x, y2 = b.y + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        return (
          <path key={i} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
        );
      })}
      {Object.values(layout.pos).map(({ x, y, type, node }) => {
        const m = TYPE_META[type];
        return (
          <g key={node.id}>
            <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="8"
              fill={m.fill} stroke={m.stroke} strokeWidth="1.5" />
            <text x={x + 12} y={y + 17} fontSize="11" fontWeight="600" fill={m.text}>
              {(node.label || '').slice(0, 22)}
            </text>
            <text x={x + 12} y={y + 31} fontSize="9" fill="#64748b">
              {type === 'deployment' ? `replicas ${node.replicas || ''}` :
               type === 'service' ? (node.service_type || 'service') : 'ingress'}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const K8sTopology = () => {
  const [activeCluster] = useActiveCluster();
  const [namespace, setNamespace] = useState('');
  const nsQ = useNamespaces(activeCluster);

  const topoQ = useQuery({
    queryKey: ['k8s-topology', activeCluster, namespace],
    queryFn: () => k8sService.getTopology(activeCluster, namespace),
    enabled: !!activeCluster && !!namespace,
    staleTime: 30_000,
    retry: false,
  });

  if (!activeCluster) return <Layout><NoCluster /></Layout>;

  const topo = topoQ.data;
  const namespaces = nsQ.data?.namespaces || [];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Share2 size={18} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Topologia</h1>
          </div>
          <div className="flex items-center gap-2">
            <select value={namespace} onChange={(e) => setNamespace(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500">
              <option value="">Selecione um namespace</option>
              {namespaces.map((ns) => <option key={ns.name} value={ns.name}>{ns.name}</option>)}
            </select>
            <button onClick={() => topoQ.refetch()} disabled={topoQ.isFetching || !namespace}
              className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              <RefreshCw size={14} className={topoQ.isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {!namespace ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-16">
            Selecione um namespace para visualizar a topologia.
          </p>
        ) : topoQ.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner text="Construindo topologia..." /></div>
        ) : !topo?.nodes?.length ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-16">Nenhum recurso neste namespace.</p>
        ) : (
          <>
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cyan-100 border border-cyan-500" /> Ingress {topo.counts?.ingresses}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-500" /> Service {topo.counts?.services}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-100 border border-violet-500" /> Deployment {topo.counts?.deployments}</span>
            </div>
            <div className="card rounded-xl p-4 overflow-x-auto">
              <TopologyGraph nodes={topo.nodes} edges={topo.edges} />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default K8sTopology;
