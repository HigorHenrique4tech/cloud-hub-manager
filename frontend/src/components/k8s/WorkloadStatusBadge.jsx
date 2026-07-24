// Pílula de status para workloads/pods Kubernetes.
const STATUS_MAP = {
  Running:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Succeeded:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Pending:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Failed:     'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  Unknown:    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  connected:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  unreachable:'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  unknown:    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const LABELS = {
  connected: 'Conectado', unreachable: 'Inacessível', unknown: 'Desconhecido',
};

const WorkloadStatusBadge = ({ status }) => {
  const cls = STATUS_MAP[status] || STATUS_MAP.Unknown;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
      {LABELS[status] || status || '—'}
    </span>
  );
};

export default WorkloadStatusBadge;
