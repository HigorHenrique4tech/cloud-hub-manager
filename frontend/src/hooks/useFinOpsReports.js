import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import finopsService from '../services/finopsService';

export function useFinOpsReports({ enabled = true } = {}) {
  const qc = useQueryClient();

  const reportScheduleQ = useQuery({
    queryKey: ['finops-report-schedule'],
    queryFn: finopsService.getReportSchedule,
    retry: false,
    enabled,
  });

  const upsertReportSchedule = useMutation({
    mutationFn: finopsService.upsertReportSchedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-report-schedule'] }),
  });

  const deleteReportSchedule = useMutation({
    mutationFn: finopsService.deleteReportSchedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-report-schedule'] }),
  });

  return { reportScheduleQ, upsertReportSchedule, deleteReportSchedule };
}
