import api, { wsUrl } from './api';

export const costService = {
  /**
   * Get cost data for a specific provider.
   * @param {'aws'|'azure'|'gcp'} provider
   * @param {string} startDate  YYYY-MM-DD
   * @param {string} endDate    YYYY-MM-DD
   * @param {string} granularity  'DAILY' | 'MONTHLY'
   */
  getCosts: async (provider, startDate, endDate, granularity = 'DAILY') => {
    let endpoint;
    if (provider === 'aws') endpoint = wsUrl('/aws/costs');
    else if (provider === 'azure') endpoint = wsUrl('/azure/costs');
    else endpoint = wsUrl('/gcp/costs');
    const params = { start_date: startDate, end_date: endDate, granularity };
    const response = await api.get(endpoint, { params });
    return response.data;
  },

  /**
   * Fetch costs from all providers and merge into a combined dataset.
   * Returns null for a provider if the call fails (no credentials).
   */
  getCombinedCosts: async (startDate, endDate, granularity = 'DAILY') => {
    const params = { start_date: startDate, end_date: endDate, granularity };
    const [awsResult, azureResult, gcpResult] = await Promise.allSettled([
      api.get(wsUrl('/aws/costs'), { params }),
      api.get(wsUrl('/azure/costs'), { params }),
      api.get(wsUrl('/gcp/costs'), { params }),
    ]);

    const aws   = awsResult.status   === 'fulfilled' ? awsResult.value.data   : null;
    const azure = azureResult.status === 'fulfilled' ? azureResult.value.data : null;
    const gcp   = gcpResult.status   === 'fulfilled' ? gcpResult.value.data   : null;

    // Build combined daily timeline
    const dailyMap = {};
    if (aws?.daily) {
      for (const d of aws.daily) {
        if (!dailyMap[d.date]) dailyMap[d.date] = { date: d.date, aws: 0, azure: 0, gcp: 0 };
        dailyMap[d.date].aws = d.total;
      }
    }
    if (azure?.daily) {
      for (const d of azure.daily) {
        if (!dailyMap[d.date]) dailyMap[d.date] = { date: d.date, aws: 0, azure: 0, gcp: 0 };
        dailyMap[d.date].azure = d.total;
      }
    }
    if (gcp?.daily) {
      for (const d of gcp.daily) {
        if (!dailyMap[d.date]) dailyMap[d.date] = { date: d.date, aws: 0, azure: 0, gcp: 0 };
        dailyMap[d.date].gcp = d.total;
      }
    }
    const combined = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, total: +(d.aws + d.azure + d.gcp).toFixed(4) }));

    // Merge by_service
    const svcMap = {};
    if (aws?.by_service) {
      for (const s of aws.by_service) {
        svcMap[`AWS / ${s.name}`] = (svcMap[`AWS / ${s.name}`] || 0) + s.amount;
      }
    }
    if (azure?.by_service) {
      for (const s of azure.by_service) {
        svcMap[`Azure / ${s.name}`] = (svcMap[`Azure / ${s.name}`] || 0) + s.amount;
      }
    }
    if (gcp?.by_service) {
      for (const s of gcp.by_service) {
        svcMap[`GCP / ${s.name}`] = (svcMap[`GCP / ${s.name}`] || 0) + s.amount;
      }
    }
    const by_service = Object.entries(svcMap)
      .map(([name, amount]) => ({ name, amount: +amount.toFixed(4) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return {
      aws,
      azure,
      gcp,
      combined,
      by_service,
      total: +((aws?.total || 0) + (azure?.total || 0) + (gcp?.total || 0)).toFixed(4),
    };
  },
};

export default costService;
