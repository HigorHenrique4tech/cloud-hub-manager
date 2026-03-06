import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import finopsService from '../services/finopsService';

export function useFinOpsScans({ enabled = true } = {}) {
  const qc = useQueryClient();

  const scanScheduleQ = useQuery({
    queryKey: ['finops-scan-schedule'],
    queryFn: finopsService.getScanSchedule,
    retry: false,
    enabled,
  });

  const upsertScanSchedule = useMutation({
    mutationFn: finopsService.upsertScanSchedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-scan-schedule'] }),
  });

  const deleteScanSchedule = useMutation({
    mutationFn: finopsService.deleteScanSchedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-scan-schedule'] }),
  });

  return { scanScheduleQ, upsertScanSchedule, deleteScanSchedule };
}
