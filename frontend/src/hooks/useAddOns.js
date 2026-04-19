import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const addOnService = {
  getAddOns: async (orgSlug) => {
    const { data } = await api.get(`/orgs/${orgSlug}/addons`);
    return data;
  },

  addWorkspace: async (orgSlug, quantity) => {
    const { data } = await api.post(`/orgs/${orgSlug}/addons/workspace`, { quantity }, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    return data;
  },

  addUser: async (orgSlug, quantity) => {
    const { data } = await api.post(`/orgs/${orgSlug}/addons/user`, { quantity }, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    return data;
  },

  removeAddOn: async (orgSlug, addOnId) => {
    const { data } = await api.delete(`/orgs/${orgSlug}/addons/${addOnId}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    return data;
  },
};

export const useAddOns = (orgSlug) => {
  const queryClient = useQueryClient();

  const addOnsQuery = useQuery({
    queryKey: ['addons', orgSlug],
    queryFn: () => addOnService.getAddOns(orgSlug),
    enabled: !!orgSlug,
  });

  const addWorkspaceMutation = useMutation({
    mutationFn: (quantity) => addOnService.addWorkspace(orgSlug, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries(['addons', orgSlug]);
      queryClient.invalidateQueries(['org', orgSlug]);
    },
  });

  const addUserMutation = useMutation({
    mutationFn: (quantity) => addOnService.addUser(orgSlug, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries(['addons', orgSlug]);
      queryClient.invalidateQueries(['org', orgSlug]);
    },
  });

  const removeAddOnMutation = useMutation({
    mutationFn: (addOnId) => addOnService.removeAddOn(orgSlug, addOnId),
    onSuccess: () => {
      queryClient.invalidateQueries(['addons', orgSlug]);
      queryClient.invalidateQueries(['org', orgSlug]);
    },
  });

  return {
    addOns: addOnsQuery.data?.addons || [],
    isLoadingAddOns: addOnsQuery.isLoading,
    addWorkspace: addWorkspaceMutation.mutate,
    addWorkspaceLoading: addWorkspaceMutation.isPending,
    addUser: addUserMutation.mutate,
    addUserLoading: addUserMutation.isPending,
    removeAddOn: removeAddOnMutation.mutate,
    removeAddOnLoading: removeAddOnMutation.isPending,
  };
};
