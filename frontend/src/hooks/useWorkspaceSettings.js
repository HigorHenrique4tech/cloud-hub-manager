import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import orgService from '../services/orgService';

export function useWorkspaceSettings({ slug, wsId } = {}) {
  const qc = useQueryClient();

  const membersQ = useQuery({
    queryKey: ['ws-members', slug, wsId],
    queryFn: () => orgService.listWorkspaceMembers(slug, wsId),
    enabled: !!slug && !!wsId,
  });

  const accountsQ = useQuery({
    queryKey: ['cloud-accounts', slug, wsId],
    queryFn: () => orgService.listAccounts(slug, wsId),
    enabled: !!slug && !!wsId,
  });

  const overrideMember = useMutation({
    mutationFn: ({ userId, role }) => orgService.overrideMemberRole(slug, wsId, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ws-members', slug, wsId] }),
  });

  const addAccount = useMutation({
    mutationFn: (payload) => orgService.addAccount(slug, wsId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cloud-accounts', slug, wsId] }),
  });

  const deleteAccount = useMutation({
    mutationFn: (accountId) => orgService.deleteAccount(slug, wsId, accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cloud-accounts', slug, wsId] }),
  });

  const testAccount = useMutation({
    mutationFn: (accountId) => orgService.testAccount(slug, wsId, accountId),
  });

  return { membersQ, accountsQ, overrideMember, addAccount, deleteAccount, testAccount };
}
