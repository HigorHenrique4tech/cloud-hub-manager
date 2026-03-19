import logging
from datetime import datetime, timedelta
from typing import Optional

from google.oauth2 import service_account
from google.cloud import compute_v1, storage
from googleapiclient import discovery

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

# ── Cost estimation maps ──────────────────────────────────────────────────────
_GCE_COST_MAP = {
    "e2-micro": 6.11, "e2-small": 12.23, "e2-medium": 24.46,
    "e2-standard-2": 48.91, "e2-standard-4": 97.83, "e2-standard-8": 195.65,
    "e2-standard-16": 391.30, "e2-standard-32": 782.61,
    "n1-standard-1": 24.27, "n1-standard-2": 48.54, "n1-standard-4": 97.09,
    "n1-standard-8": 194.18, "n1-standard-16": 388.35,
    "n2-standard-2": 56.35, "n2-standard-4": 112.70, "n2-standard-8": 225.40,
    "n2d-standard-2": 51.63, "n2d-standard-4": 103.26,
    "c2-standard-4": 138.48, "c2-standard-8": 276.95,
}

_SQL_COST_MAP = {
    "db-f1-micro": 7.65, "db-g1-small": 25.46,
    "db-n1-standard-1": 46.26, "db-n1-standard-2": 92.52,
    "db-n1-standard-4": 185.04, "db-n1-standard-8": 370.08,
    "db-n1-highmem-2": 108.52, "db-n1-highmem-4": 217.04,
    "db-custom-1-3840": 55.00, "db-custom-2-7680": 110.00,
}


def _estimate_gce_cost(machine_type: str) -> float:
    mt = machine_type.split("/")[-1] if "/" in machine_type else machine_type
    if mt in _GCE_COST_MAP:
        return _GCE_COST_MAP[mt]
    try:
        cpus = int(mt.split("-")[-1])
        return round(cpus * 24.27, 2)
    except Exception:
        return 24.27


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
        client.start(project=self.project_id, zone=zone, instance=name)

    def stop_instance(self, zone: str, name: str) -> None:
        client = compute_v1.InstancesClient(credentials=self.credentials)
        client.stop(project=self.project_id, zone=zone, instance=name)

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

    def get_network_detail(self, name: str) -> dict:
        """Get detailed info about a VPC network including subnets and peerings."""
        net_client = compute_v1.NetworksClient(credentials=self.credentials)
        net = net_client.get(project=self.project_id, network=name)

        # Fetch subnets detail
        subnets = []
        if net.subnetworks:
            sub_client = compute_v1.SubnetworksClient(credentials=self.credentials)
            for sub_url in net.subnetworks:
                # URL format: projects/{project}/regions/{region}/subnetworks/{name}
                parts = sub_url.split("/")
                sub_region = parts[parts.index("regions") + 1] if "regions" in parts else ""
                sub_name = parts[-1]
                try:
                    sub = sub_client.get(
                        project=self.project_id, region=sub_region, subnetwork=sub_name
                    )
                    subnets.append({
                        "name": sub.name,
                        "region": sub_region,
                        "ip_cidr_range": sub.ip_cidr_range,
                        "gateway_address": sub.gateway_address,
                        "private_ip_google_access": sub.private_ip_google_access,
                        "purpose": sub.purpose or "PRIVATE",
                        "state": sub.state or "READY",
                        "creation_timestamp": sub.creation_timestamp,
                        "self_link": sub.self_link,
                    })
                except Exception as e:
                    logger.debug(f"Could not fetch subnet {sub_name}: {e}")
                    subnets.append({"name": sub_name, "region": sub_region, "ip_cidr_range": "?", "state": "UNKNOWN"})

        # Peerings are embedded in the network object
        peerings = []
        if net.peerings:
            for p in net.peerings:
                peerings.append({
                    "name": p.name,
                    "network": p.network.split("/")[-1] if p.network else "",
                    "network_url": p.network or "",
                    "state": p.state or "UNKNOWN",
                    "auto_create_routes": p.auto_create_routes,
                    "export_custom_routes": p.export_custom_routes,
                    "import_custom_routes": p.import_custom_routes,
                    "exchange_subnet_routes": p.exchange_subnet_routes,
                })

        return {
            "name": net.name,
            "id": str(net.id),
            "auto_create_subnetworks": net.auto_create_subnetworks,
            "routing_mode": net.routing_config.routing_mode if net.routing_config else "REGIONAL",
            "creation_timestamp": net.creation_timestamp,
            "description": net.description or "",
            "mtu": net.mtu,
            "subnets": subnets,
            "peerings": peerings,
            "subnets_count": len(subnets),
            "peerings_count": len(peerings),
        }

    def create_subnetwork(self, network_name: str, name: str, region: str, ip_cidr_range: str) -> dict:
        """Create a subnet in a VPC network."""
        sub_client = compute_v1.SubnetworksClient(credentials=self.credentials)
        subnet_resource = compute_v1.Subnetwork(
            name=name,
            network=f"projects/{self.project_id}/global/networks/{network_name}",
            ip_cidr_range=ip_cidr_range,
        )
        op = sub_client.insert(project=self.project_id, region=region, subnetwork_resource=subnet_resource)
        op.result()
        sub = sub_client.get(project=self.project_id, region=region, subnetwork=name)
        return {
            "name": sub.name,
            "region": region,
            "ip_cidr_range": sub.ip_cidr_range,
            "gateway_address": sub.gateway_address,
            "state": sub.state or "READY",
        }

    def delete_subnetwork(self, region: str, name: str) -> None:
        """Delete a subnet from a VPC network."""
        sub_client = compute_v1.SubnetworksClient(credentials=self.credentials)
        op = sub_client.delete(project=self.project_id, region=region, subnetwork=name)
        op.result()

    def create_network_peering(self, network_name: str, peering_name: str, peer_network: str) -> dict:
        """Create a VPC network peering."""
        client = compute_v1.NetworksClient(credentials=self.credentials)
        peering = compute_v1.NetworkPeering(
            name=peering_name,
            network=f"projects/{self.project_id}/global/networks/{peer_network}",
            exchange_subnet_routes=True,
            auto_create_routes=True,
        )
        request = compute_v1.AddPeeringNetworkRequest(
            project=self.project_id,
            network=network_name,
            networks_add_peering_request_resource=compute_v1.NetworksAddPeeringRequest(
                network_peering=peering
            ),
        )
        op = client.add_peering(request=request)
        op.result()
        return {"name": peering_name, "peer_network": peer_network, "state": "ACTIVE"}

    def delete_network_peering(self, network_name: str, peering_name: str) -> None:
        """Remove a VPC network peering."""
        client = compute_v1.NetworksClient(credentials=self.credentials)
        request = compute_v1.RemovePeeringNetworkRequest(
            project=self.project_id,
            network=network_name,
            networks_remove_peering_request_resource=compute_v1.NetworksRemovePeeringRequest(
                name=peering_name,
            ),
        )
        op = client.remove_peering(request=request)
        op.result()

    def list_regions(self) -> list[str]:
        """List all available GCP regions."""
        client = compute_v1.RegionsClient(credentials=self.credentials)
        return sorted(r.name for r in client.list(project=self.project_id))

    def delete_network(self, name: str) -> None:
        client = compute_v1.NetworksClient(credentials=self.credentials)
        op = client.delete(project=self.project_id, network=name)
        op.result()

    # ── Cost Estimation ───────────────────────────────────────────────────────

    def get_cost_and_usage(self, start_date: str, end_date: str) -> dict:
        """
        Estimates GCP costs from active resources (Compute, SQL, Functions).
        Returns the same shape as AWS/Azure cost endpoints.
        Results are marked `estimated: True` since real billing data requires
        the Cloud Billing API (billing_account_id + billing.viewer role).
        """
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end   = datetime.strptime(end_date,   "%Y-%m-%d")
            n_days = max(1, (end - start).days)
            # Scale monthly estimates to the requested period
            monthly_factor = n_days / 30.0

            by_service: dict[str, float] = {}

            # --- Compute Engine ---
            try:
                client = compute_v1.InstancesClient(credentials=self.credentials)
                compute_total = 0.0
                for zone_name, zone_data in client.aggregated_list(project=self.project_id):
                    if not zone_data.instances:
                        continue
                    for inst in zone_data.instances:
                        if inst.status != "RUNNING":
                            continue
                        mt = inst.machine_type.split("/")[-1] if inst.machine_type else "unknown"
                        compute_total += _estimate_gce_cost(mt)
                if compute_total > 0:
                    by_service["Compute Engine"] = round(compute_total * monthly_factor, 4)
            except Exception as e:
                logger.debug(f"GCP Compute cost estimation: {e}")

            # --- Cloud SQL ---
            try:
                svc = discovery.build("sqladmin", "v1beta4", credentials=self.credentials, cache_discovery=False)
                resp = svc.instances().list(project=self.project_id).execute()
                sql_total = 0.0
                for inst in resp.get("items", []):
                    tier = inst.get("settings", {}).get("tier", "db-n1-standard-1")
                    sql_total += _SQL_COST_MAP.get(tier, 46.26)
                if sql_total > 0:
                    by_service["Cloud SQL"] = round(sql_total * monthly_factor, 4)
            except Exception as e:
                logger.debug(f"GCP SQL cost estimation: {e}")

            # --- Cloud Functions (low estimate: $2/function/month) ---
            try:
                fn_svc = discovery.build("cloudfunctions", "v1", credentials=self.credentials, cache_discovery=False)
                fn_total = 0.0
                for region in ["us-central1", "us-east1", "europe-west1", "us-east4"]:
                    parent = f"projects/{self.project_id}/locations/{region}"
                    try:
                        fn_resp = fn_svc.projects().locations().functions().list(parent=parent).execute()
                        fn_total += len(fn_resp.get("functions", [])) * 2.0
                    except Exception:
                        pass
                if fn_total > 0:
                    by_service["Cloud Functions"] = round(fn_total * monthly_factor, 4)
            except Exception as e:
                logger.debug(f"GCP Functions cost estimation: {e}")

            total = round(sum(by_service.values()), 4)

            # Distribute evenly across days
            daily_cost = total / n_days if n_days > 0 else 0.0
            daily = [
                {"date": (start + timedelta(days=i)).strftime("%Y-%m-%d"), "total": round(daily_cost, 4)}
                for i in range(n_days)
            ]

            by_service_list = sorted(
                [{"name": k, "amount": v} for k, v in by_service.items()],
                key=lambda x: x["amount"],
                reverse=True,
            )

            return {
                "success": True,
                "total": total,
                "daily": daily,
                "by_service": by_service_list,
                "estimated": True,
            }
        except Exception as e:
            logger.error(f"GCP cost estimation error: {e}")
            return {"success": False, "error": str(e), "estimated": True}

    def get_cost_by_resource(self, service_name: str, start_date: str, end_date: str) -> dict:
        """
        Estimated cost breakdown by resource for a GCP service.
        Enumerates running resources and estimates their costs.
        """
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d")
            n_days = max(1, (end - start).days)
            monthly_factor = n_days / 30.0
            resources = []
            total = 0.0

            if service_name == "Compute Engine":
                client = compute_v1.InstancesClient(credentials=self.credentials)
                for zone_name, zone_data in client.aggregated_list(project=self.project_id):
                    if not zone_data.instances:
                        continue
                    for inst in zone_data.instances:
                        if inst.status != "RUNNING":
                            continue
                        mt = inst.machine_type.split("/")[-1] if inst.machine_type else "unknown"
                        zone = zone_name.replace("zones/", "")
                        monthly_cost = _estimate_gce_cost(mt)
                        amount = round(monthly_cost * monthly_factor, 4)
                        total += amount
                        resources.append({
                            "id": inst.self_link or inst.name,
                            "name": inst.name,
                            "type": mt,
                            "region": zone,
                            "amount": amount,
                        })

            elif service_name == "Cloud SQL":
                svc = discovery.build("sqladmin", "v1beta4", credentials=self.credentials, cache_discovery=False)
                resp = svc.instances().list(project=self.project_id).execute()
                for inst in resp.get("items", []):
                    tier = inst.get("settings", {}).get("tier", "db-n1-standard-1")
                    region = inst.get("region", "")
                    monthly_cost = _SQL_COST_MAP.get(tier, 46.26)
                    amount = round(monthly_cost * monthly_factor, 4)
                    total += amount
                    resources.append({
                        "id": inst.get("selfLink", inst.get("name", "")),
                        "name": inst.get("name", ""),
                        "type": tier,
                        "region": region,
                        "amount": amount,
                    })

            elif service_name == "Cloud Functions":
                fn_svc = discovery.build("cloudfunctions", "v1", credentials=self.credentials, cache_discovery=False)
                for region in ["us-central1", "us-east1", "europe-west1", "us-east4"]:
                    parent = f"projects/{self.project_id}/locations/{region}"
                    try:
                        fn_resp = fn_svc.projects().locations().functions().list(parent=parent).execute()
                        for fn in fn_resp.get("functions", []):
                            amount = round(2.0 * monthly_factor, 4)
                            total += amount
                            fn_name = fn.get("name", "").split("/")[-1]
                            resources.append({
                                "id": fn.get("name", ""),
                                "name": fn_name,
                                "type": "function",
                                "region": region,
                                "amount": amount,
                            })
                    except Exception:
                        pass

            resources.sort(key=lambda x: x["amount"], reverse=True)

            # Distribute total evenly across days for the daily chart
            daily_cost = total / n_days if n_days > 0 else 0.0
            daily = [
                {"date": (start + timedelta(days=i)).strftime("%Y-%m-%d"), "total": round(daily_cost, 4)}
                for i in range(n_days)
            ]

            return {
                "success": True,
                "service": service_name,
                "total": round(total, 4),
                "resources": resources,
                "daily": daily,
                "estimated": True,
            }
        except Exception as e:
            logger.error(f"GCP cost by resource error: {e}")
            return {"success": False, "error": str(e), "estimated": True}

    # ── Metrics (Cloud Monitoring) ────────────────────────────────────────────

    def get_metrics(self, limit: int = 15) -> dict:
        """Return CPU metrics for running GCE instances via Cloud Monitoring."""
        from google.cloud import monitoring_v3

        end = datetime.utcnow()
        start = end - timedelta(hours=1)

        # Build instance list (running only, up to limit)
        try:
            instances_raw = self.list_instances()
        except Exception as e:
            logger.error(f"GCP get_metrics list error: {e}")
            return {"resources": [], "scanned_at": end.isoformat()}

        running = [i for i in instances_raw if i.get("status", "").upper() == "RUNNING"][:limit]
        if not running:
            return {"resources": [], "scanned_at": end.isoformat()}

        # Map instance_id (numeric string) → instance dict
        id_map = {i["id"]: i for i in running}

        # Query Cloud Monitoring for CPU utilization
        cpu_map: dict = {}
        try:
            client = monitoring_v3.MetricServiceClient(credentials=self.credentials)
            project_name = f"projects/{self.project_id}"
            interval = monitoring_v3.TimeInterval(
                {
                    "end_time": {"seconds": int(end.timestamp())},
                    "start_time": {"seconds": int(start.timestamp())},
                }
            )
            results = client.list_time_series(
                request={
                    "name": project_name,
                    "filter": 'metric.type = "compute.googleapis.com/instance/cpu/utilization"',
                    "interval": interval,
                    "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL,
                }
            )
            for ts in results:
                inst_id = ts.resource.labels.get("instance_id", "")
                vals = [p.value.double_value for p in ts.points if p.value.double_value is not None]
                if vals and inst_id in id_map:
                    cpu_map[inst_id] = round((sum(vals) / len(vals)) * 100, 1)
        except Exception as e:
            logger.warning(f"GCP Cloud Monitoring CPU query error: {e}")

        resources = []
        for inst in running:
            inst_id = inst["id"]
            resources.append({
                "id": inst_id,
                "name": inst["name"],
                "type": "compute",
                "region": inst.get("zone", ""),
                "status": "running",
                "cpu_pct": cpu_map.get(inst_id),
                "memory_pct": None,
                "net_in_bytes": None,
                "net_out_bytes": None,
            })

        return {"resources": resources, "scanned_at": end.isoformat()}
