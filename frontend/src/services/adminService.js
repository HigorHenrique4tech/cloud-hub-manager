import api from './api';

const adminService = {
  // Submit Enterprise lead (any authenticated user)
  submitLead: (data) => api.post('/admin/leads', data).then((r) => r.data),

  // Admin only — lead management
  listLeads: (status) =>
    api.get('/admin/leads', { params: status ? { status } : {} }).then((r) => r.data),
  updateLeadStatus: (id, status) =>
    api.put(`/admin/leads/${id}`, { status }).then((r) => r.data),

  // Admin only — org management
  listOrgs: () => api.get('/admin/orgs').then((r) => r.data),
  setOrgPlan: (slug, plan_tier) =>
    api.put(`/admin/orgs/${slug}/plan`, { plan_tier }).then((r) => r.data),
  getOrgMetrics: (slug) =>
    api.get(`/admin/orgs/${slug}/metrics`).then((r) => r.data),
  suspendOrg: (slug, suspend, reason) =>
    api.patch(`/admin/orgs/${slug}/suspend`, { suspend, reason }).then((r) => r.data),
  updateOrgNotes: (slug, notes) =>
    api.patch(`/admin/orgs/${slug}/notes`, { notes }).then((r) => r.data),

  // Admin only — billing
  listBilling: (params = {}) =>
    api.get('/admin/billing', { params }).then((r) => r.data),
  createBilling: (data) =>
    api.post('/admin/billing', data).then((r) => r.data),
  updateBilling: (id, data) =>
    api.put(`/admin/billing/${id}`, data).then((r) => r.data),
  deleteBilling: (id) =>
    api.delete(`/admin/billing/${id}`).then((r) => r.data),
  uploadBillingAttachment: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/admin/billing/${id}/attachment`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  downloadBillingAttachment: (id) =>
    `${api.defaults.baseURL || '/api'}/admin/billing/${id}/attachment`,

  // Billing — financial summary
  getBillingSummary: () =>
    api.get('/admin/billing/summary').then((r) => r.data),

  // Billing — status history
  getBillingHistory: (id) =>
    api.get(`/admin/billing/${id}/history`).then((r) => r.data),

  // Billing — quick status patch
  patchBillingStatus: (id, status, notes) =>
    api.patch(`/admin/billing/${id}/status`, { status, notes }).then((r) => r.data),

  // Billing — email
  sendInvoiceEmail: (id) =>
    api.post(`/admin/billing/send-invoice/${id}`).then((r) => r.data),
  sendReminders: () =>
    api.post('/admin/billing/send-reminder').then((r) => r.data),
  sendStatusEmail: (id) =>
    api.post(`/admin/billing/send-status-email/${id}`).then((r) => r.data),

  // Billing — analytics
  getBillingAnalytics: () =>
    api.get('/admin/billing/analytics').then((r) => r.data),

  // Billing — batch operations
  batchUpdateStatus: (ids, status, notes) =>
    api.patch('/admin/billing/batch/status', { ids, status, notes }).then((r) => r.data),
  batchGenerateRecurring: () =>
    api.post('/admin/billing/batch/generate').then((r) => r.data),

  // Billing — config
  getBillingConfig: () =>
    api.get('/admin/billing/config').then((r) => r.data),
  updateBillingConfig: (data) =>
    api.put('/admin/billing/config', data).then((r) => r.data),

  // Billing — CSV export (downloads file via blob)
  exportBillingCsv: async (params = {}) => {
    const response = await api.get('/admin/billing/export', {
      params,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faturamento_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
  // Admin only — migration licenses
  listMigrationLicenses: (status) =>
    api.get('/admin/migration-licenses', { params: status ? { status } : {} }).then((r) => r.data),
  reviewMigrationLicense: (id, action, admin_notes) =>
    api.put(`/admin/migration-licenses/${id}`, { action, admin_notes }).then((r) => r.data),
};

export default adminService;
