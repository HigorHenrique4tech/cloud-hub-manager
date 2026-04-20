import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

const formatDelta = (ms) => {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1)  return `${h}h ${m}m`;
  return `${m}m`;
};

const SLABadge = ({ ticket }) => {
  if (!ticket?.sla_deadline) return null;

  const resolved = ticket.status === 'resolved' || ticket.status === 'closed';
  const firstResponded = !!ticket.first_response_at;

  if (firstResponded || resolved) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
        <CheckCircle2 className="w-3 h-3" /> SLA cumprido
      </span>
    );
  }

  const deadline = new Date(ticket.sla_deadline).getTime();
  const now = Date.now();
  const delta = deadline - now;

  if (ticket.sla_breached || delta < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
        <AlertTriangle className="w-3 h-3" /> SLA estourado há {formatDelta(delta)}
      </span>
    );
  }

  const hoursLeft = delta / 3_600_000;
  const cls = hoursLeft < 1
    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
    : hoursLeft < 4
      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${cls}`}>
      <Clock className="w-3 h-3" /> SLA em {formatDelta(delta)}
    </span>
  );
};

export default SLABadge;
