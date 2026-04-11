import { useQuery, useMutation } from '@tanstack/react-query';
import { Shield, ShieldAlert, ShieldOff, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import azureService from '../../services/azureservices';

function RiskBadge({ risk }) {
  const map = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    medium:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    ok:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };
  const label = { critical: 'Crítico', high: 'Alto', medium: 'Médio', ok: 'OK' };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[risk] || map.medium}`}>
      {label[risk] || risk}
    </span>
  );
}

export default function BackupCoverageWidget() {
  const coverageQ = useQuery({
    queryKey: ['azure-backup-coverage'],
    queryFn: () => azureService.getBackupCoverage(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const scanMut = useMutation({
    mutationFn: () => azureService.triggerBackupScan(),
    onSuccess: () => coverageQ.refetch(),
  });

  const d = coverageQ.data;
  const pct = d?.coverage_pct ?? 0;

  // Progress bar color
  const barColor = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-red-500';

  if (coverageQ.error?.response?.status === 400) return null; // no Azure account

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
            <Shield size={16} className="text-sky-500" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cobertura de Backup</h3>
        </div>
        <button
          onClick={() => scanMut.mutate()}
          disabled={scanMut.isPending || coverageQ.isFetching}
          className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors disabled:opacity-40"
          title="Escanear agora"
        >
          <RefreshCw size={13} className={(scanMut.isPending || coverageQ.isFetching) ? 'animate-spin' : ''} />
        </button>
      </div>

      {coverageQ.isLoading ? (
        <div className="space-y-3">
          <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
          </div>
        </div>
      ) : d ? (
        <>
          {/* Coverage bar */}
          <div className="mb-4">
            <div className="flex items-end justify-between mb-1.5">
              <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{pct}%</span>
              <span className="text-xs text-gray-400">protegido</span>
            </div>
            <div className="h-2.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{d.total_vms}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Total VMs</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{d.protected_vms}</p>
              <p className="text-[10px] text-green-600 dark:text-green-500">Protegidas</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{d.unprotected_vms}</p>
              <p className="text-[10px] text-red-600 dark:text-red-500">Sem backup</p>
            </div>
          </div>

          {/* Alerts */}
          <div className="space-y-1.5 mb-4">
            {d.failing_backups > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300">
                <ShieldAlert size={13} />
                <span className="text-xs font-medium">{d.failing_backups} backup(s) com falha</span>
                <RiskBadge risk="high" />
              </div>
            )}
            {d.stale_backups > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300">
                <AlertTriangle size={13} />
                <span className="text-xs font-medium">{d.stale_backups} restore point(s) desatualizado(s)</span>
                <RiskBadge risk="medium" />
              </div>
            )}
            {d.unprotected_vms === 0 && d.failing_backups === 0 && d.stale_backups === 0 && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
                <Shield size={13} />
                <span className="text-xs font-medium">Todas as VMs protegidas e saudáveis</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <Link
            to="/azure/backup"
            className="flex items-center justify-between w-full text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
          >
            Ver detalhes de cobertura
            <ChevronRight size={13} />
          </Link>
        </>
      ) : (
        <div className="text-center py-4 text-gray-400 dark:text-gray-500">
          <ShieldOff size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">Não foi possível carregar dados de backup</p>
          <button onClick={() => coverageQ.refetch()} className="mt-2 text-xs text-sky-500 hover:underline">
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
