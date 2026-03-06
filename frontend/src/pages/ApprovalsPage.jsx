import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, User, X } from 'lucide-react';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import approvalService from '../services/approvalService';

const STATUS_LABELS = {
  pending:   { label: 'Pendente',  color: 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800' },
  approved:  { label: 'Aprovada',  color: 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' },
  rejected:  { label: 'Rejeitada', color: 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' },
  cancelled: { label: 'Cancelada', color: 'text-gray-500 bg-gray-50 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600' },
};

const ACTION_LABELS = {
  apply_recommendation: 'Aplicar Recomendação FinOps',
  stop_instance:        'Parar Instância',
  delete_resource:      'Deletar Recurso',
  policy_triggered:     'Política Disparada',
};

function StatusBadge({ status }) {
  const { label, color } = STATUS_LABELS[status] || STATUS_LABELS.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {status === 'pending'   && <Clock className="w-3 h-3" />}
      {status === 'approved'  && <CheckCircle className="w-3 h-3" />}
      {status === 'rejected'  && <XCircle className="w-3 h-3" />}
      {status === 'cancelled' && <X className="w-3 h-3" />}
      {label}
    </span>
  );
}

function ResolveModal({ approval, mode, onClose, onConfirm, isLoading }) {
  const [notes, setNotes] = useState('');
  const isApprove = mode === 'approve';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isApprove ? 'Aprovar solicitação' : 'Rejeitar solicitação'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {ACTION_LABELS[approval.action_type] || approval.action_type}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {approval.action_payload?.resource_name || approval.action_payload?.policy_name || '—'}
          </p>
        </div>

        <label className="block mb-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Observações {isApprove ? '(opcional)' : '(opcional)'}
          </span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder={isApprove ? 'Comentário sobre a aprovação...' : 'Motivo da rejeição...'}
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(notes)}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              isApprove
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isLoading ? 'Processando...' : isApprove ? 'Aprovar' : 'Rejeitar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalCard({ approval, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState(null); // 'approve' | 'reject'
  const qc = useQueryClient();

  const approveMut = useMutation({
    mutationFn: (notes) => approvalService.approve(approval.id, notes),
    onSuccess: () => { qc.invalidateQueries(['approvals']); qc.invalidateQueries(['approvals-count']); setModal(null); },
  });

  const rejectMut = useMutation({
    mutationFn: (notes) => approvalService.reject(approval.id, notes),
    onSuccess: () => { qc.invalidateQueries(['approvals']); qc.invalidateQueries(['approvals-count']); setModal(null); },
  });

  const cancelMut = useMutation({
    mutationFn: () => approvalService.cancel(approval.id),
    onSuccess: () => { qc.invalidateQueries(['approvals']); qc.invalidateQueries(['approvals-count']); },
  });

  const payload = approval.action_payload || {};
  const isPending = approval.status === 'pending';

  return (
    <>
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={approval.status} />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {ACTION_LABELS[approval.action_type] || approval.action_type}
              </span>
              {payload.provider && (
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-mono">
                  {payload.provider}
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 font-medium">
              {payload.resource_name || payload.policy_name || '—'}
            </p>

            {payload.reasoning && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {payload.reasoning}
              </p>
            )}

            <div className="mt-2 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
              {approval.requester_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {approval.requester_name}
                </span>
              )}
              <span>{new Date(approval.created_at).toLocaleString('pt-BR')}</span>
              {payload.estimated_saving_monthly > 0 && (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  Economia potencial: US$ {payload.estimated_saving_monthly.toFixed(2)}/mês
                </span>
              )}
            </div>

            {approval.notes && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                Observação: {approval.notes}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isPending && (
              <>
                <button
                  onClick={() => setModal('approve')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Aprovar
                </button>
                <button
                  onClick={() => setModal('reject')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> Rejeitar
                </button>
                <button
                  onClick={() => cancelMut.mutate()}
                  disabled={cancelMut.isPending}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Cancelar"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Detalhes do payload</p>
            <pre className="text-xs bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg overflow-auto max-h-48 text-gray-700 dark:text-gray-300">
              {JSON.stringify(payload, null, 2)}
            </pre>
            {approval.resolver_name && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Resolvido por: {approval.resolver_name} em {new Date(approval.resolved_at).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
        )}
      </div>

      {modal && (
        <ResolveModal
          approval={approval}
          mode={modal}
          onClose={() => setModal(null)}
          onConfirm={(notes) => modal === 'approve' ? approveMut.mutate(notes) : rejectMut.mutate(notes)}
          isLoading={approveMut.isPending || rejectMut.isPending}
        />
      )}
    </>
  );
}

const TABS = [
  { id: 'pending',   label: 'Pendentes' },
  { id: 'approved',  label: 'Aprovadas' },
  { id: 'rejected',  label: 'Rejeitadas' },
  { id: 'cancelled', label: 'Canceladas' },
];

export default function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState('pending');

  const approvalsQ = useQuery({
    queryKey: ['approvals', statusFilter],
    queryFn: () => approvalService.list({ status: statusFilter }),
  });

  const items = approvalsQ.data?.items || [];
  const total = approvalsQ.data?.total || 0;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Aprovações</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Solicitações de execução de ações de alto impacto aguardando aprovação de admin/owner.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg mb-6 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                statusFilter === t.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {approvalsQ.isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {approvalsQ.isError && (
          <div className="card flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">Erro ao carregar aprovações.</p>
          </div>
        )}

        {!approvalsQ.isLoading && items.length === 0 && (
          <div className="card text-center py-12">
            <CheckCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {statusFilter === 'pending'
                ? 'Nenhuma solicitação pendente.'
                : `Nenhuma solicitação com status "${STATUS_LABELS[statusFilter]?.label}".`}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {items.map(a => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </div>

        {total > items.length && (
          <p className="mt-4 text-center text-sm text-gray-400 dark:text-gray-500">
            Mostrando {items.length} de {total}
          </p>
        )}
      </div>
    </Layout>
  );
}
