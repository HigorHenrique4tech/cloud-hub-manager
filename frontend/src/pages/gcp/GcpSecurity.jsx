import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle, Info, XCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import SkeletonTable from '../../components/common/SkeletonTable';
import EmptyState from '../../components/common/emptystate';
import api, { wsUrl } from '../../services/api';

const SEVERITY_CONFIG = {
  critical: { label: 'Crítico',  bg: 'bg-red-100 dark:bg-red-900/30',    text: 'text-red-700 dark:text-red-400',    dot: 'bg-red-500' },
  high:     { label: 'Alto',     bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  medium:   { label: 'Médio',    bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  low:      { label: 'Baixo',    bg: 'bg-gray-100 dark:bg-gray-800',      text: 'text-gray-600 dark:text-gray-400',    dot: 'bg-gray-400' },
};

const SeverityBadge = ({ severity }) => {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const FindingRow = ({ f }) => (
  <tr className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
    <td className="px-4 py-3 w-28"><SeverityBadge severity={f.severity} /></td>
    <td className="px-4 py-3">
      <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{f.resource_name}</p>
      <p className="text-xs text-gray-400 dark:text-slate-500">{f.resource_type} {f.region ? `· ${f.region}` : ''}</p>
    </td>
    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300">{f.issue}</td>
    <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400 max-w-xs">{f.recommendation}</td>
  </tr>
);

const GcpSecurity = () => {
  const { data, isLoading, isError, refetch, isFetching, isSuccess } = useQuery({
    queryKey: ['security-scan-gcp'],
    queryFn: () => api.get(wsUrl('/gcp/security/scan')).then(r => r.data),
    enabled: false,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const findings   = data?.findings ?? [];
  const criticals  = findings.filter(f => f.severity === 'critical').length;
  const highs      = findings.filter(f => f.severity === 'high').length;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <ShieldAlert size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Verificação de Segurança — GCP</h1>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Buckets públicos · Firewall rules abertas · IAM com roles/owner
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={(isLoading || isFetching) ? 'animate-spin' : ''} />
            {isLoading || isFetching ? 'Escaneando...' : 'Executar Scan'}
          </button>
        </div>

        {/* Summary badges (only after scan) */}
        {isSuccess && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500 dark:text-slate-400">
              {data?.scanned_at ? `Escaneado em ${new Date(data.scanned_at).toLocaleString('pt-BR')}` : ''}
            </span>
            {criticals > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                <XCircle size={12} /> {criticals} crítico{criticals !== 1 ? 's' : ''}
              </span>
            )}
            {highs > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                <AlertTriangle size={12} /> {highs} alto{highs !== 1 ? 's' : ''}
              </span>
            )}
            {findings.length === 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <ShieldCheck size={12} /> Nenhum problema encontrado
              </span>
            )}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="card p-4 flex items-center gap-3 text-sm text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">
            <AlertTriangle size={16} />
            Erro ao executar scan. Verifique se a conta de serviço tem permissões suficientes.
          </div>
        )}

        {/* Results table */}
        <div className="card overflow-hidden">
          {isLoading || isFetching ? (
            <SkeletonTable columns={4} rows={6} />
          ) : !isSuccess ? (
            <EmptyState
              icon={ShieldAlert}
              title="Nenhum scan executado"
              description="Clique em 'Executar Scan' para verificar configurações de segurança no seu projeto GCP."
              action={() => refetch()}
              actionLabel="Executar Scan"
            />
          ) : findings.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nenhum problema encontrado"
              description="Seu projeto GCP passou em todas as verificações básicas de segurança."
              iconColor="text-green-400 dark:text-green-500"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Severity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Recurso</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Problema</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Recomendação</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f, i) => <FindingRow key={i} f={f} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 text-xs text-gray-400 dark:text-slate-500">
          <Info size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            Verificações incluem: GCS Buckets com allUsers/allAuthenticatedUsers no IAM, regras de firewall
            permitindo SSH/RDP de 0.0.0.0/0, e bindings IAM do projeto com roles/owner para contas de usuário.
            Requer permissões: storage.buckets.getIamPolicy, compute.firewalls.list, resourcemanager.projects.getIamPolicy.
          </span>
        </div>
      </div>
    </Layout>
  );
};

export default GcpSecurity;
