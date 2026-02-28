"""
Security Service — Basic security checks for AWS, Azure, and GCP.

Each scanner returns a list of finding dicts with a common shape:
  {
    "resource_id":    str,
    "resource_name":  str,
    "resource_type":  str,   # s3_bucket | security_group | nsg_rule | etc.
    "issue":          str,   # human-readable description
    "severity":       "critical" | "high" | "medium" | "low",
    "recommendation": str,
    "provider":       "aws" | "azure" | "gcp",
    "region":         str | None,
  }

All scan methods fail silently (log warning, return []) to avoid crashing the
overall scan when a single check lacks permissions or encounters a transient error.
"""
import logging
from typing import List, Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# AWS Security Scanner
# ═══════════════════════════════════════════════════════════════════════════════

class AWSSecurityScanner:
    """Basic security checks for an AWS account."""

    def __init__(self, access_key: str, secret_key: str, region: str = "us-east-1"):
        self.access_key = access_key
        self.secret_key = secret_key
        self.region = region

    def _client(self, service: str, region: str = None):
        return boto3.client(
            service,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=region or self.region,
        )

    # ── S3 Public Access ──────────────────────────────────────────────────────

    def scan_s3_public(self) -> List[dict]:
        """
        Detect S3 buckets without the S3 Block Public Access setting enabled.
        Requires s3:GetBucketPublicAccessBlock and s3:ListAllMyBuckets.
        """
        findings = []
        try:
            s3 = self._client("s3")
            buckets = s3.list_buckets().get("Buckets", [])
            for bucket in buckets:
                name = bucket["Name"]
                try:
                    pab = s3.get_public_access_block(Bucket=name)
                    cfg = pab.get("PublicAccessBlockConfiguration", {})
                    # All 4 settings should be True for full protection
                    if not (
                        cfg.get("BlockPublicAcls")
                        and cfg.get("IgnorePublicAcls")
                        and cfg.get("BlockPublicPolicy")
                        and cfg.get("RestrictPublicBuckets")
                    ):
                        disabled = [k for k, v in cfg.items() if not v]
                        findings.append({
                            "resource_id":    name,
                            "resource_name":  name,
                            "resource_type":  "s3_bucket",
                            "issue":          f"Block Public Access não habilitado completamente ({', '.join(disabled)})",
                            "severity":       "high",
                            "recommendation": "Habilite todas as opções de Block Public Access no bucket S3.",
                            "provider":       "aws",
                            "region":         "global",
                        })
                except ClientError as e:
                    code = e.response["Error"]["Code"]
                    if code == "NoSuchPublicAccessBlockConfiguration":
                        # No block at all — definitely public access possible
                        findings.append({
                            "resource_id":    name,
                            "resource_name":  name,
                            "resource_type":  "s3_bucket",
                            "issue":          "Block Public Access não configurado — bucket pode ser público",
                            "severity":       "critical",
                            "recommendation": "Configure Block Public Access em Configurações > Permissões do bucket.",
                            "provider":       "aws",
                            "region":         "global",
                        })
        except ClientError as e:
            logger.warning(f"AWS S3 public scan error: {e}")
        return findings

    # ── Security Groups open to internet ─────────────────────────────────────

    def scan_sg_open(self) -> List[dict]:
        """
        Detect Security Groups that allow unrestricted inbound access (0.0.0.0/0 or ::/0)
        on sensitive ports: 22 (SSH), 3389 (RDP), or ALL traffic (-1).
        Requires ec2:DescribeSecurityGroups.
        """
        findings = []
        SENSITIVE_PORTS = {22: "SSH", 3389: "RDP"}
        try:
            ec2 = self._client("ec2")
            paginator = ec2.get_paginator("describe_security_groups")
            for page in paginator.paginate():
                for sg in page.get("SecurityGroups", []):
                    sg_id   = sg["GroupId"]
                    sg_name = sg.get("GroupName", sg_id)
                    vpc_id  = sg.get("VpcId", "")
                    for rule in sg.get("IpPermissions", []):
                        protocol  = rule.get("IpProtocol", "")
                        from_port = rule.get("FromPort", 0)
                        to_port   = rule.get("ToPort", 65535)
                        open_cidrs = [
                            r["CidrIp"] for r in rule.get("IpRanges", [])
                            if r["CidrIp"] in ("0.0.0.0/0",)
                        ] + [
                            r["CidrIpv6"] for r in rule.get("Ipv6Ranges", [])
                            if r["CidrIpv6"] in ("::/0",)
                        ]
                        if not open_cidrs:
                            continue

                        if protocol == "-1":
                            findings.append({
                                "resource_id":    sg_id,
                                "resource_name":  sg_name,
                                "resource_type":  "security_group",
                                "issue":          f"Permite TODO o tráfego de entrada de {', '.join(open_cidrs)} (VPC: {vpc_id})",
                                "severity":       "critical",
                                "recommendation": "Remova a regra de acesso irrestrito. Permita apenas IPs ou ranges específicos.",
                                "provider":       "aws",
                                "region":         self.region,
                            })
                        else:
                            for port, svc in SENSITIVE_PORTS.items():
                                if from_port <= port <= to_port:
                                    findings.append({
                                        "resource_id":    sg_id,
                                        "resource_name":  sg_name,
                                        "resource_type":  "security_group",
                                        "issue":          f"Porta {port} ({svc}) aberta para {', '.join(open_cidrs)}",
                                        "severity":       "high",
                                        "recommendation": f"Restrinja o acesso à porta {port} a IPs ou ranges específicos conhecidos.",
                                        "provider":       "aws",
                                        "region":         self.region,
                                    })
        except ClientError as e:
            logger.warning(f"AWS SG scan error: {e}")
        return findings

    # ── IAM root access key ───────────────────────────────────────────────────

    def scan_root_access_key(self) -> List[dict]:
        """
        Detect if the root account has active access keys.
        Requires iam:GetAccountSummary.
        """
        findings = []
        try:
            iam = self._client("iam")
            summary = iam.get_account_summary()["SummaryMap"]
            if summary.get("AccountAccessKeysPresent", 0) > 0:
                findings.append({
                    "resource_id":    "root",
                    "resource_name":  "Conta Root AWS",
                    "resource_type":  "iam_root",
                    "issue":          "A conta root possui access keys ativas — nunca use a conta root para operações rotineiras",
                    "severity":       "critical",
                    "recommendation": "Delete as access keys da conta root imediatamente. Crie usuários IAM com permissões mínimas.",
                    "provider":       "aws",
                    "region":         "global",
                })
        except ClientError as e:
            logger.warning(f"AWS root key scan error: {e}")
        return findings

    def scan_all(self) -> List[dict]:
        findings = []
        findings.extend(self.scan_s3_public())
        findings.extend(self.scan_sg_open())
        findings.extend(self.scan_root_access_key())
        return findings


# ═══════════════════════════════════════════════════════════════════════════════
# Azure Security Scanner
# ═══════════════════════════════════════════════════════════════════════════════

class AzureSecurityScanner:
    """Basic security checks for an Azure subscription."""

    def __init__(self, subscription_id: str, tenant_id: str, client_id: str, client_secret: str):
        self.subscription_id = subscription_id
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._credential = None

    def _get_credential(self):
        if not self._credential:
            from azure.identity import ClientSecretCredential
            self._credential = ClientSecretCredential(
                tenant_id=self.tenant_id,
                client_id=self.client_id,
                client_secret=self.client_secret,
            )
        return self._credential

    # ── Storage public access ─────────────────────────────────────────────────

    def scan_storage_public(self) -> List[dict]:
        """
        Detect Azure Storage Accounts with public blob access enabled.
        Requires Microsoft.Storage/storageAccounts/read.
        """
        findings = []
        try:
            from azure.mgmt.storage import StorageManagementClient
            client = StorageManagementClient(self._get_credential(), self.subscription_id)
            for acct in client.storage_accounts.list():
                if acct.allow_blob_public_access is True:
                    rg = acct.id.split("/resourceGroups/")[1].split("/")[0] if acct.id else "?"
                    findings.append({
                        "resource_id":    acct.id or acct.name,
                        "resource_name":  acct.name,
                        "resource_type":  "storage_account",
                        "issue":          f"Acesso público a blobs habilitado (Resource Group: {rg})",
                        "severity":       "high",
                        "recommendation": "Desabilite 'Allow Blob Public Access' nas configurações da Storage Account.",
                        "provider":       "azure",
                        "region":         acct.location,
                    })
        except Exception as e:
            logger.warning(f"Azure storage public scan error: {e}")
        return findings

    # ── NSG open ports ────────────────────────────────────────────────────────

    def scan_nsg_open(self) -> List[dict]:
        """
        Detect NSG inbound rules allowing SSH (22) or RDP (3389) from any source (* or Internet).
        Requires Microsoft.Network/networkSecurityGroups/read.
        """
        findings = []
        SENSITIVE = {22: "SSH", 3389: "RDP"}
        OPEN_SOURCES = {"*", "Internet", "Any"}
        try:
            from azure.mgmt.network import NetworkManagementClient
            client = NetworkManagementClient(self._get_credential(), self.subscription_id)
            for nsg in client.network_security_groups.list_all():
                rg = nsg.id.split("/resourceGroups/")[1].split("/")[0] if nsg.id else "?"
                for rule in (nsg.security_rules or []):
                    if rule.direction != "Inbound":
                        continue
                    if rule.access != "Allow":
                        continue
                    if rule.source_address_prefix not in OPEN_SOURCES:
                        continue

                    dest_port = rule.destination_port_range or ""
                    dest_ports = list(rule.destination_port_ranges or [])
                    all_ports  = ([dest_port] if dest_port else []) + dest_ports

                    for port, svc in SENSITIVE.items():
                        matched = any(
                            p == "*" or p == str(port) or (
                                "-" in p and int(p.split("-")[0]) <= port <= int(p.split("-")[1])
                            )
                            for p in all_ports
                        )
                        if matched:
                            findings.append({
                                "resource_id":    nsg.id or nsg.name,
                                "resource_name":  nsg.name,
                                "resource_type":  "nsg_rule",
                                "issue":          f"Regra '{rule.name}' permite {svc} (porta {port}) de qualquer origem (Resource Group: {rg})",
                                "severity":       "high",
                                "recommendation": f"Restrinja a regra NSG para IPs ou ranges específicos. Considere usar Azure Bastion para acesso administrativo.",
                                "provider":       "azure",
                                "region":         nsg.location,
                            })
        except Exception as e:
            logger.warning(f"Azure NSG scan error: {e}")
        return findings

    # ── VM without disk encryption ────────────────────────────────────────────

    def scan_vm_unencrypted_disk(self) -> List[dict]:
        """
        Detect Azure VMs without Azure Disk Encryption enabled on OS disk.
        Requires Microsoft.Compute/virtualMachines/read.
        """
        findings = []
        try:
            from azure.mgmt.compute import ComputeManagementClient
            client = ComputeManagementClient(self._get_credential(), self.subscription_id)
            for vm in client.virtual_machines.list_all():
                rg = vm.id.split("/resourceGroups/")[1].split("/")[0] if vm.id else "?"
                # Check if encryption extensions are present
                try:
                    ext_resp = client.virtual_machine_extensions.list(rg, vm.name)
                    has_ade = any(
                        "AzureDiskEncryption" in (ext.type_properties_type or "")
                        for ext in (ext_resp.value or [])
                    )
                    if not has_ade:
                        findings.append({
                            "resource_id":    vm.id or vm.name,
                            "resource_name":  vm.name,
                            "resource_type":  "virtual_machine",
                            "issue":          f"VM sem Azure Disk Encryption (Resource Group: {rg})",
                            "severity":       "medium",
                            "recommendation": "Habilite Azure Disk Encryption para proteger dados em repouso.",
                            "provider":       "azure",
                            "region":         vm.location,
                        })
                except Exception:
                    pass  # Extension list not available for this VM; skip
        except Exception as e:
            logger.warning(f"Azure VM disk encryption scan error: {e}")
        return findings

    def scan_all(self) -> List[dict]:
        findings = []
        findings.extend(self.scan_storage_public())
        findings.extend(self.scan_nsg_open())
        findings.extend(self.scan_vm_unencrypted_disk())
        return findings


# ═══════════════════════════════════════════════════════════════════════════════
# GCP Security Scanner
# ═══════════════════════════════════════════════════════════════════════════════

class GCPSecurityScanner:
    """Basic security checks for a GCP project."""

    def __init__(self, project_id: str, client_email: str, private_key: str, private_key_id: str):
        self.project_id = project_id
        info = {
            "type": "service_account",
            "project_id": project_id,
            "client_email": client_email,
            "private_key": private_key.replace("\\n", "\n"),
            "private_key_id": private_key_id,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        from google.oauth2 import service_account
        self.credentials = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )

    # ── GCS public buckets ────────────────────────────────────────────────────

    def scan_bucket_public(self) -> List[dict]:
        """
        Detect GCS buckets with allUsers or allAuthenticatedUsers in IAM policy.
        Requires storage.buckets.list + storage.buckets.getIamPolicy.
        """
        findings = []
        try:
            from google.cloud import storage as gcs
            client = gcs.Client(project=self.project_id, credentials=self.credentials)
            for bucket in client.list_buckets():
                try:
                    policy = bucket.get_iam_policy(requested_policy_version=3)
                    public_members = set()
                    for binding in policy.bindings:
                        members = binding.get("members", [])
                        for m in members:
                            if m in ("allUsers", "allAuthenticatedUsers"):
                                public_members.add(m)
                    if public_members:
                        findings.append({
                            "resource_id":    bucket.name,
                            "resource_name":  bucket.name,
                            "resource_type":  "gcs_bucket",
                            "issue":          f"Bucket acessível publicamente via IAM ({', '.join(public_members)})",
                            "severity":       "critical",
                            "recommendation": "Remova 'allUsers' e 'allAuthenticatedUsers' das políticas IAM do bucket. Use URL assinadas para acesso externo.",
                            "provider":       "gcp",
                            "region":         bucket.location,
                        })
                except Exception:
                    pass  # IAM policy not accessible; skip this bucket
        except Exception as e:
            logger.warning(f"GCP bucket public scan error: {e}")
        return findings

    # ── Firewall rules open to internet ──────────────────────────────────────

    def scan_firewall_open(self) -> List[dict]:
        """
        Detect VPC firewall rules allowing SSH (22) or RDP (3389) from 0.0.0.0/0.
        Requires compute.firewalls.list.
        """
        findings = []
        SENSITIVE = {22: "SSH", 3389: "RDP"}
        try:
            from googleapiclient.discovery import build
            svc = build("compute", "v1", credentials=self.credentials)
            result = svc.firewalls().list(project=self.project_id).execute()
            for fw in result.get("items", []):
                if fw.get("direction", "INGRESS") != "INGRESS":
                    continue
                source_ranges = fw.get("sourceRanges", [])
                if "0.0.0.0/0" not in source_ranges:
                    continue
                # Check allowed ports
                for rule in fw.get("allowed", []):
                    ports = rule.get("ports", [])
                    for port, svc_name in SENSITIVE.items():
                        matched = not ports or any(
                            p == str(port) or (
                                "-" in str(p) and int(str(p).split("-")[0]) <= port <= int(str(p).split("-")[1])
                            )
                            for p in ports
                        )
                        if matched:
                            findings.append({
                                "resource_id":    fw["selfLink"],
                                "resource_name":  fw["name"],
                                "resource_type":  "firewall_rule",
                                "issue":          f"Regra de firewall '{fw['name']}' permite {svc_name} (porta {port}) de 0.0.0.0/0",
                                "severity":       "high",
                                "recommendation": f"Restrinja a regra para IPs específicos. Use IAP (Identity-Aware Proxy) para acesso SSH/RDP seguro.",
                                "provider":       "gcp",
                                "region":         "global",
                            })
        except Exception as e:
            logger.warning(f"GCP firewall scan error: {e}")
        return findings

    # ── Project-level IAM overly permissive ───────────────────────────────────

    def scan_iam_owner(self) -> List[dict]:
        """
        Detect non-service-account principals with the 'roles/owner' role at project level.
        Requires resourcemanager.projects.getIamPolicy.
        """
        findings = []
        try:
            from googleapiclient.discovery import build
            crm = build("cloudresourcemanager", "v1", credentials=self.credentials)
            policy = crm.projects().getIamPolicy(
                resource=self.project_id,
                body={"options": {"requestedPolicyVersion": 1}},
            ).execute()
            for binding in policy.get("bindings", []):
                if binding.get("role") == "roles/owner":
                    for member in binding.get("members", []):
                        if member.startswith("user:") or member.startswith("group:"):
                            findings.append({
                                "resource_id":    self.project_id,
                                "resource_name":  member,
                                "resource_type":  "iam_project",
                                "issue":          f"'{member}' possui o papel 'roles/owner' no projeto — acesso irrestrito a todos os recursos",
                                "severity":       "high",
                                "recommendation": "Revise se este membro precisa de acesso total. Prefira papéis com menor privilégio (roles/editor ou específicos).",
                                "provider":       "gcp",
                                "region":         "global",
                            })
        except Exception as e:
            logger.warning(f"GCP IAM owner scan error: {e}")
        return findings

    def scan_all(self) -> List[dict]:
        findings = []
        findings.extend(self.scan_bucket_public())
        findings.extend(self.scan_firewall_open())
        findings.extend(self.scan_iam_owner())
        return findings
