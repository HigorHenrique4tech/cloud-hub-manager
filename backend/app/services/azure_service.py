from azure.identity import ClientSecretCredential
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.subscription import SubscriptionClient
from azure.mgmt.storage import StorageManagementClient
from azure.mgmt.network import NetworkManagementClient
from azure.mgmt.web import WebSiteManagementClient
from azure.mgmt.sql import SqlManagementClient
from azure.mgmt.costmanagement import CostManagementClient
from azure.mgmt.costmanagement.models import QueryDefinition, QueryTimePeriod, QueryDataset, QueryAggregation, QueryGrouping
from typing import Dict, List
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class AzureService:
    """Service for Azure operations"""

    def __init__(self, subscription_id: str, tenant_id: str, client_id: str, client_secret: str):
        self.subscription_id = subscription_id
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._credential = None
        self._compute_client = None
        self._resource_client = None
        self._network_client = None
        self._storage_client = None
        self._sql_client = None
        self._web_client = None

    @property
    def credential(self):
        if not self._credential:
            self._credential = ClientSecretCredential(
                tenant_id=self.tenant_id,
                client_id=self.client_id,
                client_secret=self.client_secret,
            )
        return self._credential

    @property
    def compute_client(self):
        if not self._compute_client:
            self._compute_client = ComputeManagementClient(self.credential, self.subscription_id)
        return self._compute_client

    @property
    def resource_client(self):
        if not self._resource_client:
            self._resource_client = ResourceManagementClient(self.credential, self.subscription_id)
        return self._resource_client

    @property
    def network_client(self):
        if not self._network_client:
            self._network_client = NetworkManagementClient(self.credential, self.subscription_id)
        return self._network_client

    @property
    def storage_client(self):
        if not self._storage_client:
            self._storage_client = StorageManagementClient(self.credential, self.subscription_id)
        return self._storage_client

    @property
    def sql_client(self):
        if not self._sql_client:
            self._sql_client = SqlManagementClient(self.credential, self.subscription_id)
        return self._sql_client

    @property
    def web_client(self):
        if not self._web_client:
            self._web_client = WebSiteManagementClient(self.credential, self.subscription_id)
        return self._web_client

    # ── Helpers for form dropdowns ────────────────────────────────────────────

    async def list_locations(self) -> Dict:
        try:
            sub_client = SubscriptionClient(credential=self.credential)
            locations = []
            for loc in sub_client.subscriptions.list_locations(self.subscription_id):
                locations.append({'name': loc.name, 'display_name': loc.display_name})
            locations.sort(key=lambda x: x['display_name'])
            return {'success': True, 'locations': locations}
        except Exception as e:
            logger.error(f"list_locations error: {e}")
            return {'success': False, 'error': str(e), 'locations': []}

    async def list_vm_sizes(self, location: str) -> Dict:
        try:
            sizes = []
            for size in self.compute_client.virtual_machine_sizes.list(location):
                sizes.append({
                    'name': size.name,
                    'vcpus': size.number_of_cores,
                    'memory_mb': size.memory_in_mb,
                    'max_data_disks': size.max_data_disk_count,
                    'os_disk_size_mb': size.os_disk_size_in_mb,
                })
            sizes.sort(key=lambda x: (x['vcpus'], x['memory_mb']))
            return {'success': True, 'sizes': sizes}
        except Exception as e:
            logger.error(f"list_vm_sizes error: {e}")
            return {'success': False, 'error': str(e), 'sizes': []}

    async def list_vm_image_publishers(self, location: str) -> Dict:
        try:
            publishers = [p.name for p in self.compute_client.virtual_machine_images.list_publishers(location)]
            return {'success': True, 'publishers': sorted(publishers)}
        except Exception as e:
            logger.error(f"list_vm_image_publishers error: {e}")
            return {'success': False, 'error': str(e), 'publishers': []}

    async def list_vm_image_offers(self, location: str, publisher: str) -> Dict:
        try:
            offers = [o.name for o in self.compute_client.virtual_machine_images.list_offers(location, publisher)]
            return {'success': True, 'offers': sorted(offers)}
        except Exception as e:
            logger.error(f"list_vm_image_offers error: {e}")
            return {'success': False, 'error': str(e), 'offers': []}

    async def list_vm_image_skus(self, location: str, publisher: str, offer: str) -> Dict:
        try:
            skus = [s.name for s in self.compute_client.virtual_machine_images.list_skus(location, publisher, offer)]
            return {'success': True, 'skus': sorted(skus)}
        except Exception as e:
            logger.error(f"list_vm_image_skus error: {e}")
            return {'success': False, 'error': str(e), 'skus': []}

    # ── VMs ─────────────────────────────────────────────────────────────────

    async def list_virtual_machines(self) -> Dict:
        try:
            vms = []
            resource_groups = list(self.resource_client.resource_groups.list())
            for rg in resource_groups:
                try:
                    rg_vms = list(self.compute_client.virtual_machines.list(resource_group_name=rg.name))
                    for vm in rg_vms:
                        instance_view = self.compute_client.virtual_machines.instance_view(
                            resource_group_name=rg.name, vm_name=vm.name
                        )
                        power_state = "unknown"
                        if instance_view.statuses:
                            for status in instance_view.statuses:
                                if status.code.startswith('PowerState/'):
                                    power_state = status.code.split('/')[-1]
                                    break
                        vms.append({
                            'vm_id': vm.id,
                            'name': vm.name,
                            'resource_group': rg.name,
                            'location': vm.location,
                            'vm_size': vm.hardware_profile.vm_size if vm.hardware_profile else None,
                            'power_state': power_state,
                            'os_type': vm.storage_profile.os_disk.os_type if vm.storage_profile and vm.storage_profile.os_disk else None,
                            'tags': vm.tags or {},
                        })
                except Exception as e:
                    logger.warning(f"Error listing VMs in RG {rg.name}: {e}")
                    continue
            return {'success': True, 'subscription_id': self.subscription_id, 'total_vms': len(vms), 'virtual_machines': vms}
        except Exception as e:
            logger.error(f"Error listing Azure VMs: {e}")
            return {'success': False, 'error': str(e), 'virtual_machines': []}

    async def start_virtual_machine(self, resource_group: str, vm_name: str) -> Dict:
        try:
            poller = self.compute_client.virtual_machines.begin_start(
                resource_group_name=resource_group, vm_name=vm_name
            )
            poller.result()
            return {'success': True, 'message': f'VM {vm_name} iniciada com sucesso'}
        except Exception as e:
            logger.error(f"Error starting VM {vm_name}: {e}")
            return {'success': False, 'error': str(e)}

    async def stop_virtual_machine(self, resource_group: str, vm_name: str) -> Dict:
        try:
            poller = self.compute_client.virtual_machines.begin_deallocate(
                resource_group_name=resource_group, vm_name=vm_name
            )
            poller.result()
            return {'success': True, 'message': f'VM {vm_name} parada com sucesso'}
        except Exception as e:
            logger.error(f"Error stopping VM {vm_name}: {e}")
            return {'success': False, 'error': str(e)}

    async def create_virtual_machine(self, params: dict) -> Dict:
        try:
            import asyncio
            from azure.mgmt.network.models import (
                NetworkInterface, NetworkInterfaceIPConfiguration,
                PublicIPAddress, IPAllocationMethod,
            )
            from azure.mgmt.compute.models import (
                VirtualMachine, HardwareProfile, StorageProfile, OSDisk,
                ImageReference, OSProfile, NetworkProfile, NetworkInterfaceReference,
                ManagedDiskParameters, LinuxConfiguration, SshConfiguration, SshPublicKey, DataDisk,
                DiskCreateOptionTypes,
            )
            loop = asyncio.get_event_loop()

            rg = params['resource_group']
            location = params['location']
            vm_name = params['name']
            nic_name = f"{vm_name}-nic"

            # Build IP configuration
            ip_config_kwargs = {'name': f'{vm_name}-ipconfig'}
            if params.get('vnet_name') and params.get('subnet_name'):
                subnet_id = (
                    f"/subscriptions/{self.subscription_id}/resourceGroups/{rg}"
                    f"/providers/Microsoft.Network/virtualNetworks/{params['vnet_name']}"
                    f"/subnets/{params['subnet_name']}"
                )
                ip_config_kwargs['subnet'] = {'id': subnet_id}

            if params.get('create_public_ip'):
                pip_name = f"{vm_name}-pip"
                pip_poller = self.network_client.public_ip_addresses.begin_create_or_update(
                    rg, pip_name,
                    PublicIPAddress(location=location, sku={'name': 'Standard'}, public_ip_allocation_method='Static'),
                )
                pip_result = await loop.run_in_executor(None, pip_poller.result)
                ip_config_kwargs['public_ip_address'] = {'id': pip_result.id}

            nic_poller = self.network_client.network_interfaces.begin_create_or_update(
                rg, nic_name,
                NetworkInterface(
                    location=location,
                    ip_configurations=[NetworkInterfaceIPConfiguration(**ip_config_kwargs)],
                ),
            )
            nic_result = await loop.run_in_executor(None, nic_poller.result)

            # OS Profile
            os_profile_kwargs = {
                'computer_name': vm_name,
                'admin_username': params['admin_username'],
            }
            if params.get('ssh_public_key'):
                os_profile_kwargs['linux_configuration'] = LinuxConfiguration(
                    disable_password_authentication=True,
                    ssh=SshConfiguration(public_keys=[
                        SshPublicKey(
                            path=f"/home/{params['admin_username']}/.ssh/authorized_keys",
                            key_data=params['ssh_public_key'],
                        )
                    ]),
                )
            if params.get('admin_password'):
                os_profile_kwargs['admin_password'] = params['admin_password']

            # OS Disk
            os_disk_kwargs = {
                'create_option': DiskCreateOptionTypes.FROM_IMAGE,
                'managed_disk': ManagedDiskParameters(storage_account_type=params.get('os_disk_type', 'Standard_LRS')),
            }
            if params.get('os_disk_size_gb'):
                os_disk_kwargs['disk_size_gb'] = params['os_disk_size_gb']

            # Data Disks
            data_disks = []
            for dd in params.get('data_disks', []):
                data_disks.append(DataDisk(
                    lun=dd['lun'],
                    name=dd['name'],
                    disk_size_gb=dd.get('disk_size_gb', 32),
                    create_option='Empty',
                    managed_disk=ManagedDiskParameters(storage_account_type=dd.get('storage_account_type', 'Standard_LRS')),
                ))

            vm_params = VirtualMachine(
                location=location,
                tags=params.get('tags', {}),
                hardware_profile=HardwareProfile(vm_size=params.get('vm_size', 'Standard_B1s')),
                storage_profile=StorageProfile(
                    image_reference=ImageReference(
                        publisher=params.get('image_publisher', 'Canonical'),
                        offer=params.get('image_offer', '0001-com-ubuntu-server-jammy'),
                        sku=params.get('image_sku', '22_04-lts-gen2'),
                        version=params.get('image_version', 'latest'),
                    ),
                    os_disk=OSDisk(**os_disk_kwargs),
                    data_disks=data_disks if data_disks else None,
                ),
                os_profile=OSProfile(**os_profile_kwargs),
                network_profile=NetworkProfile(
                    network_interfaces=[NetworkInterfaceReference(id=nic_result.id, primary=True)]
                ),
            )

            poller = self.compute_client.virtual_machines.begin_create_or_update(rg, vm_name, vm_params)
            result = await loop.run_in_executor(None, poller.result)
            return {'success': True, 'vm_name': result.name, 'vm_id': result.id}
        except Exception as e:
            logger.error(f"create_virtual_machine error: {e}")
            return {'success': False, 'error': str(e)}

    # ── Resource Groups ───────────────────────────────────────────────────────

    async def list_resource_groups(self) -> Dict:
        try:
            resource_groups = []
            for rg in self.resource_client.resource_groups.list():
                resource_groups.append({
                    'name': rg.name,
                    'location': rg.location,
                    'tags': rg.tags or {},
                    'provisioning_state': rg.properties.provisioning_state if rg.properties else None,
                })
            return {'success': True, 'total_resource_groups': len(resource_groups), 'resource_groups': resource_groups}
        except Exception as e:
            logger.error(f"Error listing resource groups: {e}")
            return {'success': False, 'error': str(e), 'resource_groups': []}

    async def list_resource_group_resources(self, rg_name: str) -> Dict:
        try:
            resources = []
            for r in self.resource_client.resources.list_by_resource_group(rg_name):
                resources.append({
                    'id': r.id,
                    'name': r.name,
                    'type': r.type,
                    'location': r.location,
                    'tags': r.tags or {},
                    'provisioning_state': r.properties.get('provisioningState') if r.properties else None,
                })
            return {'success': True, 'resource_group': rg_name, 'total': len(resources), 'resources': resources}
        except Exception as e:
            logger.error(f"Error listing resources in RG {rg_name}: {e}")
            return {'success': False, 'error': str(e), 'resources': []}

    # ── Storage ───────────────────────────────────────────────────────────────

    async def list_storage_accounts(self) -> Dict:
        try:
            accounts = []
            for sa in self.storage_client.storage_accounts.list():
                rg = sa.id.split('/resourceGroups/')[1].split('/')[0] if sa.id else ''
                accounts.append({
                    'id': sa.id,
                    'name': sa.name,
                    'resource_group': rg,
                    'location': sa.location,
                    'sku': sa.sku.name if sa.sku else None,
                    'kind': sa.kind,
                    'access_tier': sa.access_tier,
                    'provisioning_state': sa.provisioning_state,
                    'tags': sa.tags or {},
                })
            return {'success': True, 'total': len(accounts), 'storage_accounts': accounts}
        except Exception as e:
            logger.error(f"Error listing storage accounts: {e}")
            return {'success': False, 'error': str(e), 'storage_accounts': []}

    async def create_storage_account(self, params: dict) -> Dict:
        try:
            from azure.mgmt.storage.models import StorageAccountCreateParameters, Sku, Kind
            sa_params = StorageAccountCreateParameters(
                sku=Sku(name=params.get('sku', 'Standard_LRS')),
                kind=params.get('kind', 'StorageV2'),
                location=params['location'],
                tags=params.get('tags', {}),
                access_tier=params.get('access_tier', 'Hot'),
                enable_https_traffic_only=params.get('enable_https_only', True),
                minimum_tls_version=params.get('min_tls_version', 'TLS1_2'),
                allow_blob_public_access=params.get('allow_blob_public_access', False),
            )
            poller = self.storage_client.storage_accounts.begin_create(
                params['resource_group'], params['name'], sa_params
            )
            result = poller.result()
            return {'success': True, 'name': result.name, 'id': result.id}
        except Exception as e:
            logger.error(f"create_storage_account error: {e}")
            return {'success': False, 'error': str(e)}

    # ── VNets ────────────────────────────────────────────────────────────────

    async def list_vnets(self) -> Dict:
        try:
            vnets = []
            for vnet in self.network_client.virtual_networks.list_all():
                rg = vnet.id.split('/resourceGroups/')[1].split('/')[0] if vnet.id else ''
                address_spaces = vnet.address_space.address_prefixes if vnet.address_space else []
                vnets.append({
                    'id': vnet.id,
                    'name': vnet.name,
                    'resource_group': rg,
                    'location': vnet.location,
                    'address_space': address_spaces,
                    'subnets_count': len(vnet.subnets) if vnet.subnets else 0,
                    'subnets': [
                        {'name': s.name, 'address_prefix': s.address_prefix or ''}
                        for s in (vnet.subnets or [])
                    ],
                    'provisioning_state': vnet.provisioning_state,
                    'tags': vnet.tags or {},
                })
            return {'success': True, 'total': len(vnets), 'vnets': vnets}
        except Exception as e:
            logger.error(f"Error listing VNets: {e}")
            return {'success': False, 'error': str(e), 'vnets': []}

    async def create_vnet(self, params: dict) -> Dict:
        try:
            from azure.mgmt.network.models import VirtualNetwork, AddressSpace, Subnet
            subnets = [
                Subnet(name=s['name'], address_prefix=s['address_prefix'])
                for s in params.get('subnets', [])
            ]
            vnet_params = VirtualNetwork(
                location=params['location'],
                tags=params.get('tags', {}),
                address_space=AddressSpace(address_prefixes=params.get('address_prefixes', ['10.0.0.0/16'])),
                subnets=subnets if subnets else None,
            )
            poller = self.network_client.virtual_networks.begin_create_or_update(
                params['resource_group'], params['name'], vnet_params
            )
            result = poller.result()
            return {'success': True, 'name': result.name, 'id': result.id}
        except Exception as e:
            logger.error(f"create_vnet error: {e}")
            return {'success': False, 'error': str(e)}

    # ── Databases ────────────────────────────────────────────────────────────

    async def list_databases(self) -> Dict:
        try:
            servers = []
            for server in self.sql_client.servers.list():
                rg = server.id.split('/resourceGroups/')[1].split('/')[0] if server.id else ''
                dbs = []
                try:
                    for db in self.sql_client.databases.list_by_server(rg, server.name):
                        if db.name != 'master':
                            dbs.append({'name': db.name, 'status': db.status, 'sku': db.sku.name if db.sku else None})
                except Exception:
                    pass
                servers.append({
                    'id': server.id,
                    'name': server.name,
                    'resource_group': rg,
                    'location': server.location,
                    'fully_qualified_domain_name': server.fully_qualified_domain_name,
                    'state': server.state,
                    'databases': dbs,
                    'tags': server.tags or {},
                })
            return {'success': True, 'total': len(servers), 'servers': servers}
        except Exception as e:
            logger.error(f"Error listing databases: {e}")
            return {'success': False, 'error': str(e), 'servers': []}

    async def create_sql_database(self, params: dict) -> Dict:
        try:
            import asyncio
            from azure.mgmt.sql.models import Server, Database, Sku
            loop = asyncio.get_event_loop()
            server_params = Server(
                location=params['location'],
                administrator_login=params['admin_login'],
                administrator_login_password=params['admin_password'],
                tags=params.get('tags', {}),
            )
            server_poller = self.sql_client.servers.begin_create_or_update(
                params['resource_group'], params['server_name'], server_params
            )
            server_result = await loop.run_in_executor(None, server_poller.result)

            db_params = Database(
                location=params['location'],
                sku=Sku(name=params.get('sku_name', 'Basic')),
                collation=params.get('collation', 'SQL_Latin1_General_CP1_CI_AS'),
            )
            if params.get('max_size_bytes'):
                db_params.max_size_bytes = params['max_size_bytes']

            db_poller = self.sql_client.databases.begin_create_or_update(
                params['resource_group'], params['server_name'], params['database_name'], db_params
            )
            db_result = await loop.run_in_executor(None, db_poller.result)
            return {
                'success': True,
                'server_name': server_result.name,
                'database_name': db_result.name,
                'fqdn': server_result.fully_qualified_domain_name,
            }
        except Exception as e:
            logger.error(f"create_sql_database error: {e}")
            error_msg = str(e)
            if 'RegionDoesNotAllowProvisioning' in error_msg:
                return {
                    'success': False,
                    'error': 'Esta região não aceita criação de novos servidores SQL no momento. Tente Brazil South, East US 2, West US 2 ou West Europe.',
                    'code': 'REGION_NOT_ALLOWED',
                }
            return {'success': False, 'error': error_msg}

    # ── App Services ──────────────────────────────────────────────────────────

    async def list_app_services(self) -> Dict:
        try:
            apps = []
            for app in self.web_client.web_apps.list():
                rg = app.resource_group or (app.id.split('/resourceGroups/')[1].split('/')[0] if app.id else '')
                apps.append({
                    'id': app.id,
                    'name': app.name,
                    'resource_group': rg,
                    'location': app.location,
                    'state': app.state,
                    'host_names': list(app.host_names) if app.host_names else [],
                    'runtime': f"{app.site_config.linux_fx_version or app.site_config.windows_fx_version or 'N/A'}" if app.site_config else 'N/A',
                    'app_service_plan': app.server_farm_id.split('/')[-1] if app.server_farm_id else None,
                    'tags': app.tags or {},
                })
            return {'success': True, 'total': len(apps), 'app_services': apps}
        except Exception as e:
            logger.error(f"Error listing App Services: {e}")
            return {'success': False, 'error': str(e), 'app_services': []}

    async def start_app_service(self, resource_group: str, app_name: str) -> Dict:
        try:
            self.web_client.web_apps.start(resource_group, app_name)
            return {'success': True, 'message': f'App Service {app_name} iniciado com sucesso'}
        except Exception as e:
            logger.error(f"Error starting App Service {app_name}: {e}")
            return {'success': False, 'error': str(e)}

    async def stop_app_service(self, resource_group: str, app_name: str) -> Dict:
        try:
            self.web_client.web_apps.stop(resource_group, app_name)
            return {'success': True, 'message': f'App Service {app_name} parado com sucesso'}
        except Exception as e:
            logger.error(f"Error stopping App Service {app_name}: {e}")
            return {'success': False, 'error': str(e)}

    async def create_app_service(self, params: dict) -> Dict:
        try:
            import asyncio
            from azure.mgmt.web.models import AppServicePlan, SkuDescription, Site, SiteConfig
            loop = asyncio.get_event_loop()
            rg = params['resource_group']
            location = params['location']
            app_name = params['name']
            plan_name = params.get('plan_name') or f"{app_name}-plan"
            sku_name = params.get('plan_sku', 'F1')

            tier_map = {'F1': 'Free', 'B1': 'Basic', 'B2': 'Basic', 'B3': 'Basic',
                        'S1': 'Standard', 'S2': 'Standard', 'S3': 'Standard',
                        'P1v2': 'PremiumV2', 'P2v2': 'PremiumV2', 'P3v2': 'PremiumV2'}
            tier = tier_map.get(sku_name, 'Basic')

            plan_params = AppServicePlan(
                location=location,
                sku=SkuDescription(name=sku_name, tier=tier),
                reserved=True,
            )
            plan_poller = self.web_client.app_service_plans.begin_create_or_update(rg, plan_name, plan_params)
            plan_result = await loop.run_in_executor(None, plan_poller.result)

            site_config = SiteConfig(linux_fx_version=params.get('runtime', 'NODE|18-lts'))
            if params.get('always_on') and sku_name not in ('F1', 'D1'):
                site_config.always_on = True

            site_params = Site(
                location=location,
                server_farm_id=plan_result.id,
                site_config=site_config,
                tags=params.get('tags', {}),
            )
            site_poller = self.web_client.web_apps.begin_create_or_update(rg, app_name, site_params)
            site_result = await loop.run_in_executor(None, site_poller.result)
            return {'success': True, 'name': site_result.name, 'default_host_name': site_result.default_host_name}
        except Exception as e:
            logger.error(f"create_app_service error: {e}")
            return {'success': False, 'error': str(e)}

    # ── Subscriptions ────────────────────────────────────────────────────────

    async def list_subscriptions(self) -> Dict:
        try:
            subscription_client = SubscriptionClient(credential=self.credential)
            subs = []
            for sub in subscription_client.subscriptions.list():
                subs.append({
                    'subscription_id': sub.subscription_id,
                    'display_name': sub.display_name,
                    'state': str(sub.state),
                    'tenant_id': sub.tenant_id,
                })
            return {'success': True, 'subscriptions': subs}
        except Exception as e:
            logger.error(f"Error listing subscriptions: {e}")
            return {'success': False, 'error': str(e), 'subscriptions': []}

    # ── Connection test ───────────────────────────────────────────────────────

    async def test_connection(self) -> Dict:
        try:
            subscription_client = SubscriptionClient(credential=self.credential)
            subscriptions = list(subscription_client.subscriptions.list())
            return {
                'success': True,
                'message': 'Azure connection successful',
                'subscription_id': self.subscription_id,
                'subscriptions_count': len(subscriptions),
            }
        except Exception as e:
            logger.error(f"Azure connection error: {e}")
            return {'success': False, 'error': str(e)}

    # ── Costs ─────────────────────────────────────────────────────────────────

    async def get_cost_by_subscription(self, start_date: str, end_date: str, granularity: str = 'Monthly') -> Dict:
        try:
            cost_client = CostManagementClient(self.credential)
            scope = f"/subscriptions/{self.subscription_id}"
            dt_start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            dt_end = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query = QueryDefinition(
                type="Usage",
                timeframe="Custom",
                time_period=QueryTimePeriod(from_property=dt_start, to=dt_end),
                dataset=QueryDataset(
                    granularity=granularity,
                    aggregation={"totalCost": QueryAggregation(name="PreTaxCost", function="Sum")},
                    grouping=[QueryGrouping(type="Dimension", name="ServiceName")],
                ),
            )
            result = cost_client.query.usage(scope=scope, parameters=query)
            rows = result.rows or []
            columns = [col.name for col in (result.columns or [])]
            cost_candidates = ['PreTaxCost', 'Cost', 'CostUSD', 'BillingCurrencyTotalCost']
            cost_idx = next((columns.index(c) for c in cost_candidates if c in columns), 0)
            date_idx = next((columns.index(c) for c in ['UsageDate', 'BillingMonth', 'Date'] if c in columns), None)
            svc_idx = columns.index('ServiceName') if 'ServiceName' in columns else None
            total = 0.0
            service_map: Dict[str, float] = {}
            daily_map: Dict[str, float] = {}
            for row in rows:
                amount = float(row[cost_idx]) if cost_idx < len(row) else 0.0
                total += amount
                svc = str(row[svc_idx]) if svc_idx is not None and svc_idx < len(row) else 'Other'
                service_map[svc] = service_map.get(svc, 0.0) + amount
                if date_idx is not None and date_idx < len(row):
                    raw_date = str(int(row[date_idx])) if isinstance(row[date_idx], float) else str(row[date_idx])
                    if len(raw_date) == 8:
                        date_str = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
                    elif len(raw_date) == 6:
                        date_str = f"{raw_date[:4]}-{raw_date[4:6]}-01"
                    else:
                        date_str = raw_date[:10]
                    daily_map[date_str] = daily_map.get(date_str, 0.0) + amount
            by_service = sorted(
                [{'name': k, 'amount': round(v, 4)} for k, v in service_map.items()],
                key=lambda x: x['amount'], reverse=True,
            )
            daily = [{'date': k, 'total': round(v, 4)} for k, v in sorted(daily_map.items())]
            return {
                'success': True,
                'period': {'start': start_date, 'end': end_date},
                'granularity': granularity,
                'total': round(total, 4),
                'currency': 'USD',
                'by_service': by_service,
                'daily': daily,
            }
        except Exception as e:
            logger.error(f"Azure cost error: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}

    # ── Delete operations ─────────────────────────────────────────────────────

    async def delete_virtual_machine(self, resource_group: str, vm_name: str) -> Dict:
        try:
            poller = self.compute_client.virtual_machines.begin_delete(resource_group, vm_name)
            poller.result()
            return {'success': True}
        except Exception as e:
            logger.error(f"delete_virtual_machine error: {e}")
            return {'success': False, 'error': str(e)}

    async def delete_storage_account(self, resource_group: str, account_name: str) -> Dict:
        try:
            self.storage_client.storage_accounts.delete(resource_group, account_name)
            return {'success': True}
        except Exception as e:
            logger.error(f"delete_storage_account error: {e}")
            return {'success': False, 'error': str(e)}

    async def delete_virtual_network(self, resource_group: str, vnet_name: str) -> Dict:
        try:
            poller = self.network_client.virtual_networks.begin_delete(resource_group, vnet_name)
            poller.result()
            return {'success': True}
        except Exception as e:
            logger.error(f"delete_virtual_network error: {e}")
            return {'success': False, 'error': str(e)}

    async def delete_sql_server(self, resource_group: str, server_name: str) -> Dict:
        try:
            poller = self.sql_client.servers.begin_delete(resource_group, server_name)
            poller.result()
            return {'success': True}
        except Exception as e:
            logger.error(f"delete_sql_server error: {e}")
            return {'success': False, 'error': str(e)}

    async def delete_app_service(self, resource_group: str, app_name: str) -> Dict:
        try:
            self.web_client.web_apps.delete(resource_group, app_name)
            return {'success': True}
        except Exception as e:
            logger.error(f"delete_app_service error: {e}")
            return {'success': False, 'error': str(e)}
