import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import costService from '../services/costService';
import alertService from '../services/alertService';
import logsService from '../services/logsService';
import { useCurrency } from './useCurrency';
import { useToast } from '../contexts/ToastContext';

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
 * Detect anomaly days (> 3 standard deviations from baseline mean).
 * Uses the same 3-sigma threshold as the backend (finops/_anomalies.py)
 * to ensure chart markers and the Anomalies tab are consistent.
 * Baseline = all days except the last 2 (matches backend consecutive detection).
 */
function detectAnomalies(combined, providerFilter = 'all') {
  if (!combined?.length || combined.length < 7) return new Set();
  const vals = combined.map((d) =>
    providerFilter === 'all' ? (d.total || 0) : (d[providerFilter] || 0)
  );
  // Baseline: all except last 2 days (same as backend)
  const baseline = vals.slice(0, -2);
  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const stdDev = Math.sqrt(baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length);
  if (stdDev === 0) return new Set();

  const threshold = mean + 3 * stdDev;
  const anomalies = new Set();
  combined.forEach((d, i) => {
    if (vals[i] > threshold) {
      anomalies.add(d.date);
    }
  });
  return anomalies;
}

export function useCosts({ startDate, endDate, providerFilter = 'all' }) {
  const qc = useQueryClient();
  const { currency: displayCurrency, rate: exchangeRate } = useCurrency();
  const { toast } = useToast();

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

  const timelineEventsQ = useQuery({
    queryKey: ['cost-timeline-events', startDate, endDate],
    queryFn: () => logsService.getLogs({ startDate, endDate, limit: 200 }),
    enabled: !!startDate && !!endDate,
    staleTime: 300_000,
    retry: false,
  });

  // ── Raw data (needed by evaluateAlerts closure) ──────────────────────────
  const data = costsQ.data;
  const prevData = prevCostsQ.data;

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

  const evaluateAlerts = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const todayStr = now.toISOString().slice(0, 10);

      // data.combined may span a wider selected period (30d, 90d…).
      // Monthly alerts → filter to current month-to-date.
      // Daily alerts   → use the last day with data.
      const combined = data?.combined || [];
      const currencies = data?.currencies || {};
      const mtdEntries = combined.filter(d => d.date >= monthStart && d.date <= todayStr);
      const lastEntry  = [...combined].reverse().find(d => d.total > 0);

      // Normalize raw provider value to USD (thresholds are stored in USD)
      const toUSD = (amount, provider) => {
        const src = currencies[provider] || 'USD';
        if (src === 'USD' || !exchangeRate) return amount;
        if (src === 'BRL') return amount / exchangeRate;
        return amount;
      };

      const sumUSD = (entries, key) => entries.reduce((s, d) => s + toUSD(d[key] || 0, key), 0);
      const lastUSD = (key) => lastEntry ? toUSD(lastEntry[key] || 0, key) : 0;

      const calls = [];
      // Monthly: one call per active provider using MTD total (in USD)
      if (sumUSD(mtdEntries, 'aws')   > 0) calls.push(alertService.evaluateAlerts({ provider: 'aws',   current_value: sumUSD(mtdEntries, 'aws'),   period: 'monthly' }));
      if (sumUSD(mtdEntries, 'azure') > 0) calls.push(alertService.evaluateAlerts({ provider: 'azure', current_value: sumUSD(mtdEntries, 'azure'), period: 'monthly' }));
      if (sumUSD(mtdEntries, 'gcp')   > 0) calls.push(alertService.evaluateAlerts({ provider: 'gcp',   current_value: sumUSD(mtdEntries, 'gcp'),   period: 'monthly' }));
      // Daily: last day's values (in USD)
      if (lastUSD('aws')   > 0) calls.push(alertService.evaluateAlerts({ provider: 'aws',   current_value: lastUSD('aws'),   period: 'daily' }));
      if (lastUSD('azure') > 0) calls.push(alertService.evaluateAlerts({ provider: 'azure', current_value: lastUSD('azure'), period: 'daily' }));
      if (lastUSD('gcp')   > 0) calls.push(alertService.evaluateAlerts({ provider: 'gcp',   current_value: lastUSD('gcp'),   period: 'daily' }));

      if (calls.length === 0) return { triggered: 0 };
      const results = await Promise.allSettled(calls);
      const triggered = results
        .filter(r => r.status === 'fulfilled')
        .reduce((s, r) => s + (r.value?.triggered || 0), 0);
      return { triggered };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['alert-events'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      if (result?.triggered > 0) {
        toast.warning(`${result.triggered} alerta(s) disparado(s) com os custos atuais.`);
      } else {
        toast.success('Alertas avaliados — nenhum limite atingido.');
      }
    },
    onError: () => toast.error('Erro ao avaliar alertas. Tente novamente.'),
  });

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

    // Month-to-date projection: extract only entries from day 1 of the current
    // month onward, compute the daily run-rate based on those, and extrapolate
    // to the full month. Independent of the selected filter (30d/90d/6m/1y).
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const monthStart = `${yyyy}-${mm}-01`;
    const todayStr = today.toISOString().slice(0, 10);
    const mtdEntries = combined.filter(
      (d) => d.date >= monthStart && d.date <= todayStr,
    );
    const spentMTD = mtdEntries.reduce((s, d) => s + (d.total || 0), 0);
    const dayOfMonth = today.getDate();
    const avgDailyMTD = dayOfMonth > 0 ? spentMTD / dayOfMonth : 0;
    const projection = avgDailyMTD > 0 ? avgDailyMTD * daysInMonth : 0;
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

    return { total, avgDaily, projection, topService, deltaTotal, deltaAvgDay, sparkline, combined, awsTotal, azureTotal, gcpTotal };
  }, [data, prevData, displayCurrency, exchangeRate]);

  // ── Timeline events (activity logs grouped by date) ──────────────────────
  const costEvents = useMemo(() => {
    const logs = timelineEventsQ.data?.logs || [];
    const map = {};
    for (const log of logs) {
      const date = log.created_at?.slice(0, 10);
      if (!date) continue;
      if (!map[date]) map[date] = [];
      map[date].push(log);
    }
    return map;
  }, [timelineEventsQ.data]);

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
    evaluateAlerts,

    // Timeline event markers
    costEvents,
  };
}
