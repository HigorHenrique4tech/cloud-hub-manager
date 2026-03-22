import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import costService from '../services/costService';
import alertService from '../services/alertService';
import { useCurrency } from './useCurrency';

const fmt = (d) => d.toISOString().slice(0, 10);
const today = new Date();

/**
 * Normalize an amount from its source currency to the target display currency.
 * If source == target, no conversion. Otherwise multiply/divide by rate.
 */
function normalizeCost(amount, sourceCurrency, targetCurrency, rate) {
  if (!amount || sourceCurrency === targetCurrency) return amount;
  if (sourceCurrency === 'USD' && targetCurrency === 'BRL' && rate) return amount * rate;
  if (sourceCurrency === 'BRL' && targetCurrency === 'USD' && rate) return amount / rate;
  return amount; // no rate available, return as-is
}

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
  const { currency: displayCurrency, rate: exchangeRate } = useCurrency();

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
    const currencies = data.currencies || {};

    // Normalize each provider's total to the display currency
    const norm = (amount, provider) =>
      normalizeCost(amount || 0, currencies[provider] || 'USD', displayCurrency, exchangeRate);

    const awsTotal   = norm(data.aws?.total, 'aws');
    const azureTotal = norm(data.azure?.total, 'azure');
    const gcpTotal   = norm(data.gcp?.total, 'gcp');
    const total = awsTotal + azureTotal + gcpTotal;

    // Normalize combined daily timeline
    const combined = (data.combined || []).map((d) => {
      const nAws   = normalizeCost(d.aws || 0, currencies.aws || 'USD', displayCurrency, exchangeRate);
      const nAzure = normalizeCost(d.azure || 0, currencies.azure || 'USD', displayCurrency, exchangeRate);
      const nGcp   = normalizeCost(d.gcp || 0, currencies.gcp || 'USD', displayCurrency, exchangeRate);
      return { ...d, aws: nAws, azure: nAzure, gcp: nGcp, total: nAws + nAzure + nGcp };
    });

    const avgDaily = combined.length ? total / combined.length : 0;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - today.getDate();
    const hasProviders = total > 0;
    const projection = hasProviders ? avgDaily * daysLeft + total : 0;
    const topService = data.by_service?.[0];

    // Deltas vs previous period (normalize prev too)
    const prevCurrencies = prevData?.currencies || {};
    const prevNorm = (amount, provider) =>
      normalizeCost(amount || 0, prevCurrencies[provider] || 'USD', displayCurrency, exchangeRate);
    const prevTotal = prevData
      ? prevNorm(prevData.aws?.total, 'aws') + prevNorm(prevData.azure?.total, 'azure') + prevNorm(prevData.gcp?.total, 'gcp')
      : 0;
    const prevAvg = prevData?.combined?.length ? prevTotal / prevData.combined.length : 0;
    const deltaTotal = calcDelta(total, prevTotal);
    const deltaAvgDay = calcDelta(avgDaily, prevAvg);

    // Sparkline data (last 14 days of daily totals)
    const sparkline = combined.slice(-14).map((d) => d.total || 0);

    return { total, avgDaily, projection, topService, deltaTotal, deltaAvgDay, sparkline, combined };
  }, [data, prevData, displayCurrency, exchangeRate]);

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
