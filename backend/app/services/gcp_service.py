import logging
from typing import Optional

from google.oauth2 import service_account
from google.cloud import compute_v1, storage
from googleapiclient import discovery

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


class GCPService:
    """Wrapper around Google Cloud SDK clients, authenticated via a Service Account."""

    def __init__(
        self,
        project_id: str,
        client_email: str,
        private_key: str,
        private_key_id: str,
    ):
        self.project_id = project_id
        info = {
            "type": "service_account",
            "project_id": project_id,
            "client_email": client_email,
            "private_key": private_key.replace("\\n", "\n"),
            "private_key_id": private_key_id,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        self.credentials = service_account.Credentials.from_service_account_info(
            info, scopes=_SCOPES
        )

    # ── Compute Engine ────────────────────────────────────────────────────────

    def list_instances(self) -> list:
        """List all VM instances across all zones via AggregatedList."""
        client = compute_v1.InstancesClient(credentials=self.credentials)
        result = []
        for zone_name, zone_data in client.aggregated_list(project=self.project_id):
            if not zone_data.instances:
                continue
            zone = zone_name.replace("zones/", "")
            for inst in zone_data.instances:
                disks = [
                    {"name": d.source.split("/")[-1], "boot": d.boot, "auto_delete": d.auto_delete}
                    for d in inst.disks
                ]
                network_interfaces = [
                    {
                        "network": ni.network.split("/")[-1] if ni.network else "",
                        "internal_ip": ni.network_i_p,
                        "external_ip": (
                            ni.access_configs[0].nat_i_p
                            if ni.access_configs
                            else None
                        ),
                    }
                    for ni in inst.network_interfaces
                ]
                result.append(
                    {
                        "id": str(inst.id),
                        "name": inst.name,
                        "zone": zone,
                        "status": inst.status,
                        "machine_type": inst.machine_type.split("/")[-1] if inst.machine_type else "",
                        "creation_timestamp": inst.creation_timestamp,
                        "disks": disks,
                        "network_interfaces": network_interfaces,
                        "labels": dict(inst.labels) if inst.labels else {},
                        "description": inst.description or "",
                    }
                )
        return result

    def start_instance(self, zone: str, name: str) -> None:
        client = compute_v1.InstancesClient(credentials=self.credentials)
        op = client.start(project=self.project_id, zone=zone, instance=name)
        op.result()

    def stop_instance(self, zone: str, name: str) -> None:
        client = compute_v1.InstancesClient(credentials=self.credentials)
        op = client.stop(project=self.project_id, zone=zone, instance=name)
        op.result()

    def delete_instance(self, zone: str, name: str) -> None:
        client = compute_v1.InstancesClient(credentials=self.credentials)
        op = client.delete(project=self.project_id, zone=zone, instance=name)
        op.result()

    def list_zones(self) -> list[str]:
        client = compute_v1.ZonesClient(credentials=self.credentials)
        return sorted(z.name for z in client.list(project=self.project_id))

    def list_machine_types(self, zone: str) -> list[str]:
        client = compute_v1.MachineTypesClient(credentials=self.credentials)
        return sorted(mt.name for mt in client.list(project=self.project_id, zone=zone))

    # ── Cloud Storage ─────────────────────────────────────────────────────────

    def list_buckets(self) -> list:
        client = storage.Client(project=self.project_id, credentials=self.credentials)
        result = []
        for bucket in client.list_buckets():
            result.append(
                {
                    "name": bucket.name,
                    "location": bucket.location,
                    "storage_class": bucket.storage_class,
                    "created": bucket.time_created.isoformat() if bucket.time_created else None,
                    "versioning_enabled": bucket.versioning_enabled,
                    "labels": bucket.labels or {},
                }
            )
        return result

    def create_bucket(
        self,
        name: str,
        location: str = "US",
        storage_class: str = "STANDARD",
    ) -> dict:
        client = storage.Client(project=self.project_id, credentials=self.credentials)
        bucket = client.create_bucket(name, location=location)
        bucket.storage_class = storage_class
        bucket.patch()
        return {
            "name": bucket.name,
            "location": bucket.location,
            "storage_class": bucket.storage_class,
        }

    def delete_bucket(self, name: str) -> None:
        client = storage.Client(project=self.project_id, credentials=self.credentials)
        bucket = client.bucket(name)
        bucket.delete(force=True)

    # ── Cloud SQL ─────────────────────────────────────────────────────────────

    def _sql_service(self):
        return discovery.build("sqladmin", "v1beta4", credentials=self.credentials, cache_discovery=False)

    def list_sql_instances(self) -> list:
        svc = self._sql_service()
        resp = svc.instances().list(project=self.project_id).execute()
        instances = resp.get("items", [])
        result = []
        for inst in instances:
            result.append(
                {
                    "name": inst.get("name"),
                    "database_version": inst.get("databaseVersion"),
                    "state": inst.get("state"),
                    "region": inst.get("region"),
                    "tier": inst.get("settings", {}).get("tier"),
                    "create_time": inst.get("createTime"),
                    "ip_addresses": [
                        {"type": ip.get("type"), "ip": ip.get("ipAddress")}
                        for ip in inst.get("ipAddresses", [])
                    ],
                }
            )
        return result

    def delete_sql_instance(self, instance_name: str) -> None:
        svc = self._sql_service()
        svc.instances().delete(project=self.project_id, instance=instance_name).execute()

    # ── Cloud Functions ───────────────────────────────────────────────────────

    def list_functions(self, region: str = "us-central1") -> list:
        svc = discovery.build("cloudfunctions", "v1", credentials=self.credentials, cache_discovery=False)
        parent = f"projects/{self.project_id}/locations/{region}"
        resp = svc.projects().locations().functions().list(parent=parent).execute()
        functions = resp.get("functions", [])
        result = []
        for fn in functions:
            name_parts = fn.get("name", "").split("/")
            result.append(
                {
                    "name": name_parts[-1] if name_parts else fn.get("name"),
                    "full_name": fn.get("name"),
                    "region": region,
                    "status": fn.get("status"),
                    "runtime": fn.get("runtime"),
                    "entry_point": fn.get("entryPoint"),
                    "update_time": fn.get("updateTime"),
                    "available_memory_mb": fn.get("availableMemoryMb"),
                    "timeout": fn.get("timeout"),
                    "trigger": (
                        {"type": "HTTP", "url": fn.get("httpsTrigger", {}).get("url")}
                        if "httpsTrigger" in fn
                        else {"type": "EVENT"}
                    ),
                }
            )
        return result

    def delete_function(self, full_name: str) -> None:
        svc = discovery.build("cloudfunctions", "v1", credentials=self.credentials, cache_discovery=False)
        svc.projects().locations().functions().delete(name=full_name).execute()

    # ── VPC Networks ──────────────────────────────────────────────────────────

    def list_networks(self) -> list:
        client = compute_v1.NetworksClient(credentials=self.credentials)
        result = []
        for net in client.list(project=self.project_id):
            subnets = [s.split("/")[-1] for s in net.subnetworks] if net.subnetworks else []
            result.append(
                {
                    "id": str(net.id),
                    "name": net.name,
                    "auto_create_subnetworks": net.auto_create_subnetworks,
                    "routing_mode": (
                        net.routing_config.routing_mode
                        if net.routing_config
                        else "REGIONAL"
                    ),
                    "creation_timestamp": net.creation_timestamp,
                    "subnetworks": subnets,
                    "description": net.description or "",
                }
            )
        return result

    def create_network(self, name: str, auto_create_subnetworks: bool = True) -> dict:
        client = compute_v1.NetworksClient(credentials=self.credentials)
        network_resource = compute_v1.Network(
            name=name,
            auto_create_subnetworks=auto_create_subnetworks,
        )
        op = client.insert(project=self.project_id, network_resource=network_resource)
        op.result()
        net = client.get(project=self.project_id, network=name)
        return {"id": str(net.id), "name": net.name, "auto_create_subnetworks": net.auto_create_subnetworks}

    def delete_network(self, name: str) -> None:
        client = compute_v1.NetworksClient(credentials=self.credentials)
        op = client.delete(project=self.project_id, network=name)
        op.result()
