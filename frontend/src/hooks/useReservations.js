import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import finopsService from '../services/finopsService';

export function useReservations({ startDate, endDate } = {}) {
  const qc = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);
  const mtdStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);
  const sd = startDate || mtdStart;
  const ed = endDate || today;

  const coverageQ = useQuery({
    queryKey: ['ri-coverage', sd, ed],
    queryFn: () => finopsService.getReservationCoverage(sd, ed),
    retry: false,
    staleTime: 600_000,
  });

  const utilizationQ = useQuery({
    queryKey: ['ri-utilization', sd, ed],
    queryFn: () => finopsService.getReservationUtilization(sd, ed),
    retry: false,
    staleTime: 600_000,
  });

  const recommendationsQ = useQuery({
    queryKey: ['ri-recommendations'],
    queryFn: () => finopsService.listReservationRecommendations(),
    retry: false,
    staleTime: 300_000,
  });

  const generateRecs = useMutation({
    mutationFn: () => finopsService.generateReservationRecommendations(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ri-recommendations'] }),
  });

  return {
    coverage: coverageQ.data?.coverage || [],
    utilization: utilizationQ.data?.utilization || [],
    recommendations: recommendationsQ.data || [],
    isLoadingCoverage: coverageQ.isLoading,
    isLoadingUtilization: utilizationQ.isLoading,
    isLoadingRecs: recommendationsQ.isLoading,
    generateRecs,
  };
}
