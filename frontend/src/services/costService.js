import api from './api';

export const costService = {
  /**
   * Get cost data for a specific provider.
   * @param {'aws'|'azure'} provider
   * @param {string} startDate  YYYY-MM-DD
   * @param {string} endDate    YYYY-MM-DD
   * @param {string} granularity  'DAILY' | 'MONTHLY'
   */
  getCosts: async (provider, startDate, endDate, granularity = 'DAILY') => {
    const endpoint = provider === 'aws' ? '/aws/costs' : '/azure/costs';
    const params = { start_date: startDate, end_date: endDate, granularity };
    const response = await api.get(endpoint, { params });
    return response.data;
  },

  /**
   * Fetch costs from both providers and merge into a combined dataset.
   * Returns null for a provider if the call fails (no credentials).
   */
  getCombinedCosts: async (startDate, endDate, granularity = 'DAILY') => {
    const [awsResult, azureResult] = await Promise.allSettled([
      api.get('/aws/costs', { params: { start_date: startDate, end_date: endDate, granularity } }),
      api.get('/azure/costs', { params: { start_date: startDate, end_date: endDate, granularity } }),
    ]);

    const aws = awsResult.status === 'fulfilled' ? awsResult.value.data : null;
    const azure = azureResult.status === 'fulfilled' ? azureResult.value.data : null;

    // Build combined daily timeline
    const dailyMap = {};
    if (aws?.daily) {
      for (const d of aws.daily) {
        if (!dailyMap[d.date]) dailyMap[d.date] = { date: d.date, aws: 0, azure: 0 };
        dailyMap[d.date].aws = d.total;
      }
    }
    if (azure?.daily) {
      for (const d of azure.daily) {
        if (!dailyMap[d.date]) dailyMap[d.date] = { date: d.date, aws: 0, azure: 0 };
        dailyMap[d.date].azure = d.total;
      }
    }
    const combined = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, total: +(d.aws + d.azure).toFixed(4) }));

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
    const by_service = Object.entries(svcMap)
      .map(([name, amount]) => ({ name, amount: +amount.toFixed(4) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return {
      aws,
      azure,
      combined,
      by_service,
      total: +((aws?.total || 0) + (azure?.total || 0)).toFixed(4),
    };
  },
};

export default costService;
