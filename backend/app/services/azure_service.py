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
    
    def __init__(
        self, 
        subscription_id: str,
        tenant_id: str,
        client_id: str,
        client_secret: str
    ):
        self.subscription_id = subscription_id
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._credential = None
        self._compute_client = None
        self._resource_client = None
    
    @property
    def credential(self):
        """Lazy load Azure credential"""
        if not self._credential:
            self._credential = ClientSecretCredential(
                tenant_id=self.tenant_id,
                client_id=self.client_id,
                client_secret=self.client_secret
            )
        return self._credential
    
    @property
    def compute_client(self):
        """Lazy load Compute Management client"""
        if not self._compute_client:
            self._compute_client = ComputeManagementClient(
                credential=self.credential,
                subscription_id=self.subscription_id
            )
        return self._compute_client
    
    @property
    def resource_client(self):
        """Lazy load Resource Management client"""
        if not self._resource_client:
            self._resource_client = ResourceManagementClient(
                credential=self.credential,
                subscription_id=self.subscription_id
            )
        return self._resource_client
    
    async def list_virtual_machines(self) -> Dict:
        """List all Virtual Machines across all resource groups"""
        try:
            vms = []
            
            # List all resource groups
            resource_groups = list(self.resource_client.resource_groups.list())
            
            # List VMs in each resource group
            for rg in resource_groups:
                try:
                    rg_vms = list(
                        self.compute_client.virtual_machines.list(
                            resource_group_name=rg.name
                        )
                    )
                    
                    for vm in rg_vms:
                        # Get instance view for power state
                        instance_view = self.compute_client.virtual_machines.instance_view(
                            resource_group_name=rg.name,
                            vm_name=vm.name
                        )
                        
                        # Extract power state
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
                            'tags': vm.tags or {}
                        })
                        
                except Exception as e:
                    logger.warning(f"Error listing VMs in RG {rg.name}: {e}")
                    continue
            
            return {
                'success': True,
                'subscription_id': self.subscription_id,
                'total_vms': len(vms),
                'virtual_machines': vms
            }
            
        except Exception as e:
            logger.error(f"Error listing Azure VMs: {e}")
            return {
                'success': False,
                'error': str(e),
                'virtual_machines': []
            }
    
    async def list_resource_groups(self) -> Dict:
        """List all resource groups"""
        try:
            resource_groups = []
            
            for rg in self.resource_client.resource_groups.list():
                resource_groups.append({
                    'name': rg.name,
                    'location': rg.location,
                    'tags': rg.tags or {},
                    'provisioning_state': rg.properties.provisioning_state if rg.properties else None
                })
            
            return {
                'success': True,
                'total_resource_groups': len(resource_groups),
                'resource_groups': resource_groups
            }
            
        except Exception as e:
            logger.error(f"Error listing resource groups: {e}")
            return {
                'success': False,
                'error': str(e),
                'resource_groups': []
            }
    
    async def start_virtual_machine(self, resource_group: str, vm_name: str) -> Dict:
        """Start an Azure Virtual Machine"""
        try:
            poller = self.compute_client.virtual_machines.begin_start(
                resource_group_name=resource_group,
                vm_name=vm_name
            )
            poller.result()
            return {
                'success': True,
                'message': f'VM {vm_name} iniciada com sucesso'
            }
        except Exception as e:
            logger.error(f"Error starting VM {vm_name}: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    async def stop_virtual_machine(self, resource_group: str, vm_name: str) -> Dict:
        """Stop (deallocate) an Azure Virtual Machine"""
        try:
            poller = self.compute_client.virtual_machines.begin_deallocate(
                resource_group_name=resource_group,
                vm_name=vm_name
            )
            poller.result()
            return {
                'success': True,
                'message': f'VM {vm_name} parada com sucesso'
            }
        except Exception as e:
            logger.error(f"Error stopping VM {vm_name}: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    async def test_connection(self) -> Dict:
        """Test Azure connection and credentials"""
        try:
            subscription_client = SubscriptionClient(credential=self.credential)
            subscriptions = list(subscription_client.subscriptions.list())
            return {
                'success': True,
                'message': 'Azure connection successful',
                'subscription_id': self.subscription_id,
                'subscriptions_count': len(subscriptions)
            }
        except Exception as e:
            logger.error(f"Azure connection error: {e}")
            return {'success': False, 'error': str(e)}

    async def list_subscriptions(self) -> Dict:
        """Return the subscription info from the stored credential"""
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

    async def list_resource_group_resources(self, rg_name: str) -> Dict:
        """List all resources inside a specific resource group"""
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

    async def list_storage_accounts(self) -> Dict:
        """List all storage accounts in the subscription"""
        try:
            storage_client = StorageManagementClient(self.credential, self.subscription_id)
            accounts = []
            for sa in storage_client.storage_accounts.list():
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

    async def list_vnets(self) -> Dict:
        """List all virtual networks in the subscription"""
        try:
            network_client = NetworkManagementClient(self.credential, self.subscription_id)
            vnets = []
            for vnet in network_client.virtual_networks.list_all():
                rg = vnet.id.split('/resourceGroups/')[1].split('/')[0] if vnet.id else ''
                address_spaces = vnet.address_space.address_prefixes if vnet.address_space else []
                vnets.append({
                    'id': vnet.id,
                    'name': vnet.name,
                    'resource_group': rg,
                    'location': vnet.location,
                    'address_space': address_spaces,
                    'subnets_count': len(vnet.subnets) if vnet.subnets else 0,
                    'provisioning_state': vnet.provisioning_state,
                    'tags': vnet.tags or {},
                })
            return {'success': True, 'total': len(vnets), 'vnets': vnets}
        except Exception as e:
            logger.error(f"Error listing VNets: {e}")
            return {'success': False, 'error': str(e), 'vnets': []}

    async def list_databases(self) -> Dict:
        """List all SQL servers and their databases"""
        try:
            sql_client = SqlManagementClient(self.credential, self.subscription_id)
            servers = []
            for server in sql_client.servers.list():
                rg = server.id.split('/resourceGroups/')[1].split('/')[0] if server.id else ''
                dbs = []
                try:
                    for db in sql_client.databases.list_by_server(rg, server.name):
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

    async def list_app_services(self) -> Dict:
        """List all Web Apps (App Services) in the subscription"""
        try:
            web_client = WebSiteManagementClient(self.credential, self.subscription_id)
            apps = []
            for app in web_client.web_apps.list():
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
        """Start an App Service"""
        try:
            web_client = WebSiteManagementClient(self.credential, self.subscription_id)
            web_client.web_apps.start(resource_group, app_name)
            return {'success': True, 'message': f'App Service {app_name} iniciado com sucesso'}
        except Exception as e:
            logger.error(f"Error starting App Service {app_name}: {e}")
            return {'success': False, 'error': str(e)}

    async def stop_app_service(self, resource_group: str, app_name: str) -> Dict:
        """Stop an App Service"""
        try:
            web_client = WebSiteManagementClient(self.credential, self.subscription_id)
            web_client.web_apps.stop(resource_group, app_name)
            return {'success': True, 'message': f'App Service {app_name} parado com sucesso'}
        except Exception as e:
            logger.error(f"Error stopping App Service {app_name}: {e}")
            return {'success': False, 'error': str(e)}

    # ── Costs ─────────────────────────────────────────────────────────────────

    async def get_cost_by_subscription(self, start_date: str, end_date: str, granularity: str = 'Monthly') -> Dict:
        """
        Get Azure cost data from Cost Management API.
        Requires RBAC role: Cost Management Reader on the subscription.
        start_date / end_date: 'YYYY-MM-DD'
        granularity: 'Daily' or 'Monthly'
        """
        try:
            cost_client = CostManagementClient(self.credential)
            scope = f"/subscriptions/{self.subscription_id}"

            # Azure SDK requires datetime objects, not plain strings
            dt_start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            dt_end   = datetime.strptime(end_date,   "%Y-%m-%d").replace(tzinfo=timezone.utc)

            query = QueryDefinition(
                type="Usage",
                timeframe="Custom",
                time_period=QueryTimePeriod(from_property=dt_start, to=dt_end),
                dataset=QueryDataset(
                    granularity=granularity,
                    aggregation={
                        "totalCost": QueryAggregation(name="PreTaxCost", function="Sum")
                    },
                    grouping=[
                        QueryGrouping(type="Dimension", name="ServiceName")
                    ],
                ),
            )

            result = cost_client.query.usage(scope=scope, parameters=query)

            rows = result.rows or []
            columns = [col.name for col in (result.columns or [])]
            logger.debug(f"Azure cost columns: {columns}")

            # Robustly locate cost / date / service columns
            # Azure may return 'PreTaxCost', 'Cost', 'CostUSD', etc.
            cost_candidates = ['PreTaxCost', 'Cost', 'CostUSD', 'BillingCurrencyTotalCost']
            cost_idx = next((columns.index(c) for c in cost_candidates if c in columns), 0)
            date_idx = next((columns.index(c) for c in ['UsageDate', 'BillingMonth', 'Date'] if c in columns), None)
            svc_idx  = columns.index('ServiceName') if 'ServiceName' in columns else None

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
                    # UsageDate is YYYYMMDD integer; BillingMonth may be YYYYMM
                    if len(raw_date) == 8:
                        date_str = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
                    elif len(raw_date) == 6:
                        date_str = f"{raw_date[:4]}-{raw_date[4:6]}-01"
                    else:
                        date_str = raw_date[:10]  # ISO string, take date part
                    daily_map[date_str] = daily_map.get(date_str, 0.0) + amount

            by_service = sorted(
                [{'name': k, 'amount': round(v, 4)} for k, v in service_map.items()],
                key=lambda x: x['amount'],
                reverse=True,
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