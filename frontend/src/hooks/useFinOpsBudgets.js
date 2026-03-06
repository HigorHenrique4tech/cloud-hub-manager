import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import finopsService from '../services/finopsService';

export function useFinOpsBudgets({ enabled = true } = {}) {
  const qc = useQueryClient();

  const budgetsQ = useQuery({
    queryKey: ['finops-budgets'],
    queryFn: finopsService.getBudgets,
    enabled,
  });

  const createBudget = useMutation({
    mutationFn: finopsService.createBudget,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-budgets'] }),
  });

  const deleteBudget = useMutation({
    mutationFn: finopsService.deleteBudget,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-budgets'] }),
  });

  const evaluateBudgets = useMutation({
    mutationFn: finopsService.evaluateBudgets,
    onSuccess: (data) => qc.setQueryData(['finops-budgets'], data),
  });

  return { budgetsQ, createBudget, deleteBudget, evaluateBudgets };
}
