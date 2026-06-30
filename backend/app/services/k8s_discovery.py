"""Descoberta de clusters Kubernetes gerenciados a partir das CloudAccounts.

MVP: AKS (Azure). EKS/GKE são stubs para V1.
Cada função retorna uma lista de dicts prontos para persistir em k8s_clusters:
{name, source, provider_cluster_id, region, distribution, k8s_version,
 endpoint, kubeconfig (dict)}.
"""
import logging

logger = logging.getLogger(__name__)


def discover_aks(azure_service) -> list:
    """Lista clusters AKS da subscription e extrai o kubeconfig de cada um.

    Usa o `credential` e `subscription_id` já configurados no AzureService.
    Requer no Service Principal: Microsoft.ContainerService/managedClusters/read
    e .../listClusterUserCredential/action.
    """
    try:
        from azure.mgmt.containerservice import ContainerServiceClient
        import yaml
    except Exception as e:
        logger.error(f"Dependência de AKS ausente: {e}")
        return []

    results = []
    try:
        cs_client = ContainerServiceClient(
            azure_service.credential, azure_service.subscription_id
        )
        for mc in cs_client.managed_clusters.list():
            # resource group fica no id: /subscriptions/.../resourceGroups/<rg>/...
            rg = None
            try:
                parts = mc.id.split("/")
                rg = parts[parts.index("resourceGroups") + 1]
            except Exception:
                pass

            kubeconfig_dict = None
            try:
                creds = cs_client.managed_clusters.list_cluster_user_credentials(
                    rg, mc.name
                )
                if creds and creds.kubeconfigs:
                    raw = creds.kubeconfigs[0].value  # bytes (YAML)
                    kubeconfig_dict = yaml.safe_load(
                        raw.decode("utf-8") if isinstance(raw, bytes) else raw
                    )
            except Exception as e:
                logger.warning(f"Falha ao obter kubeconfig do AKS {mc.name}: {e}")

            results.append({
                "name": mc.name,
                "source": "aks",
                "provider_cluster_id": mc.id,
                "region": mc.location,
                "distribution": "AKS",
                "k8s_version": getattr(mc, "kubernetes_version", None),
                "endpoint": getattr(mc, "fqdn", None),
                "node_count": _aks_node_count(mc),
                "kubeconfig": kubeconfig_dict,
            })
    except Exception as e:
        logger.error(f"Erro descobrindo clusters AKS: {e}")
        return results
    return results


def _aks_node_count(mc) -> int:
    try:
        return sum((ap.count or 0) for ap in (mc.agent_pool_profiles or []))
    except Exception:
        return None


def discover_eks(aws_service) -> list:
    """Lista clusters EKS da região do AWSService.

    Não armazena kubeconfig estático — o token EKS expira (~15min). Grava um
    `eks_ref` (cluster_name, region, endpoint, ca) e o token é regenerado a cada
    conexão via `aws_service.get_eks_token()`. Requer no IAM:
    eks:ListClusters, eks:DescribeCluster e sts:GetCallerIdentity.
    """
    results = []
    try:
        eks = aws_service.eks_client
        names = eks.list_clusters().get("clusters", [])
        for name in names:
            try:
                c = eks.describe_cluster(name=name)["cluster"]
            except Exception as e:
                logger.warning(f"Falha ao descrever EKS {name}: {e}")
                continue
            ca = (c.get("certificateAuthority") or {}).get("data")
            results.append({
                "name": name,
                "source": "eks",
                "provider_cluster_id": c.get("arn"),
                "region": getattr(aws_service, "region", None),
                "distribution": "EKS",
                "k8s_version": c.get("version"),
                "endpoint": c.get("endpoint"),
                "node_count": None,
                # marcador para reconexão on-demand (sem kubeconfig estático)
                "eks_ref": {
                    "cluster_name": name,
                    "region": getattr(aws_service, "region", None),
                    "endpoint": c.get("endpoint"),
                    "ca": ca,
                },
            })
    except Exception as e:
        logger.error(f"Erro descobrindo clusters EKS: {e}")
        return results
    return results


def discover_gke(gcp_service) -> list:
    """Stub — implementado na V2 (google-cloud-container)."""
    return []
