import api, { wsUrl } from './api';

export const k8sService = {
  // ── Cluster registry ──────────────────────────────────────────────────────
  listClusters:     ()              => api.get(wsUrl('/k8s/clusters')).then(r => r.data),
  importKubeconfig: (body)          => api.post(wsUrl('/k8s/clusters'), body).then(r => r.data),
  discoverClusters: ()              => api.post(wsUrl('/k8s/clusters/discover')).then(r => r.data),
  testCluster:      (id)            => api.post(wsUrl(`/k8s/clusters/${id}/test`)).then(r => r.data),
  deleteCluster:    (id)            => api.delete(wsUrl(`/k8s/clusters/${id}`)).then(r => r.data),

  // ── Read-only cluster data ────────────────────────────────────────────────
  getOverview:    (id)              => api.get(wsUrl(`/k8s/clusters/${id}/overview`)).then(r => r.data),
  getNamespaces:  (id)              => api.get(wsUrl(`/k8s/clusters/${id}/namespaces`)).then(r => r.data),
  getWorkloads:   (id, namespace)   => api.get(wsUrl(`/k8s/clusters/${id}/workloads`), { params: { namespace: namespace || undefined } }).then(r => r.data),
  getIngresses:   (id, namespace)   => api.get(wsUrl(`/k8s/clusters/${id}/ingresses`), { params: { namespace: namespace || undefined } }).then(r => r.data),
  getTopology:    (id, namespace)   => api.get(wsUrl(`/k8s/clusters/${id}/topology`), { params: { namespace } }).then(r => r.data),
  getEvents:      (id, namespace)   => api.get(wsUrl(`/k8s/clusters/${id}/events`), { params: { namespace: namespace || undefined } }).then(r => r.data),
  getNodes:       (id)              => api.get(wsUrl(`/k8s/clusters/${id}/nodes`)).then(r => r.data),
  getPodLogs:     (id, ns, pod, container, tail = 500) =>
    api.get(wsUrl(`/k8s/clusters/${id}/pods/${ns}/${pod}/logs`), { params: { container: container || undefined, tail } }).then(r => r.data),
};

export default k8sService;
