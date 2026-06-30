import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import k8sService from '../services/k8sService';

const ACTIVE_CLUSTER_KEY = 'k8s-active-cluster';

// Seleção de cluster ativo compartilhada entre páginas (localStorage + evento).
export function useActiveCluster() {
  const [clusterId, setClusterIdState] = useState(() => {
    try { return localStorage.getItem(ACTIVE_CLUSTER_KEY) || null; } catch { return null; }
  });

  const setClusterId = useCallback((id) => {
    setClusterIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_CLUSTER_KEY, id);
      else localStorage.removeItem(ACTIVE_CLUSTER_KEY);
    } catch {}
    window.dispatchEvent(new CustomEvent('k8s-active-cluster-changed', { detail: id }));
  }, []);

  useEffect(() => {
    const handler = (e) => setClusterIdState(e.detail);
    window.addEventListener('k8s-active-cluster-changed', handler);
    return () => window.removeEventListener('k8s-active-cluster-changed', handler);
  }, []);

  return [clusterId, setClusterId];
}

// ── Cluster registry ──────────────────────────────────────────────────────────

export function useClusters() {
  return useQuery({
    queryKey: ['k8s-clusters'],
    queryFn: () => k8sService.listClusters(),
    staleTime: 60_000,
    retry: false,
  });
}

export function useDiscoverClusters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => k8sService.discoverClusters(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['k8s-clusters'] }),
  });
}

export function useImportKubeconfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => k8sService.importKubeconfig(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['k8s-clusters'] }),
  });
}

export function useTestCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => k8sService.testCluster(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['k8s-clusters'] }),
  });
}

export function useDeleteCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => k8sService.deleteCluster(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['k8s-clusters'] }),
  });
}

// ── Read-only cluster data ────────────────────────────────────────────────────

export function useClusterOverview(clusterId) {
  return useQuery({
    queryKey: ['k8s-overview', clusterId],
    queryFn: () => k8sService.getOverview(clusterId),
    enabled: !!clusterId,
    staleTime: 30_000,
    retry: false,
  });
}

export function useNamespaces(clusterId) {
  return useQuery({
    queryKey: ['k8s-namespaces', clusterId],
    queryFn: () => k8sService.getNamespaces(clusterId),
    enabled: !!clusterId,
    staleTime: 60_000,
    retry: false,
  });
}

export function useWorkloads(clusterId, namespace) {
  return useQuery({
    queryKey: ['k8s-workloads', clusterId, namespace || 'all'],
    queryFn: () => k8sService.getWorkloads(clusterId, namespace),
    enabled: !!clusterId,
    refetchInterval: 20_000,
    retry: false,
  });
}

export function useIngresses(clusterId, namespace) {
  return useQuery({
    queryKey: ['k8s-ingresses', clusterId, namespace || 'all'],
    queryFn: () => k8sService.getIngresses(clusterId, namespace),
    enabled: !!clusterId,
    staleTime: 30_000,
    retry: false,
  });
}

export function useEvents(clusterId, namespace) {
  return useQuery({
    queryKey: ['k8s-events', clusterId, namespace || 'all'],
    queryFn: () => k8sService.getEvents(clusterId, namespace),
    enabled: !!clusterId,
    refetchInterval: 20_000,
    retry: false,
  });
}

export function useNodes(clusterId) {
  return useQuery({
    queryKey: ['k8s-nodes', clusterId],
    queryFn: () => k8sService.getNodes(clusterId),
    enabled: !!clusterId,
    staleTime: 30_000,
    retry: false,
  });
}

export function useFindings(clusterId) {
  return useQuery({
    queryKey: ['k8s-findings', clusterId],
    queryFn: () => k8sService.getFindings(clusterId),
    enabled: !!clusterId,
    staleTime: 30_000,
    retry: false,
  });
}

// ── Ações de escrita (V1) ──────────────────────────────────────────────────────

export function useScaleDeployment(clusterId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ namespace, name, replicas }) =>
      k8sService.scaleDeployment(clusterId, namespace, name, replicas),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['k8s-workloads', clusterId] }),
  });
}

export function useRestartDeployment(clusterId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ namespace, name }) =>
      k8sService.restartDeployment(clusterId, namespace, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['k8s-workloads', clusterId] }),
  });
}
