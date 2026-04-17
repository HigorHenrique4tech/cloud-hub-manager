import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import costService from '../services/costService';

export function useCostAllocation({ tagKey, startDate, endDate, providers = 'all', enabled = true }) {
  const qc = useQueryClient();

  const byTagQ = useQuery({
    queryKey: ['cost-by-tag', tagKey, startDate, endDate, providers],
    queryFn: () => costService.getCostsByTag(tagKey, startDate, endDate, providers),
    enabled: !!tagKey && !!startDate && !!endDate && enabled,
    retry: false,
  });

  const tagsQ = useQuery({
    queryKey: ['allocation-tags'],
    queryFn: () => costService.listAllocationTags(),
    retry: false,
    staleTime: 300_000,
  });

  const activateTags = useMutation({
    mutationFn: ({ provider, accountId, tagKeys }) =>
      costService.activateAllocationTags(provider, accountId, tagKeys),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['allocation-tags'] }),
  });

  // Collect all available tag keys across providers
  const availableTagKeys = [...new Set(
    (tagsQ.data || []).flatMap((a) => a.available_tags || [])
  )].sort();

  return {
    breakdown: byTagQ.data?.breakdown || [],
    grandTotal: byTagQ.data?.grand_total || 0,
    isLoading: byTagQ.isLoading,
    error: byTagQ.error,
    availableTagKeys,
    accountTags: tagsQ.data || [],
    activateTags,
  };
}
