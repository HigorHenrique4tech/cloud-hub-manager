"""Kubernetes service — leitura agentless de clusters via API server.

Construído a partir de um kubeconfig (dict) ou de server+token+ca.
Espelha o padrão de AzureService: lazy clients, todos os métodos retornam
Dict {success, error, data} e NUNCA levantam exceção para o chamador.
Read-only (MVP) — nenhuma operação de escrita aqui.
"""
import logging
import os
import tempfile
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

try:
    from kubernetes import client, config as k8s_config
    from kubernetes.client.rest import ApiException
    _K8S_AVAILABLE = True
except Exception:  # pragma: no cover - dependência instalada em runtime
    client = None
    k8s_config = None
    ApiException = Exception
    _K8S_AVAILABLE = False


def _age(ts) -> str:
    """Idade legível a partir de um creation_timestamp (datetime tz-aware)."""
    if not ts:
        return ""
    now = datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    delta = now - ts
    secs = int(delta.total_seconds())
    if secs < 60:
        return f"{secs}s"
    mins = secs // 60
    if mins < 60:
        return f"{mins}m"
    hrs = mins // 60
    if hrs < 24:
        return f"{hrs}h"
    days = hrs // 24
    return f"{days}d"


def _iso(ts):
    return ts.isoformat() if ts else None


class K8sService:
    """Cliente read-only de um cluster Kubernetes."""

    def __init__(self, kubeconfig: dict = None, server: str = None,
                 token: str = None, ca_cert: str = None):
        self._kubeconfig = kubeconfig
        self._server = server
        self._token = token
        self._ca_cert = ca_cert
        self._api_client = None
        self._ca_file = None

    # ── Lazy client ───────────────────────────────────────────────────────────

    @property
    def api_client(self):
        if not _K8S_AVAILABLE:
            raise RuntimeError("Biblioteca 'kubernetes' não instalada no backend.")
        if self._api_client is None:
            cfg = client.Configuration()
            if self._kubeconfig:
                k8s_config.load_kube_config_from_dict(
                    self._kubeconfig, client_configuration=cfg
                )
            else:
                cfg.host = self._server
                cfg.api_key = {"authorization": f"Bearer {self._token}"}
                cfg.api_key_prefix = {"authorization": "Bearer"}
                if self._ca_cert:
                    fd, path = tempfile.mkstemp(suffix=".crt")
                    with os.fdopen(fd, "w") as fh:
                        fh.write(self._ca_cert)
                    self._ca_file = path
                    cfg.ssl_ca_cert = path
                else:
                    cfg.verify_ssl = False
            self._api_client = client.ApiClient(cfg)
        return self._api_client

    @property
    def core_v1(self):
        return client.CoreV1Api(self.api_client)

    @property
    def apps_v1(self):
        return client.AppsV1Api(self.api_client)

    @property
    def networking_v1(self):
        return client.NetworkingV1Api(self.api_client)

    @property
    def batch_v1(self):
        return client.BatchV1Api(self.api_client)

    @property
    def version_api(self):
        return client.VersionApi(self.api_client)

    # ── Connection ────────────────────────────────────────────────────────────

    def test_connection(self) -> dict:
        try:
            v = self.version_api.get_code()
            return {
                "success": True,
                "version": f"{v.major}.{v.minor}",
                "git_version": v.git_version,
                "platform": v.platform,
            }
        except Exception as e:
            logger.warning(f"K8s test_connection falhou: {e}")
            return {"success": False, "error": str(e)}

    # ── Namespaces / Nodes ────────────────────────────────────────────────────

    def list_namespaces(self) -> dict:
        try:
            items = self.core_v1.list_namespace().items
            namespaces = [{
                "name": ns.metadata.name,
                "status": ns.status.phase if ns.status else None,
                "age": _age(ns.metadata.creation_timestamp),
            } for ns in items]
            return {"success": True, "total": len(namespaces), "namespaces": namespaces}
        except Exception as e:
            logger.error(f"Erro listando namespaces: {e}")
            return {"success": False, "error": str(e), "namespaces": []}

    def list_nodes(self) -> dict:
        try:
            items = self.core_v1.list_node().items
            nodes = []
            for n in items:
                conditions = {c.type: c.status for c in (n.status.conditions or [])} if n.status else {}
                ready = conditions.get("Ready") == "True"
                cap = n.status.capacity or {} if n.status else {}
                alloc = n.status.allocatable or {} if n.status else {}
                info = n.status.node_info if n.status else None
                roles = [k.split("/")[-1] for k in (n.metadata.labels or {})
                         if k.startswith("node-role.kubernetes.io/")]
                nodes.append({
                    "name": n.metadata.name,
                    "ready": ready,
                    "roles": roles or ["worker"],
                    "cpu_capacity": cap.get("cpu"),
                    "memory_capacity": cap.get("memory"),
                    "cpu_allocatable": alloc.get("cpu"),
                    "memory_allocatable": alloc.get("memory"),
                    "kubelet_version": info.kubelet_version if info else None,
                    "os_image": info.os_image if info else None,
                    "age": _age(n.metadata.creation_timestamp),
                })
            return {"success": True, "total": len(nodes), "nodes": nodes}
        except Exception as e:
            logger.error(f"Erro listando nodes: {e}")
            return {"success": False, "error": str(e), "nodes": []}

    # ── Workloads ─────────────────────────────────────────────────────────────

    def list_pods(self, namespace: str = None) -> dict:
        try:
            if namespace:
                items = self.core_v1.list_namespaced_pod(namespace).items
            else:
                items = self.core_v1.list_pod_for_all_namespaces().items
            pods = []
            for p in items:
                statuses = p.status.container_statuses or [] if p.status else []
                restarts = sum(cs.restart_count for cs in statuses)
                ready = sum(1 for cs in statuses if cs.ready)
                pods.append({
                    "name": p.metadata.name,
                    "namespace": p.metadata.namespace,
                    "phase": p.status.phase if p.status else None,
                    "node": p.spec.node_name if p.spec else None,
                    "ready": f"{ready}/{len(statuses)}" if statuses else "0/0",
                    "restarts": restarts,
                    "pod_ip": p.status.pod_ip if p.status else None,
                    "containers": [c.name for c in (p.spec.containers or [])] if p.spec else [],
                    "age": _age(p.metadata.creation_timestamp),
                })
            return {"success": True, "total": len(pods), "pods": pods}
        except Exception as e:
            logger.error(f"Erro listando pods: {e}")
            return {"success": False, "error": str(e), "pods": []}

    def list_deployments(self, namespace: str = None) -> dict:
        try:
            if namespace:
                items = self.apps_v1.list_namespaced_deployment(namespace).items
            else:
                items = self.apps_v1.list_deployment_for_all_namespaces().items
            deps = []
            for d in items:
                spec_replicas = d.spec.replicas if d.spec else 0
                ready_replicas = d.status.ready_replicas if d.status else 0
                deps.append({
                    "name": d.metadata.name,
                    "namespace": d.metadata.namespace,
                    "replicas": spec_replicas or 0,
                    "ready_replicas": ready_replicas or 0,
                    "available": (d.status.available_replicas if d.status else 0) or 0,
                    "images": [c.image for c in (d.spec.template.spec.containers or [])] if d.spec and d.spec.template else [],
                    "age": _age(d.metadata.creation_timestamp),
                })
            return {"success": True, "total": len(deps), "deployments": deps}
        except Exception as e:
            logger.error(f"Erro listando deployments: {e}")
            return {"success": False, "error": str(e), "deployments": []}

    def list_services(self, namespace: str = None) -> dict:
        try:
            if namespace:
                items = self.core_v1.list_namespaced_service(namespace).items
            else:
                items = self.core_v1.list_service_for_all_namespaces().items
            svcs = []
            for s in items:
                ports = [{
                    "port": p.port, "target_port": str(p.target_port),
                    "protocol": p.protocol, "node_port": p.node_port,
                } for p in (s.spec.ports or [])] if s.spec else []
                ext_ip = None
                if s.status and s.status.load_balancer and s.status.load_balancer.ingress:
                    ing = s.status.load_balancer.ingress[0]
                    ext_ip = ing.ip or ing.hostname
                svcs.append({
                    "name": s.metadata.name,
                    "namespace": s.metadata.namespace,
                    "type": s.spec.type if s.spec else None,
                    "cluster_ip": s.spec.cluster_ip if s.spec else None,
                    "external_ip": ext_ip,
                    "ports": ports,
                    "selector": s.spec.selector or {} if s.spec else {},
                    "age": _age(s.metadata.creation_timestamp),
                })
            return {"success": True, "total": len(svcs), "services": svcs}
        except Exception as e:
            logger.error(f"Erro listando services: {e}")
            return {"success": False, "error": str(e), "services": []}

    def list_jobs(self, namespace: str = None) -> dict:
        try:
            if namespace:
                items = self.batch_v1.list_namespaced_job(namespace).items
            else:
                items = self.batch_v1.list_job_for_all_namespaces().items
            jobs = [{
                "name": j.metadata.name,
                "namespace": j.metadata.namespace,
                "completions": j.spec.completions if j.spec else None,
                "succeeded": (j.status.succeeded if j.status else 0) or 0,
                "failed": (j.status.failed if j.status else 0) or 0,
                "active": (j.status.active if j.status else 0) or 0,
                "age": _age(j.metadata.creation_timestamp),
            } for j in items]
            return {"success": True, "total": len(jobs), "jobs": jobs}
        except Exception as e:
            logger.error(f"Erro listando jobs: {e}")
            return {"success": False, "error": str(e), "jobs": []}

    def list_cronjobs(self, namespace: str = None) -> dict:
        try:
            if namespace:
                items = self.batch_v1.list_namespaced_cron_job(namespace).items
            else:
                items = self.batch_v1.list_cron_job_for_all_namespaces().items
            cjs = [{
                "name": c.metadata.name,
                "namespace": c.metadata.namespace,
                "schedule": c.spec.schedule if c.spec else None,
                "suspend": c.spec.suspend if c.spec else False,
                "active": len(c.status.active) if c.status and c.status.active else 0,
                "last_schedule": _iso(c.status.last_schedule_time) if c.status else None,
                "age": _age(c.metadata.creation_timestamp),
            } for c in items]
            return {"success": True, "total": len(cjs), "cronjobs": cjs}
        except Exception as e:
            logger.error(f"Erro listando cronjobs: {e}")
            return {"success": False, "error": str(e), "cronjobs": []}

    # ── Networking / Ingress ──────────────────────────────────────────────────

    def list_ingresses(self, namespace: str = None) -> dict:
        try:
            if namespace:
                items = self.networking_v1.list_namespaced_ingress(namespace).items
            else:
                items = self.networking_v1.list_ingress_for_all_namespaces().items
            ingresses = []
            for ing in items:
                rules = []
                for r in (ing.spec.rules or []) if ing.spec else []:
                    paths = []
                    if r.http:
                        for pth in (r.http.paths or []):
                            backend = ""
                            if pth.backend and pth.backend.service:
                                backend = f"{pth.backend.service.name}:{pth.backend.service.port.number if pth.backend.service.port else ''}"
                            paths.append({"path": pth.path, "backend": backend})
                    rules.append({"host": r.host, "paths": paths})
                tls = []
                for t in (ing.spec.tls or []) if ing.spec else []:
                    tls.append({"hosts": t.hosts or [], "secret_name": t.secret_name})
                lb = []
                if ing.status and ing.status.load_balancer and ing.status.load_balancer.ingress:
                    lb = [(i.ip or i.hostname) for i in ing.status.load_balancer.ingress]
                ingresses.append({
                    "name": ing.metadata.name,
                    "namespace": ing.metadata.namespace,
                    "ingress_class": ing.spec.ingress_class_name if ing.spec else None,
                    "rules": rules,
                    "tls": tls,
                    "load_balancer": lb,
                    "age": _age(ing.metadata.creation_timestamp),
                })
            return {"success": True, "total": len(ingresses), "ingresses": ingresses}
        except Exception as e:
            logger.error(f"Erro listando ingresses: {e}")
            return {"success": False, "error": str(e), "ingresses": []}

    # ── Events ────────────────────────────────────────────────────────────────

    def list_events(self, namespace: str = None, limit: int = 200) -> dict:
        try:
            if namespace:
                items = self.core_v1.list_namespaced_event(namespace, limit=limit).items
            else:
                items = self.core_v1.list_event_for_all_namespaces(limit=limit).items
            events = [{
                "namespace": e.metadata.namespace,
                "type": e.type,
                "reason": e.reason,
                "message": e.message,
                "object": f"{e.involved_object.kind}/{e.involved_object.name}" if e.involved_object else None,
                "count": e.count,
                "last_seen": _iso(e.last_timestamp or e.event_time),
            } for e in items]
            # mais recentes primeiro
            events.sort(key=lambda x: x["last_seen"] or "", reverse=True)
            return {"success": True, "total": len(events), "events": events}
        except Exception as e:
            logger.error(f"Erro listando events: {e}")
            return {"success": False, "error": str(e), "events": []}

    # ── Logs ──────────────────────────────────────────────────────────────────

    def get_pod_logs(self, namespace: str, pod: str,
                     container: str = None, tail: int = 500) -> dict:
        try:
            logs = self.core_v1.read_namespaced_pod_log(
                name=pod, namespace=namespace, container=container,
                tail_lines=tail, timestamps=True,
            )
            return {"success": True, "logs": logs}
        except Exception as e:
            logger.warning(f"Erro lendo logs de {namespace}/{pod}: {e}")
            return {"success": False, "error": str(e), "logs": ""}

    # ── Overview + Topology ───────────────────────────────────────────────────

    def get_overview(self) -> dict:
        """Resumo agregado do cluster para a tela de Clusters."""
        try:
            ver = self.test_connection()
            nodes = self.list_nodes()
            pods = self.list_pods()
            deps = self.list_deployments()
            ns = self.list_namespaces()
            pod_list = pods.get("pods", [])
            failing = [p for p in pod_list
                       if p["phase"] not in ("Running", "Succeeded")
                       or (p["restarts"] or 0) >= 5]
            node_list = nodes.get("nodes", [])
            nodes_ready = sum(1 for n in node_list if n["ready"])
            return {
                "success": True,
                "version": ver.get("version"),
                "nodes_total": len(node_list),
                "nodes_ready": nodes_ready,
                "namespaces": ns.get("total", 0),
                "pods_total": len(pod_list),
                "pods_failing": len(failing),
                "deployments": deps.get("total", 0),
                "health_score": self._health_score(node_list, pod_list),
            }
        except Exception as e:
            logger.error(f"Erro no overview: {e}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def _health_score(nodes: list, pods: list) -> int:
        """Score 0-100: nodes prontos + pods saudáveis."""
        score = 100
        if nodes:
            not_ready = sum(1 for n in nodes if not n["ready"])
            score -= int((not_ready / len(nodes)) * 40)
        if pods:
            unhealthy = sum(1 for p in pods
                            if p["phase"] not in ("Running", "Succeeded")
                            or (p["restarts"] or 0) >= 5)
            score -= int((unhealthy / len(pods)) * 60)
        return max(0, min(100, score))

    def build_topology(self, namespace: str) -> dict:
        """Grafo Ingress → Service → Deployment → Pods por namespace."""
        try:
            ingresses = self.list_ingresses(namespace).get("ingresses", [])
            services = self.list_services(namespace).get("services", [])
            deployments = self.list_deployments(namespace).get("deployments", [])
            pods = self.list_pods(namespace).get("pods", [])

            nodes = []
            edges = []
            for ing in ingresses:
                ing_id = f"ing/{ing['name']}"
                nodes.append({"id": ing_id, "type": "ingress", "label": ing["name"]})
                for rule in ing["rules"]:
                    for path in rule["paths"]:
                        svc_name = (path["backend"] or "").split(":")[0]
                        if svc_name:
                            edges.append({"from": ing_id, "to": f"svc/{svc_name}"})
            for svc in services:
                nodes.append({"id": f"svc/{svc['name']}", "type": "service",
                              "label": svc["name"], "service_type": svc["type"]})
            for dep in deployments:
                nodes.append({"id": f"deploy/{dep['name']}", "type": "deployment",
                              "label": dep["name"],
                              "replicas": f"{dep['ready_replicas']}/{dep['replicas']}"})
            # liga service → deployment por interseção de selector/labels (heurística por nome)
            for svc in services:
                sel = svc.get("selector") or {}
                app = sel.get("app") or sel.get("app.kubernetes.io/name")
                if app:
                    for dep in deployments:
                        if app in dep["name"] or dep["name"] in (app or ""):
                            edges.append({"from": f"svc/{svc['name']}", "to": f"deploy/{dep['name']}"})
            return {
                "success": True,
                "namespace": namespace,
                "nodes": nodes,
                "edges": edges,
                "counts": {
                    "ingresses": len(ingresses), "services": len(services),
                    "deployments": len(deployments), "pods": len(pods),
                },
            }
        except Exception as e:
            logger.error(f"Erro construindo topologia: {e}")
            return {"success": False, "error": str(e), "nodes": [], "edges": []}

    # ── Findings (V1) ─────────────────────────────────────────────────────────

    def get_findings(self) -> dict:
        """Detecta problemas comuns no cluster (read-only)."""
        try:
            findings = []
            pods = self.list_pods().get("pods", [])
            for p in pods:
                if p["phase"] not in ("Running", "Succeeded"):
                    findings.append({
                        "severity": "high", "type": "pod_not_running",
                        "resource": f"{p['namespace']}/{p['name']}",
                        "title": f"Pod {p['name']} em {p['phase']}",
                        "detail": f"namespace {p['namespace']}",
                    })
                elif (p["restarts"] or 0) >= 5:
                    findings.append({
                        "severity": "medium", "type": "high_restarts",
                        "resource": f"{p['namespace']}/{p['name']}",
                        "title": f"Pod {p['name']} reiniciou {p['restarts']}x",
                        "detail": f"namespace {p['namespace']}",
                    })
            nodes = self.list_nodes().get("nodes", [])
            for n in nodes:
                if not n["ready"]:
                    findings.append({
                        "severity": "critical", "type": "node_not_ready",
                        "resource": n["name"],
                        "title": f"Node {n['name']} NotReady",
                        "detail": "; ".join(n.get("roles") or []),
                    })
            ingresses = self.list_ingresses().get("ingresses", [])
            for ing in ingresses:
                if not (ing.get("tls") or []):
                    findings.append({
                        "severity": "medium", "type": "ingress_no_tls",
                        "resource": f"{ing['namespace']}/{ing['name']}",
                        "title": f"Ingress {ing['name']} sem TLS",
                        "detail": f"namespace {ing['namespace']}",
                    })
            jobs = self.list_jobs().get("jobs", [])
            for j in jobs:
                if (j.get("failed") or 0) > 0:
                    findings.append({
                        "severity": "high", "type": "job_failed",
                        "resource": f"{j['namespace']}/{j['name']}",
                        "title": f"Job {j['name']} com {j['failed']} falha(s)",
                        "detail": f"namespace {j['namespace']}",
                    })
            order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            findings.sort(key=lambda f: order.get(f["severity"], 9))
            counts = {sev: sum(1 for f in findings if f["severity"] == sev)
                      for sev in ("critical", "high", "medium", "low")}
            return {"success": True, "total": len(findings), "counts": counts, "findings": findings}
        except Exception as e:
            logger.error(f"Erro detectando findings: {e}")
            return {"success": False, "error": str(e), "findings": []}

    # ── Ações de escrita (V1) ─────────────────────────────────────────────────

    def scale_deployment(self, namespace: str, name: str, replicas: int) -> dict:
        """Ajusta o número de réplicas de um deployment."""
        try:
            self.apps_v1.patch_namespaced_deployment_scale(
                name=name, namespace=namespace,
                body={"spec": {"replicas": int(replicas)}},
            )
            return {"success": True, "name": name, "namespace": namespace, "replicas": int(replicas)}
        except Exception as e:
            logger.error(f"Erro escalando {namespace}/{name}: {e}")
            return {"success": False, "error": str(e)}

    def restart_deployment(self, namespace: str, name: str) -> dict:
        """Rollout restart idiomático — patch da annotation restartedAt no template."""
        try:
            now = datetime.now(timezone.utc).isoformat()
            body = {
                "spec": {"template": {"metadata": {"annotations": {
                    "kubectl.kubernetes.io/restartedAt": now
                }}}}
            }
            self.apps_v1.patch_namespaced_deployment(
                name=name, namespace=namespace, body=body,
            )
            return {"success": True, "name": name, "namespace": namespace, "restarted_at": now}
        except Exception as e:
            logger.error(f"Erro reiniciando {namespace}/{name}: {e}")
            return {"success": False, "error": str(e)}
