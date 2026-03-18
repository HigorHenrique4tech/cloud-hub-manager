import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import costService from '../services/costService';
import alertService from '../services/alertService';

const fmt = (d) => d.toISOString().slice(0, 10);
const today = new Date();

function calcDelta(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Detect anomaly days (> 2 standard deviations from mean).
 * Returns a Set of date strings that are outliers.
 */
function detectAnomalies(combined, providerFilter = 'all') {
  if (!combined?.length || combined.length < 5) return new Set();
  const vals = combined.map((d) =>
    providerFilter === 'all' ? (d.total || 0) : (d[providerFilter] || 0)
  );
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const stdDev = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  if (stdDev === 0) return new Set();

  const anomalies = new Set();
  combined.forEach((d, i) => {
    if (Math.abs(vals[i] - mean) > 2 * stdDev) {
      anomalies.add(d.date);
    }
  });
  return anomalies;
}

export function useCosts({ startDate, endDate, providerFilter = 'all' }) {
  const qc = useQueryClient();

  // Previous period (same duration, shifted back)
  const periodMs = new Date(endDate) - new Date(startDate);
  const prevEndDate = fmt(new Date(new Date(startDate).getTime() - 86400000));
  const prevStartDate = fmt(new Date(new Date(startDate).getTime() - periodMs - 86400000));

  // ── Queries ──────────────────────────────────────────────────────────────
  const costsQ = useQuery({
    queryKey: ['combined-costs', startDate, endDate],
    queryFn: () => costService.getCombinedCosts(startDate, endDate, 'DAILY'),
    enabled: !!startDate && !!endDate,
    retry: false,
  });

  const prevCostsQ = useQuery({
    queryKey: ['combined-costs', prevStartDate, prevEndDate],
    queryFn: () => costService.getCombinedCosts(prevStartDate, prevEndDate, 'DAILY'),
    enabled: !!startDate && !!endDate,
    retry: false,
    staleTime: 600_000,
  });

  const alertsQ = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertService.listAlerts(),
    retry: false,
  });

  const alertEventsQ = useQuery({
    queryKey: ['alert-events'],
    queryFn: () => alertService.getEvents({ unread_only: false, limit: 10 }),
    retry: false,
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const createAlert = useMutation({
    mutationFn: (d) => alertService.createAlert(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); },
  });

  const deleteAlert = useMutation({
    mutationFn: (id) => alertService.deleteAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const markEventRead = useMutation({
    mutationFn: (id) => alertService.markEventRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-events'] });
      qc.invalidateQueries({ queryKey: ['alert-events-unread'] });
    },
  });

  // ── Computed metrics ─────────────────────────────────────────────────────
  const data = costsQ.data;
  const prevData = prevCostsQ.data;

  const metrics = useMemo(() => {
    if (!data) return null;
    const total = data.total || 0;
    const combined = data.combined || [];
    const avgDaily = combined.length ? total / combined.length : 0;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - today.getDate();
    const hasProviders = (data.aws?.total || 0) + (data.azure?.total || 0) + (data.gcp?.total || 0) > 0;
    const projection = hasProviders ? avgDaily * daysLeft + total : 0;
    const topService = data.by_service?.[0];

    // Deltas vs previous period
    const prevTotal = prevData?.total || 0;
    const prevAvg = prevData?.combined?.length ? prevTotal / prevData.combined.length : 0;
    const deltaTotal = calcDelta(total, prevTotal);
    const deltaAvgDay = calcDelta(avgDaily, prevAvg);

    // Sparkline data (last 14 days of daily totals)
    const sparkline = combined.slice(-14).map((d) => d.total || 0);

    return { total, avgDaily, projection, topService, deltaTotal, deltaAvgDay, sparkline };
  }, [data, prevData]);

  // ── Anomaly detection ────────────────────────────────────────────────────
  const anomalies = useMemo(
    () => detectAnomalies(data?.combined, providerFilter),
    [data?.combined, providerFilter]
  );

  // ── Provider flags ───────────────────────────────────────────────────────
  const hasAws = !!data?.aws;
  const hasAzure = !!data?.azure;
  const hasGcp = !!data?.gcp;
  const hasAny = hasAws || hasAzure || hasGcp;

  // ── Alerts / events ──────────────────────────────────────────────────────
  const alerts = alertsQ.data || [];
  const events = alertEventsQ.data?.events || alertEventsQ.data || [];

  return {
    // Data
    data,
    prevData,
    metrics,
    anomalies,
    isLoading: costsQ.isLoading,

    // Provider flags
    hasAws, hasAzure, hasGcp, hasAny,

    // Alerts
    alerts,
    events,
    createAlert,
    deleteAlert,
    markEventRead,
  };
}
