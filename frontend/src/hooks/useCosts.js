import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import costService from '../services/costService';
import alertService from '../services/alertService';

const fmt = (d) => d.toISOString().slice(0, 10);

export function useCosts({ startDate, endDate }) {
  const qc = useQueryClient();

  const costsQ = useQuery({
    queryKey: ['combined-costs', startDate, endDate],
    queryFn: () => costService.getCombinedCosts(startDate, endDate, 'DAILY'),
    enabled: !!startDate && !!endDate,
  });

  const alertsQ = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertService.listAlerts(),
  });

  const alertEventsQ = useQuery({
    queryKey: ['alert-events'],
    queryFn: () => alertService.getEvents({ unread_only: false, limit: 10 }),
  });

  const createAlert = useMutation({
    mutationFn: alertService.createAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const deleteAlert = useMutation({
    mutationFn: alertService.deleteAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const markEventRead = useMutation({
    mutationFn: alertService.markEventRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-events'] }),
  });

  const metrics = useMemo(() => {
    const data = costsQ.data;
    if (!data) return null;
    const daily = data.daily || [];
    const total = daily.reduce((s, d) => s + (d.total ?? 0), 0);
    const days  = daily.length || 1;
    const avgDaily = total / days;
    const projection = avgDaily * 30;
    const serviceMap = {};
    daily.forEach((d) => {
      Object.entries(d.services || {}).forEach(([svc, v]) => {
        serviceMap[svc] = (serviceMap[svc] || 0) + v;
      });
    });
    const topService = Object.entries(serviceMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    return { total, avgDaily, projection, topService };
  }, [costsQ.data]);

  const exportCSV = () => {
    const daily = costsQ.data?.daily ?? [];
    const rows = daily.map((d) =>
      [d.date, d.aws ?? 0, d.azure ?? 0, d.gcp ?? 0, d.total ?? 0].join(',')
    );
    const csv = ['date,aws,azure,gcp,total', ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `custos_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    costsQ,
    alertsQ,
    alertEventsQ,
    createAlert,
    deleteAlert,
    markEventRead,
    metrics,
    exportCSV,
  };
}
