import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Zap, Trash2, StopCircle,
  ArrowRight, Lock, AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react';
import PermissionGate from '../common/PermissionGate';
import PlanGate from '../common/PlanGate';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SEVERITY_STYLES = {
  high:   'bg-red-500/20 text-red-300 border border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  low:    'bg-blue-500/20 text-blue-300 border border-blue-500/30',
};

const TYPE_ICON = {
  right_size: <ArrowRight size={14} />,
  stop:       <StopCircle size={14} />,
  delete:     <Trash2 size={14} />,
  schedule:   <Zap size={14} />,
  reserve:    <Zap size={14} />,
};

const TYPE_LABEL = {
  right_size: 'Redimensionar',
  stop:       'Parar',
  delete:     'Deletar',
  schedule:   'Agendar',
  reserve:    'Reservar',
};

const PROVIDER_BADGE = {
  aws:   'bg-orange-500/20 text-orange-300',
  azure: 'bg-sky-500/20 text-sky-300',
};

const STATUS_ICON = {
  applied:   <CheckCircle2 size={14} className="text-green-400" />,
  dismissed: <XCircle size={14} className="text-slate-400" />,
  failed:    <AlertTriangle size={14} className="text-red-400" />,
};

const RecommendationCard = ({ rec, onApply, onDismiss, applyLoading, dismissLoading, planTier = 'free' }) => {
  const [expanded, setExpanded] = useState(false);
  const isLocked = rec._locked;
  const isPending = rec.status === 'pending';

  const canApply  = !isLocked && isPending;
  const planOk    = ['pro', 'enterprise'].includes((planTier || 'free').toLowerCase());

  return (
    <div className={`rounded-xl border transition-colors ${
      isLocked
        ? 'border-slate-700/50 bg-slate-900/30 opacity-60'
        : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
    }`}>
      {/* Header row */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer select-none"
        onClick={() => !isLocked && setExpanded((v) => !v)}
      >
        {/* Severity badge */}
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${SEVERITY_STYLES[rec.severity] || SEVERITY_STYLES.medium}`}>
          {rec.severity === 'high' ? '⬆ ALTA' : rec.severity === 'medium' ? '= MÉDIA' : '⬇ BAIXA'}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PROVIDER_BADGE[rec.provider] || 'bg-slate-700 text-slate-300'}`}>
              {rec.provider?.toUpperCase()}
            </span>
            <span className="text-sm font-semibold text-slate-100 truncate">{rec.resource_name}</span>
            <span className="text-xs text-slate-400">({rec.resource_type})</span>
            {rec.region && (
              <span className="text-xs text-slate-500">{rec.region}</span>
            )}
          </div>

          {/* Recommendation summary */}
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-slate-700 text-slate-300`}>
              {TYPE_ICON[rec.recommendation_type]}
              {TYPE_LABEL[rec.recommendation_type] || rec.recommendation_type}
            </span>
            {rec.recommended_spec?.instance_type && (
              <span className="text-xs text-slate-400">→ {rec.recommended_spec.instance_type}</span>
            )}
            {rec.recommended_spec?.vm_size && (
              <span className="text-xs text-slate-400">→ {rec.recommended_spec.vm_size}</span>
            )}
          </div>

          {!isLocked && (
            <p className="mt-1.5 text-xs text-slate-400 line-clamp-2">{rec.reasoning}</p>
          )}
        </div>

        {/* Saving + controls */}
        <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
          {isLocked ? (
            <div className="flex items-center gap-1 text-slate-500 text-sm">
              <Lock size={13} />
              <span>Pro</span>
            </div>
          ) : (
            <span className="text-base font-bold text-green-400">
              {fmtUSD(rec.estimated_saving_monthly)}<span className="text-xs font-normal text-slate-400">/mês</span>
            </span>
          )}

          {rec.status !== 'pending' && STATUS_ICON[rec.status] && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              {STATUS_ICON[rec.status]}
              <span className="capitalize">{rec.status}</span>
            </div>
          )}

          {!isLocked && (
            <button
              className="text-slate-500 hover:text-slate-300 transition-colors"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && !isLocked && (
        <div className="border-t border-slate-700 px-4 py-3 space-y-3">
          {/* Spec comparison */}
          {(rec.current_spec || rec.recommended_spec) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {rec.current_spec && (
                <div className="rounded bg-slate-900/60 p-2">
                  <p className="mb-1 font-semibold text-slate-400">Atual</p>
                  {Object.entries(rec.current_spec).map(([k, v]) => (
                    <p key={k} className="text-slate-300">
                      <span className="text-slate-500">{k}:</span> {String(v)}
                    </p>
                  ))}
                </div>
              )}
              {rec.recommended_spec && (
                <div className="rounded bg-green-900/20 border border-green-800/30 p-2">
                  <p className="mb-1 font-semibold text-green-400">Recomendado</p>
                  {Object.entries(rec.recommended_spec).map(([k, v]) => (
                    <p key={k} className="text-green-300">
                      <span className="text-green-500">{k}:</span> {String(v)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cost row */}
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <span>Custo atual: <strong className="text-slate-200">{fmtUSD(rec.current_monthly_cost)}/mês</strong></span>
            <span>Economia estimada: <strong className="text-green-400">{fmtUSD(rec.estimated_saving_monthly)}/mês</strong></span>
          </div>

          {/* Action buttons */}
          {canApply && (
            <div className="flex items-center gap-2 pt-1">
              <PermissionGate
                permission="finops.execute"
                fallback={
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Lock size={12} /> Sem permissão para aplicar
                  </span>
                }
              >
                {planOk ? (
                  <button
                    onClick={() => onApply(rec.id)}
                    disabled={applyLoading}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
                  >
                    {applyLoading ? 'Aplicando…' : 'Aplicar'}
                  </button>
                ) : (
                  <PlanGate minPlan="pro" feature="Aplicar recomendações" inline />
                )}
              </PermissionGate>

              <PermissionGate permission="finops.recommend">
                <button
                  onClick={() => onDismiss(rec.id)}
                  disabled={dismissLoading}
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-400 hover:text-white disabled:opacity-50 transition-colors"
                >
                  {dismissLoading ? 'Ignorando…' : 'Ignorar'}
                </button>
              </PermissionGate>
            </div>
          )}
        </div>
      )}

      {/* Locked upgrade CTA overlay */}
      {isLocked && (
        <div className="px-4 pb-4">
          <a
            href="/billing"
            className="block rounded-md border border-dashed border-indigo-700 bg-indigo-900/20 px-3 py-2 text-center text-xs font-medium text-indigo-300 hover:bg-indigo-900/40 transition-colors"
          >
            Fazer upgrade para Pro para ver todas as recomendações →
          </a>
        </div>
      )}
    </div>
  );
};

export default RecommendationCard;
