import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, TrendingDown, History, Wallet, Bell, Mail, Clock, AlertTriangle, X, Server } from 'lucide-react';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import PermissionGate from '../components/common/PermissionGate';
import PlanGate from '../components/common/PlanGate';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';
import WasteSummary from '../components/finops/WasteSummary';
import BudgetModal from '../components/finops/BudgetModal';
import ScanScheduleModal from '../components/finops/ScanScheduleModal';
import ReportScheduleModal from '../components/finops/ReportScheduleModal';
import RecommendationsTab from '../components/finops/RecommendationsTab';
import BudgetsTab from '../components/finops/BudgetsTab';
import ReportsTab from '../components/finops/ReportsTab';
import AnomaliesTab from '../components/finops/AnomaliesTab';
import ActionsHistoryTab from '../components/finops/ActionsHistoryTab';
import CostTrendChart from '../components/finops/CostTrendChart';
import ReservationsTab from '../components/finops/ReservationsTab';
import finopsService from '../services/finopsService';
import approvalService from '../services/approvalService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import { useFinOpsBudgets } from '../hooks/useFinOpsBudgets';
import { useFinOpsScans } from '../hooks/useFinOpsScans';
import { useFinOpsReports } from '../hooks/useFinOpsReports';

const TABS = [
  { id: 'recommendations', label: 'Recomendações', icon: TrendingDown },
  { id: 'reservations',    label: 'Reservas',       icon: Server },
  { id: 'budgets',         label: 'Orçamentos',     icon: Wallet },
  { id: 'reports',         label: 'Relatórios',     icon: Mail },
  { id: 'anomalies',       label: 'Anomalias',      icon: Bell },
  { id: 'actions',         label: 'Histórico',      icon: History },
];

const FinOps = () => {
  const qc = useQueryClient();
  const { currentOrg } = useOrgWorkspace();
  const planTier = (currentOrg?.effective_plan || currentOrg?.plan_tier || 'free').toLowerCase();
  const isPro = ['pro', 'enterprise'].includes(planTier);

  /* ── UI state ── */
  const [activeTab, setActiveTab]             = useState('recommendations');
  const [filterStatus, setFilterStatus]       = useState('pending');
  const [filterProvider, setFilterProvider]   = useState('');
  const [filterSeverity, setFilterSeverity]   = useState('');
  const [recsPage, setRecsPage]               = useState(1);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showScanScheduleModal, setShowScanScheduleModal]   = useState(false);
  const [showReportScheduleModal, setShowReportScheduleModal] = useState(false);
  const [applyingId, setApplyingId]                   = useState(null);
  const [dismissingId, setDismissingId]               = useState(null);
  const [rollbackId, setRollbackId]                   = useState(null);
  const [requestingApprovalId, setRequestingApprovalId] = useState(null);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [scanJobId, setScanJobId]       = useState(null);
  const [scanJobStatus, setScanJobStatus] = useState(null);
  const [bulkApplyConfirmOpen, setBulkApplyConfirmOpen] = useState(false);
  const [filterAnomalyProvider, setFilterAnomalyProvider] = useState('');

  /* ── Custom hooks ── */
  const [editBudget, setEditBudget] = useState(null);
  const { budgetsQ, createBudget, updateBudget, deleteBudget, evaluateBudgets } = useFinOpsBudgets({
    enabled: activeTab === 'budgets' && isPro,
  });
  const { scanScheduleQ, upsertScanSchedule, deleteScanSchedule } = useFinOpsScans({ enabled: isPro });
  const { reportScheduleQ, upsertReportSchedule, deleteReportSchedule } = useFinOpsReports({ enabled: isPro });

  /* ── Scan job polling ── */
  useEffect(() => {
    if (!scanJobId) return;
    if (scanJobStatus?.status === 'done' || scanJobStatus?.status === 'error') return;
    const interval = setInterval(async () => {
      try {
        const status = await finopsService.getScanStatus(scanJobId);
        setScanJobStatus(status);
        if (status.status === 'done') {
          qc.invalidateQueries({ queryKey: ['finops-recs'] });
          qc.invalidateQueries({ queryKey: ['finops-summary'] });
          clearInterval(interval);
        } else if (status.status === 'error') {
          clearInterval(interval);
        }
      } catch { clearInterval(interval); }
    }, 2500);
    return () => clearInterval(interval);
  }, [scanJobId, scanJobStatus?.status, qc]);

  /* ── Queries ── */
  const summaryQ = useQuery({
    queryKey: ['finops-summary'],
    queryFn: finopsService.getSummary,
    refetchInterval: 60_000,
  });

  useEffect(() => { setRecsPage(1); }, [filterStatus, filterProvider, filterSeverity]);

  const recsQ = useQuery({
    queryKey: ['finops-recs', filterStatus, filterProvider, filterSeverity, recsPage],
    queryFn: () => finopsService.getRecommendations({
      status:    filterStatus   || undefined,
      provider:  filterProvider || undefined,
      severity:  filterSeverity || undefined,
      page:      recsPage,
      page_size: 20,
    }),
    enabled: activeTab === 'recommendations',
  });

  const actionsQ = useQuery({
    queryKey: ['finops-actions'],
    queryFn: finopsService.getActions,
    enabled: activeTab === 'actions',
  });

  const anomaliesQ = useQuery({
    queryKey: ['finops-anomalies', filterAnomalyProvider],
    queryFn: () => finopsService.getAnomalies({ provider: filterAnomalyProvider || undefined }),
    enabled: isPro && activeTab === 'anomalies',
  });

  const costTrendQ = useQuery({
    queryKey: ['finops-cost-trend', 30],
    queryFn:  () => finopsService.getCostTrend(30),
    enabled:  isPro,
    staleTime: 60 * 60 * 1000,
  });

  /* ── Mutations ── */
  const scanMut = useMutation({
    mutationFn: () => finopsService.triggerScan(),
    onSuccess: (data) => {
      if (data?.job_id) { setScanJobId(data.job_id); setScanJobStatus({ status: 'queued' }); }
    },
  });

  const applyMut = useMutation({
    mutationFn: finopsService.applyRecommendation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      qc.invalidateQueries({ queryKey: ['finops-actions'] });
      setApplyingId(null);
    },
    onError: () => setApplyingId(null),
  });

  const requestApprovalMut = useMutation({
    mutationFn: (recId) => approvalService.requestApproval(recId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals-count'] });
      setRequestingApprovalId(null);
    },
    onError: () => setRequestingApprovalId(null),
  });

  const dismissMut = useMutation({
    mutationFn: finopsService.dismissRecommendation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      setDismissingId(null);
    },
    onError: () => setDismissingId(null),
  });

  const bulkDismissMut = useMutation({
    mutationFn: (ids) => finopsService.bulkDismiss([...ids]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      setSelectedIds(new Set());
    },
  });

  const bulkApplyMut = useMutation({
    mutationFn: (ids) => finopsService.bulkApply([...ids]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      setSelectedIds(new Set());
    },
  });

  const rollbackMut = useMutation({
    mutationFn: finopsService.rollbackAction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-actions'] });
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      setRollbackId(null);
    },
    onError: () => setRollbackId(null),
  });

  const acknowledgeAnomalyMut = useMutation({
    mutationFn: finopsService.acknowledgeAnomaly,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-anomalies'] }),
  });

  const anomalyScanMut = useMutation({
    mutationFn: finopsService.triggerAnomalyScan,
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['finops-anomalies'] });
        qc.invalidateQueries({ queryKey: ['finops-summary'] });
      }, 3000);
    },
  });

  useEffect(() => {
    if (activeTab === 'budgets' && isPro) evaluateBudgets.mutate();
  }, [activeTab, isPro]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Handlers ── */
  const handleApply   = (id) => { setApplyingId(id);   applyMut.mutate(id); };
  const handleDismiss = (id) => { setDismissingId(id); dismissMut.mutate(id); };
  const handleRollback = (id) => { setRollbackId(id);  rollbackMut.mutate(id); };

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const pendingItems = (recsQ.data?.items ?? []).filter((r) => r.status === 'pending' && !r._locked);
  const allSelected  = pendingItems.length > 0 && pendingItems.every((r) => selectedIds.has(r.id));
  const toggleAll    = () => setSelectedIds(allSelected ? new Set() : new Set(pendingItems.map((r) => r.id)));

  const handleExportCSV = async () => {
    try {
      await finopsService.exportRecommendationsCSV({
        status:   filterStatus   || undefined,
        provider: filterProvider || undefined,
        severity: filterSeverity || undefined,
      });
    } catch { /* silently ignore */ }
  };

  const handlePrintPDF = () => {
    const items = recsQ.data?.items ?? [];
    const rows = items.map((r) => `
      <tr>
        <td>${r.provider?.toUpperCase() ?? ''}</td>
        <td>${r.resource_name || r.resource_id}</td>
        <td>${r.resource_type}</td>
        <td>${r.recommendation_type}</td>
        <td>${r.severity}</td>
        <td>$${Number(r.estimated_saving_monthly ?? 0).toFixed(2)}</td>
        <td>${r.status}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>FinOps — Recomendações</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px}h1{font-size:16px;margin-bottom:8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#f0f0f0;font-weight:bold}tr:nth-child(even){background:#fafafa}</style>
      </head><body>
      <h1>FinOps — Recomendações (${new Date().toLocaleDateString('pt-BR')})</h1>
      <table><thead><tr><th>Provider</th><th>Recurso</th><th>Tipo</th><th>Recomendação</th><th>Severidade</th><th>Economia/mês</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const openAnomalyCount = anomaliesQ.data?.items?.filter((a) => a.status === 'open').length ?? 0;
  const pendingRecsCount = recsQ.data?.items?.filter((r) => r.status === 'pending').length ?? 0;

  /* ── Render ── */
  return (
    <Layout>
      <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary/20">
              <Zap size={22} className="text-primary-dark dark:text-primary-light" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">FinOps</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Detecte desperdício e aplique economias reais na sua infraestrutura</p>
            </div>
          </div>
          <PlanGate minPlan="pro" feature="Análise Automática">
            <button
              onClick={() => setShowScanScheduleModal(true)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors active:scale-[0.97] ${
                scanScheduleQ.data?.is_enabled
                  ? 'border-primary/50 bg-primary/10 text-primary-light hover:bg-primary/20'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Clock size={15} />
              {scanScheduleQ.data?.is_enabled
                ? `Agendado · ${scanScheduleQ.data.schedule_time}`
                : 'Agendar Análise'}
            </button>
          </PlanGate>
        </div>

        {/* Hero summary */}
        <PermissionGate permission="finops.view">
          {summaryQ.isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : (
            <WasteSummary
              summary={summaryQ.data}
              onScan={() => { setScanJobId(null); setScanJobStatus(null); scanMut.mutate(); }}
              scanning={scanMut.isPending || ['queued', 'running'].includes(scanJobStatus?.status)}
            />
          )}
        </PermissionGate>

        {/* Cost trend chart */}
        {isPro && <CostTrendChart costTrendQ={costTrendQ} />}

        {/* Scan result toasts */}
        {scanJobStatus?.status === 'queued' && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800/60 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 animate-slide-down">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 dark:border-gray-400 border-t-transparent" />
            Scan na fila, aguardando início...
          </div>
        )}
        {scanJobStatus?.status === 'running' && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-300 dark:border-blue-700/40 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300 animate-slide-down">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 dark:border-blue-400 border-t-transparent" />
            Escaneando recursos cloud... isso pode levar até 1 minuto.
          </div>
        )}
        {scanJobStatus?.status === 'done' && (
          <div className="flex items-center gap-2 rounded-lg border border-green-300 dark:border-green-700/40 bg-green-50 dark:bg-green-900/20 px-4 py-2.5 text-sm text-green-700 dark:text-green-300 animate-slide-down">
            <Zap size={14} />
            Scan concluído: <strong>{scanJobStatus.new_findings}</strong> novos desperdícios detectados.
          </div>
        )}
        {(scanMut.isError || scanJobStatus?.status === 'error') && (
          <div className="flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-700/40 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-700 dark:text-red-300 animate-slide-down">
            <AlertTriangle size={14} />
            {scanJobStatus?.error || 'Erro ao escanear. Verifique as credenciais da conta cloud.'}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav
            className="flex gap-1 -mb-px"
            role="tablist"
            aria-label="Seções do FinOps"
            onKeyDown={(e) => {
              const ids = TABS.map((t) => t.id);
              const cur = ids.indexOf(activeTab);
              if (e.key === 'ArrowRight') { e.preventDefault(); setActiveTab(ids[(cur + 1) % ids.length]); }
              if (e.key === 'ArrowLeft')  { e.preventDefault(); setActiveTab(ids[(cur - 1 + ids.length) % ids.length]); }
              if (e.key === 'Home') { e.preventDefault(); setActiveTab(ids[0]); }
              if (e.key === 'End')  { e.preventDefault(); setActiveTab(ids[ids.length - 1]); }
            }}
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`tabpanel-${id}`}
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-primary text-primary dark:text-primary-light'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Icon size={15} />
                {label}
                {id === 'anomalies' && openAnomalyCount > 0 && (
                  <span className="ml-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-600/30 dark:text-amber-300 px-1.5 py-0.5 text-xs font-semibold">
                    {openAnomalyCount}
                  </span>
                )}
                {id === 'recommendations' && pendingRecsCount > 0 && (
                  <span className="ml-1 rounded-full bg-primary-50 text-primary-dark dark:bg-primary/30 dark:text-primary-light px-1.5 py-0.5 text-xs font-semibold">
                    {pendingRecsCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="focus:outline-none"
        >
          {activeTab === 'recommendations' && (
            <RecommendationsTab
              recsQ={recsQ}
              applyingId={applyingId}
              dismissingId={dismissingId}
              onApply={handleApply}
              onDismiss={handleDismiss}
              onRequestApproval={(recId) => { setRequestingApprovalId(recId); requestApprovalMut.mutate(recId); }}
              requestingApprovalId={requestingApprovalId}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              toggleAll={toggleAll}
              allSelected={allSelected}
              pendingItems={pendingItems}
              filterStatus={filterStatus}
              filterProvider={filterProvider}
              filterSeverity={filterSeverity}
              setFilterStatus={setFilterStatus}
              setFilterProvider={setFilterProvider}
              setFilterSeverity={setFilterSeverity}
              recsPage={recsPage}
              setRecsPage={setRecsPage}
              planTier={planTier}
              onExportCSV={handleExportCSV}
              onPrintPDF={handlePrintPDF}
            />
          )}
          {activeTab === 'budgets' && (
            <BudgetsTab
              budgetsQ={budgetsQ}
              deleteBudget={deleteBudget}
              evaluateBudgets={evaluateBudgets}
              onOpenModal={() => setShowBudgetModal(true)}
              onEditBudget={(budget) => setEditBudget(budget)}
            />
          )}
          {activeTab === 'reports' && (
            <ReportsTab
              reportScheduleQ={reportScheduleQ}
              onOpenModal={() => setShowReportScheduleModal(true)}
            />
          )}
          {activeTab === 'reservations' && (
            <ReservationsTab />
          )}
          {activeTab === 'anomalies' && (
            <AnomaliesTab
              anomaliesQ={anomaliesQ}
              anomalyScanMut={anomalyScanMut}
              acknowledgeAnomalyMut={acknowledgeAnomalyMut}
              filterProvider={filterAnomalyProvider}
              setFilterProvider={setFilterAnomalyProvider}
            />
          )}
          {activeTab === 'actions' && (
            <ActionsHistoryTab
              actionsQ={actionsQ}
              onRollback={handleRollback}
              rollbackId={rollbackId}
              planTier={planTier}
            />
          )}
        </div>

        {/* Modals */}
        {showBudgetModal && (
          <BudgetModal
            onClose={() => setShowBudgetModal(false)}
            onSave={(payload) => {
              createBudget.mutate(payload, { onSuccess: () => setShowBudgetModal(false) });
            }}
            saving={createBudget.isPending}
          />
        )}
        {editBudget && (
          <BudgetModal
            existing={editBudget}
            onClose={() => setEditBudget(null)}
            onSave={(payload) => {
              updateBudget.mutate({ id: editBudget.id, payload }, { onSuccess: () => setEditBudget(null) });
            }}
            saving={updateBudget.isPending}
          />
        )}
        {showScanScheduleModal && (
          <ScanScheduleModal
            onClose={() => setShowScanScheduleModal(false)}
            existing={scanScheduleQ.data ?? null}
            onSave={(payload) => {
              upsertScanSchedule.mutate(payload, { onSuccess: () => setShowScanScheduleModal(false) });
            }}
            onDelete={() => {
              deleteScanSchedule.mutate(undefined, { onSuccess: () => setShowScanScheduleModal(false) });
            }}
            saving={upsertScanSchedule.isPending}
            deleting={deleteScanSchedule.isPending}
          />
        )}
        {showReportScheduleModal && (
          <ReportScheduleModal
            onClose={() => setShowReportScheduleModal(false)}
            existing={reportScheduleQ.data?.schedule ?? null}
            onSave={(payload) => {
              upsertReportSchedule.mutate(payload, { onSuccess: () => setShowReportScheduleModal(false) });
            }}
            onDelete={() => {
              deleteReportSchedule.mutate(undefined, { onSuccess: () => setShowReportScheduleModal(false) });
            }}
            saving={upsertReportSchedule.isPending}
            deleting={deleteReportSchedule.isPending}
          />
        )}
      </div>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
                        rounded-xl border border-primary/40 bg-gray-900/95 backdrop-blur
                        px-5 py-3 shadow-2xl shadow-black/40 animate-slide-up">
          <span className="text-sm font-medium text-gray-300">
            {selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Limpar seleção"
          >
            <X size={16} />
          </button>
          <div className="w-px h-5 bg-gray-700" />
          <button
            onClick={() => bulkDismissMut.mutate(selectedIds)}
            disabled={bulkDismissMut.isPending}
            className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-300
                       hover:border-gray-400 hover:text-white disabled:opacity-50 transition-colors active:scale-[0.97]"
          >
            {bulkDismissMut.isPending ? 'Ignorando…' : 'Ignorar todas'}
          </button>
          <PermissionGate permission="finops.execute">
            <button
              onClick={() => setBulkApplyConfirmOpen(true)}
              disabled={bulkApplyMut.isPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white
                         hover:bg-primary-dark disabled:opacity-50 transition-colors active:scale-[0.97]"
            >
              {bulkApplyMut.isPending ? 'Aplicando…' : 'Aplicar todas'}
            </button>
          </PermissionGate>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={bulkApplyConfirmOpen}
        onClose={() => setBulkApplyConfirmOpen(false)}
        onConfirm={() => { setBulkApplyConfirmOpen(false); bulkApplyMut.mutate(selectedIds); }}
        title="Aplicar Recomendações"
        description={`Aplicar ${selectedIds.size} recomendação(ões)? Esta ação pode ser irreversível.`}
        confirmLabel="Aplicar"
        variant="warning"
      />
    </Layout>
  );
};

export default FinOps;
