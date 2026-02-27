import api, { wsUrl } from './api';

const finopsService = {
  // ── Summary / KPIs ────────────────────────────────────────────────────────

  getSummary: async () => {
    const { data } = await api.get(wsUrl('/finops/summary'));
    return data;
  },

  // ── Recommendations ───────────────────────────────────────────────────────

  getRecommendations: async ({ status, provider, severity } = {}) => {
    const params = {};
    if (status)   params.status   = status;
    if (provider) params.provider = provider;
    if (severity) params.severity = severity;
    const { data } = await api.get(wsUrl('/finops/recommendations'), { params });
    return data;
  },

  applyRecommendation: async (recId) => {
    const { data } = await api.post(wsUrl(`/finops/recommendations/${recId}/apply`));
    return data;
  },

  dismissRecommendation: async (recId, reason = '') => {
    const { data } = await api.post(wsUrl(`/finops/recommendations/${recId}/dismiss`), { reason });
    return data;
  },

  // ── Scan ──────────────────────────────────────────────────────────────────

  triggerScan: async (provider = null) => {
    const params = provider ? { provider } : {};
    const { data } = await api.post(wsUrl('/finops/scan'), null, { params });
    return data; // { job_id, status: "queued" }
  },

  getScanStatus: async (jobId) => {
    const { data } = await api.get(wsUrl(`/finops/scan/status/${jobId}`));
    return data; // { status, new_findings, results, error }
  },

  // ── Actions ───────────────────────────────────────────────────────────────

  getActions: async () => {
    const { data } = await api.get(wsUrl('/finops/actions'));
    return data;
  },

  rollbackAction: async (actionId) => {
    const { data } = await api.post(wsUrl(`/finops/actions/${actionId}/rollback`));
    return data;
  },

  // ── Budgets ───────────────────────────────────────────────────────────────

  getBudgets: async () => {
    const { data } = await api.get(wsUrl('/finops/budgets'));
    return data;
  },

  createBudget: async (payload) => {
    const { data } = await api.post(wsUrl('/finops/budgets'), payload);
    return data;
  },

  updateBudget: async (budgetId, payload) => {
    const { data } = await api.patch(wsUrl(`/finops/budgets/${budgetId}`), payload);
    return data;
  },

  deleteBudget: async (budgetId) => {
    await api.delete(wsUrl(`/finops/budgets/${budgetId}`));
  },

  // ── Anomalies ─────────────────────────────────────────────────────────────

  getAnomalies: async () => {
    const { data } = await api.get(wsUrl('/finops/anomalies'));
    return data;
  },

  acknowledgeAnomaly: async (anomalyId) => {
    const { data } = await api.post(wsUrl(`/finops/anomalies/${anomalyId}/acknowledge`));
    return data;
  },

  // ── Scan Schedule ─────────────────────────────────────────────────────────

  getScanSchedule: async () => {
    const { data } = await api.get(wsUrl('/finops/scan-schedule'));
    return data;
  },

  upsertScanSchedule: async (payload) => {
    const { data } = await api.post(wsUrl('/finops/scan-schedule'), payload);
    return data;
  },

  deleteScanSchedule: async () => {
    await api.delete(wsUrl('/finops/scan-schedule'));
  },

  // ── Budget Evaluation ─────────────────────────────────────────────────────

  evaluateBudgets: async () => {
    const { data } = await api.post(wsUrl('/finops/budgets/evaluate'));
    return data;
  },

  // ── Report Schedule ───────────────────────────────────────────────────────

  getReportSchedule: async () => {
    const { data } = await api.get(wsUrl('/finops/report-schedule'));
    return data;
  },

  upsertReportSchedule: async (payload) => {
    const { data } = await api.post(wsUrl('/finops/report-schedule'), payload);
    return data;
  },

  deleteReportSchedule: async () => {
    await api.delete(wsUrl('/finops/report-schedule'));
  },
};

export default finopsService;
