import { Server, HardDrive, Zap } from 'lucide-react';
import StatusBadge from '../common/statusbadge';

const ResourceCard = ({ resource, type = 'ec2' }) => {
  const isAWS = type === 'ec2';

  const resourceName = resource.name || 'Unknown';
  const resourceState = isAWS ? resource.state : resource.power_state;
  const resourceType = isAWS ? resource.instance_type : resource.vm_size;
  const resourceId = isAWS ? resource.instance_id : resource.vm_id;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="bg-primary-light dark:bg-primary/20 rounded-lg p-3 flex-shrink-0">
            <Server className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{resourceName}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{resourceId}</p>
          </div>
        </div>
        <div className="flex-shrink-0">
          <StatusBadge state={resourceState} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
            <Zap className="w-4 h-4 mr-2 text-orange-500" />
            Tipo
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{resourceType || 'N/A'}</span>
        </div>

        {isAWS && resource.availability_zone && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
              <HardDrive className="w-4 h-4 mr-2 text-blue-500" />
              Zona
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{resource.availability_zone}</span>
          </div>
        )}

        {!isAWS && resource.location && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
              <HardDrive className="w-4 h-4 mr-2 text-blue-500" />
              Localização
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{resource.location}</span>
          </div>
        )}

        {isAWS && resource.public_ip && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">IP Público</span>
            <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{resource.public_ip}</span>
          </div>
        )}

        {!isAWS && resource.resource_group && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Resource Group</span>
            <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{resource.resource_group}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceCard;
