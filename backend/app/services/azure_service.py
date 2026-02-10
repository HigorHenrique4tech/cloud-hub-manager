from azure.identity import ClientSecretCredential
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.subscription import SubscriptionClient
from typing import Dict, List
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
    
    async def test_connection(self) -> Dict:
        """Test Azure connection and credentials"""
        try:
            # Try to list subscriptions to verify credentials
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
            return {
                'success': False,
                'error': str(e)
            }