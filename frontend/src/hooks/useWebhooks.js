import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import webhookService from '../services/webhookService';

export function useWebhooks() {
  const qc = useQueryClient();

  const webhooksQ = useQuery({
    queryKey: ['webhooks'],
    queryFn: webhookService.list,
  });

  const createWebhook = useMutation({
    mutationFn: webhookService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const updateWebhook = useMutation({
    mutationFn: ({ id, payload }) => webhookService.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const deleteWebhook = useMutation({
    mutationFn: webhookService.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const testWebhook = useMutation({
    mutationFn: webhookService.test,
  });

  const regenerateSecret = useMutation({
    mutationFn: webhookService.regenerateSecret,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  return {
    webhooksQ,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
    regenerateSecret,
  };
}
