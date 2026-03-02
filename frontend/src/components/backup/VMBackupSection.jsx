import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HardDriveDownload, ExternalLink, Plus } from 'lucide-react';
import awsService from '../../services/awsservices';
import azureService from '../../services/azureservices';
import gcpService from '../../services/gcpService';

const PROVIDER_ROUTES = {
  aws: '/aws/backup',
  azure: '/azure/backup',
  gcp: '/gcp/backup',
};

function StatusDot({ status }) {
  const s = (status || '').toLowerCase();
  const ok = s === 'completed' || s === 'available' || s === 'ready' || s === 'succeeded';
  const warn = s === 'pending' || s === 'creating';
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-green-500' : warn ? 'bg-yellow-400' : 'bg-gray-400'}`} />
  );
}

function formatDate(str) {
  if (!str) return null;
  try {
    return new Date(str).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return str; }
}

const SkeletonLine = () => (
  <div className="flex items-center gap-2 py-1 animate-pulse">
    <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-40" />
    <div className="ml-auto h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
  </div>
);

/**
 * Renders a compact backup/snapshot list inside the ResourceDetailDrawer.
 *
 * Props:
 *   provider: 'aws' | 'azure' | 'gcp'
 *   instanceId: string (AWS)
 *   resourceGroup: string (Azure)
 *   vmName: string (Azure / GCP)
 *   zone: string (GCP)
 */
export default function VMBackupSection({ provider, instanceId, resourceGroup, vmName, zone }) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['vm-backup-section', provider, instanceId, resourceGroup, vmName],
    queryFn: async () => {
      if (provider === 'aws') {
        return awsService.listSnapshots(instanceId);
      }
      if (provider === 'azure') {
        return azureService.listSnapshots();
      }
      if (provider === 'gcp') {
        return gcpService.listSnapshots();
      }
      return { snapshots: [] };
    },
    enabled: !!(provider),
    staleTime: 60_000,
    retry: false,
  });

  // Filter snapshots to those relevant to this VM
  const allSnaps = data?.snapshots || [];
  let snapshots = allSnaps;

  if (provider === 'azure' && vmName) {
    // Show snapshots whose source_resource_id path includes the vmName
    snapshots = allSnaps.filter(s =>
      s.source_resource_id?.toLowerCase().includes(vmName.toLowerCase()) ||
      s.resource_group?.toLowerCase() === resourceGroup?.toLowerCase()
    );
  } else if (provider === 'gcp' && vmName) {
    snapshots = allSnaps.filter(s =>
      s.source_disk?.toLowerCase().includes(vmName.toLowerCase())
    );
  }

  const recent = snapshots.slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <HardDriveDownload className="w-3.5 h-3.5" />
          Backups
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(PROVIDER_ROUTES[provider] || '/')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            title="Ver todos os backups"
          >
            <ExternalLink className="w-3 h-3" />
            Ver todos
          </button>
          <button
            onClick={() => navigate(PROVIDER_ROUTES[provider] || '/')}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
            title="Criar snapshot"
          >
            <Plus className="w-3 h-3" />
            Criar
          </button>
        </div>
      </div>

      <div className="space-y-0.5">
        {isLoading ? (
          <>
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
          </>
        ) : recent.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
            Nenhum snapshot encontrado para esta VM.{' '}
            <button
              onClick={() => navigate(PROVIDER_ROUTES[provider] || '/')}
              className="underline hover:text-gray-600 dark:hover:text-gray-300"
            >
              Criar backup
            </button>
          </p>
        ) : (
          recent.map((s, i) => {
            const name = s.snapshot_id || s.name || `snap-${i}`;
            const status = s.state || s.status || s.provisioning_state || '';
            const date = formatDate(s.start_time || s.creation_timestamp || s.time_created);
            const size = s.size_gb != null ? `${s.size_gb} GB` : s.disk_size_gb != null ? `${s.disk_size_gb} GB` : null;
            return (
              <div key={name} className="flex items-center gap-2 py-1.5 text-xs border-b border-gray-100 dark:border-gray-800 last:border-0">
                <StatusDot status={status} />
                <span className="font-mono text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0" title={name}>{name}</span>
                {size && <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{size}</span>}
                {date && <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{date}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
