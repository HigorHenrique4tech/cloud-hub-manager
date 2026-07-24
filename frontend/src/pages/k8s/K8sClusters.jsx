import { useState, useEffect } from 'react';
import { Boxes, Search, RefreshCw, Upload, Server, Activity, AlertCircle, ShieldAlert } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import ClusterCard from '../../components/k8s/ClusterCard';
import ImportKubeconfigModal from '../../components/k8s/ImportKubeconfigModal';
import {
  useClusters, useDiscoverClusters, useTestCluster, useDeleteCluster,
  useActiveCluster, useClusterOverview, useFindings,
} from '../../hooks/useK8s';

const SEV = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low:      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const FindingsPanel = ({ clusterId }) => {
  const findingsQ = useFindings(clusterId);
  const data = findingsQ.data;
  if (!data?.success || data.total === 0) return null;
  return (
    <div className="card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={16} className="text-amber-500" />
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Findings ({data.total})</p>
        <div className="flex items-center gap-1.5 ml-2">
          {['critical', 'high', 'medium'].map((s) => data.counts?.[s] > 0 && (
            <span key={s} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SEV[s]}`}>
              {data.counts[s]} {s}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {data.findings.map((f, i) => (
          <div key={i} className="flex items-start gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 mt-0.5 ${SEV[f.severity] || SEV.low}`}>
              {f.severity}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{f.title}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{f.resource} · {f.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const K8sClusters = () => {
  const clustersQ = useClusters();
  const discoverMut = useDiscoverClusters();
  const testMut = useTestCluster();
  const deleteMut = useDeleteCluster();
  const [activeCluster, setActiveCluster] = useActiveCluster();
  const [showImport, setShowImport] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [discoverMsg, setDiscoverMsg] = useState('');

  const clusters = clustersQ.data?.clusters || [];

  // Auto-seleciona o primeiro cluster se nenhum estiver ativo.
  useEffect(() => {
    if (!activeCluster && clusters.length > 0) setActiveCluster(clusters[0].id);
  }, [clusters, activeCluster, setActiveCluster]);

  const overviewQ = useClusterOverview(activeCluster);
  const overview = overviewQ.data;

  const handleDiscover = async () => {
    setDiscoverMsg('');
    try {
      const res = await discoverMut.mutateAsync();
      if (res.added?.length) setDiscoverMsg(`${res.added.length} cluster(s) adicionado(s): ${res.added.join(', ')}`);
      else setDiscoverMsg(`Nenhum cluster novo encontrado (${res.discovered} verificado(s)).`);
    } catch (err) {
      setDiscoverMsg(err.response?.data?.detail || 'Falha na descoberta.');
    }
  };

  const confirmDelete = async () => {
    await deleteMut.mutateAsync(toDelete.id);
    if (activeCluster === toDelete.id) setActiveCluster(null);
    setToDelete(null);
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Boxes size={22} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Kubernetes</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Gestão unificada de clusters — AKS, EKS, GKE e on-premises
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDiscover}
              disabled={discoverMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 disabled:opacity-50">
              {discoverMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
              Descobrir das contas cloud
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white">
              <Upload size={13} /> Importar kubeconfig
            </button>
          </div>
        </div>

        {discoverMsg && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700/40">
            <AlertCircle className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-cyan-700 dark:text-cyan-400">{discoverMsg}</p>
          </div>
        )}

        {/* Overview do cluster ativo */}
        {activeCluster && overview?.success && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Nodes prontos', value: `${overview.nodes_ready}/${overview.nodes_total}`, icon: Server },
              { label: 'Pods', value: `${overview.pods_total - overview.pods_failing}/${overview.pods_total}`, icon: Activity },
              { label: 'Deployments', value: overview.deployments, icon: Boxes },
              { label: 'Health Score', value: `${overview.health_score}/100`, icon: Activity,
                accent: overview.health_score >= 70 ? 'text-green-500' : overview.health_score >= 40 ? 'text-amber-500' : 'text-red-500' },
            ].map(({ label, value, icon: Icon, accent }) => (
              <div key={label} className="card rounded-xl p-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex-shrink-0">
                  <Icon size={16} className="text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <p className={`text-lg font-bold ${accent || 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Findings do cluster ativo */}
        {activeCluster && overview?.success && <FindingsPanel clusterId={activeCluster} />}

        {/* Lista de clusters */}
        {clustersQ.isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner text="Carregando clusters..." /></div>
        ) : clusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
            <Boxes size={48} className="mb-4 opacity-20" />
            <p className="text-base font-medium">Nenhum cluster registrado</p>
            <p className="text-sm mt-1">Descubra clusters das suas contas cloud ou importe um kubeconfig</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {clusters.map((c) => (
              <ClusterCard
                key={c.id}
                cluster={c}
                active={c.id === activeCluster}
                onSelect={setActiveCluster}
                onTest={(id) => testMut.mutate(id)}
                onDelete={setToDelete}
                testing={testMut.isPending && testMut.variables === c.id}
              />
            ))}
          </div>
        )}
      </div>

      {showImport && (
        <ImportKubeconfigModal onClose={() => setShowImport(false)} onImported={() => clustersQ.refetch()} />
      )}

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setToDelete(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-gray-900 dark:text-gray-100">Remover cluster</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Remover <span className="font-medium">{toDelete.name}</span> do CloudAtlas? O cluster em si não é afetado — apenas o registro e as credenciais armazenadas.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setToDelete(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                Cancelar
              </button>
              <button onClick={confirmDelete} disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default K8sClusters;
