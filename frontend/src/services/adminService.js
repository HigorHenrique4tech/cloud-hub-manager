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
};

export default adminService;
