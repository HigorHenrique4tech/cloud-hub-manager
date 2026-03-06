import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import adminService from '../services/adminService';

export function useAdminPanel({ statusFilter = '' } = {}) {
  const qc = useQueryClient();

  const leadsQ = useQuery({
    queryKey: ['admin-leads', statusFilter],
    queryFn: () => adminService.listLeads(statusFilter),
  });

  const orgsQ = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: () => adminService.listOrgs(),
  });

  const updateLeadStatus = useMutation({
    mutationFn: ({ id, status }) => adminService.updateLeadStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-leads'] }),
  });

  const setOrgPlan = useMutation({
    mutationFn: ({ slug, plan_tier }) => adminService.setOrgPlan(slug, plan_tier),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orgs'] }),
  });

  return { leadsQ, orgsQ, updateLeadStatus, setOrgPlan };
}
