import { Boxes, Server, Trash2, RefreshCw, CheckCircle2, Cpu } from 'lucide-react';
import WorkloadStatusBadge from './WorkloadStatusBadge';

const SOURCE_BADGE = {
  aks:    { label: 'AKS', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  eks:    { label: 'EKS', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  gke:    { label: 'GKE', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  manual: { label: 'Manual', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

const ClusterCard = ({ cluster, active, onSelect, onTest, onDelete, testing }) => {
  const src = SOURCE_BADGE[cluster.source] || SOURCE_BADGE.manual;

  return (
    <div
      onClick={() => onSelect(cluster.id)}
      className={`rounded-xl border bg-white dark:bg-gray-800/60 shadow-sm p-4 cursor-pointer transition-all ${
        active
          ? 'border-cyan-400 dark:border-cyan-600 ring-1 ring-cyan-300 dark:ring-cyan-700'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex-shrink-0">
          <Boxes size={18} className="text-cyan-600 dark:text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{cluster.name}</p>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${src.cls}`}>{src.label}</span>
            {active && <CheckCircle2 size={13} className="text-cyan-500" />}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-gray-500 dark:text-gray-400">
            <WorkloadStatusBadge status={cluster.status} />
            {cluster.k8s_version && <span>v{cluster.k8s_version}</span>}
            {cluster.region && <span>· {cluster.region}</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60">
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {cluster.node_count != null && (
            <span className="inline-flex items-center gap-1"><Server size={11} /> {cluster.node_count} nodes</span>
          )}
          {cluster.distribution && (
            <span className="inline-flex items-center gap-1"><Cpu size={11} /> {cluster.distribution}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onTest(cluster.id); }}
            disabled={testing}
            title="Testar conexão"
            className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 disabled:opacity-50"
          >
            <RefreshCw size={13} className={testing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(cluster); }}
            title="Remover cluster"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClusterCard;
