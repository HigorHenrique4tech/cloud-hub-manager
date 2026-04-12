import { FileDown, Printer, TrendingDown } from 'lucide-react';
import LoadingSpinner from '../common/loadingspinner';
import EmptyState from '../common/emptystate';
import RecommendationCard from './RecommendationCard';
import { FILTER_STATUS, FILTER_PROVIDER } from '../../utils/finops-constants';

const RecommendationsTab = ({
  recsQ,
  applyingId,
  dismissingId,
  onApply,
  onDismiss,
  onRequestApproval,
  requestingApprovalId,
  selectedIds,
  onToggle,
  toggleAll,
  allSelected,
  pendingItems,
  filterStatus,
  filterProvider,
  filterSeverity,
  setFilterStatus,
  setFilterProvider,
  setFilterSeverity,
  recsPage,
  setRecsPage,
  planTier,
  onExportCSV,
  onPrintPDF,
}) => (
  <div className="space-y-4 animate-fade-in">
    {/* Filters */}
    <div className="flex flex-wrap gap-2">
      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${!filterStatus ? 'bg-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'}`}
        >
          Todas
        </button>
        {FILTER_STATUS.map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
            className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors border-l border-gray-200 dark:border-gray-700 ${filterStatus === s ? 'bg-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            {s === 'pending' ? 'Pendente' : s === 'applied' ? 'Aplicada' : 'Ignorada'}
          </button>
        ))}
      </div>

      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {FILTER_PROVIDER.map((p, i) => (
          <button
            key={p}
            onClick={() => setFilterProvider(p === filterProvider ? '' : p)}
            className={`px-3 py-1.5 text-xs font-medium uppercase transition-colors ${i > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''} ${filterProvider === p ? 'bg-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {['high', 'medium', 'low'].map((sev, i) => (
          <button
            key={sev}
            onClick={() => setFilterSeverity(sev === filterSeverity ? '' : sev)}
            className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${i > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''} ${filterSeverity === sev ? 'bg-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            {sev === 'high' ? 'Alta' : sev === 'medium' ? 'Média' : 'Baixa'}
          </button>
        ))}
      </div>

      {/* Export buttons */}
      <div className="ml-auto flex gap-2">
        <button
          onClick={onExportCSV}
          title="Exportar CSV"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-[0.97]"
        >
          <FileDown size={13} />
          CSV
        </button>
        <button
          onClick={onPrintPDF}
          title="Imprimir / Salvar como PDF"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-[0.97]"
        >
          <Printer size={13} />
          PDF
        </button>
      </div>
    </div>

    {/* List */}
    {recsQ.isLoading ? (
      <div className="flex justify-center py-12"><LoadingSpinner /></div>
    ) : recsQ.isError ? (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-900/20 dark:text-red-300">
        Erro ao carregar recomendações. Verifique as permissões.
      </div>
    ) : recsQ.data?.total === 0 ? (
      <EmptyState
        icon={TrendingDown}
        title="Nenhuma recomendação encontrada"
        description='Clique em "Escanear Agora" para detectar desperdícios'
      />
    ) : (
      <div className="space-y-3">
        {filterStatus === 'pending' && pendingItems.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none px-1">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 accent-primary"
            />
            {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
          </label>
        )}
        {(recsQ.data?.items ?? []).map((rec) => (
          <RecommendationCard
            key={rec.id}
            rec={rec}
            onApply={onApply}
            onDismiss={onDismiss}
            onRequestApproval={onRequestApproval}
            requestingApprovalId={requestingApprovalId}
            applyLoading={applyingId === rec.id}
            dismissLoading={dismissingId === rec.id}
            planTier={planTier}
            selected={selectedIds.has(rec.id)}
            onToggle={filterStatus === 'pending' ? () => onToggle(rec.id) : undefined}
          />
        ))}
        {/* Pagination */}
        {recsQ.data?.pages > 1 && (
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {recsQ.data.total} recomendações · Página {recsQ.data.page} de {recsQ.data.pages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={recsPage === 1}
                onClick={() => setRecsPage((p) => p - 1)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                Anterior
              </button>
              <button
                disabled={recsPage >= recsQ.data.pages}
                onClick={() => setRecsPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>
    )}
  </div>
);

export default RecommendationsTab;
