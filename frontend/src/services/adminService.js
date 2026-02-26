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
};

export default adminService;
