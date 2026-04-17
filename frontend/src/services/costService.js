import api, { wsUrl } from './api';

// Merge provider cost results into a combined summary
function _mergeCosts(awsResult, azureResult, gcpResult) {
  const aws   = awsResult.status   === 'fulfilled' ? awsResult.value.data   : null;
  const azure = azureResult.status === 'fulfilled' ? azureResult.value.data : null;
  const gcp   = gcpResult.status   === 'fulfilled' ? gcpResult.value.data   : null;
  return {
    aws,
    azure,
    gcp,
    currencies: {
      aws:   aws?.currency   || 'USD',
      azure: azure?.currency || 'USD',
      gcp:   gcp?.currency   || 'USD',
    },
    total: +((aws?.total || 0) + (azure?.total || 0) + (gcp?.total || 0)).toFixed(4),
    aws_total:   +(aws?.total   || 0).toFixed(4),
    azure_total: +(azure?.total || 0).toFixed(4),
    gcp_total:   +(gcp?.total   || 0).toFixed(4),
  };
}

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

    // Include native currency per provider so the frontend knows how to format
    const currencies = {
      aws:   aws?.currency   || 'USD',
      azure: azure?.currency || 'USD',
      gcp:   gcp?.currency   || 'USD',
    };

    return {
      aws,
      azure,
      gcp,
      combined,
      by_service,
      currencies,
      total: +((aws?.total || 0) + (azure?.total || 0) + (gcp?.total || 0)).toFixed(4),
    };
  },

  /**
   * Drill-down: get cost breakdown by resource for a specific service.
   * @param {'aws'|'azure'|'gcp'} provider  The cloud provider
   * @param {string} service  The service name (without provider prefix, e.g. "Amazon EC2")
   * @param {string} startDate  YYYY-MM-DD
   * @param {string} endDate    YYYY-MM-DD
   * @returns {{ success, service, total, resources: [{id,name,amount,type?,region?}], daily: [{date,total}] }}
   */
  getServiceResources: async (provider, service, startDate, endDate) => {
    const endpoints = { aws: '/aws/costs/resources', azure: '/azure/costs/resources', gcp: '/gcp/costs/resources' };
    const endpoint = wsUrl(endpoints[provider]);
    const params = { service, start_date: startDate, end_date: endDate };
    const response = await api.get(endpoint, { params });
    return response.data;
  },

  // ── Cost Allocation by Tag ────────────────────────────────────────────────

  getCostsByTag: async (tagKey, startDate, endDate, providers = 'all') => {
    const params = { tag_key: tagKey, start_date: startDate, end_date: endDate, providers };
    return (await api.get(wsUrl('/finops/costs/by-tag'), { params })).data;
  },

  listAllocationTags: async () =>
    (await api.get(wsUrl('/finops/costs/allocation-tags'))).data,

  activateAllocationTags: async (provider, accountId, tagKeys) =>
    (await api.post(wsUrl('/finops/costs/allocation-tags/activate'), {
      provider, account_id: accountId, tag_keys: tagKeys,
    })).data,

  /**
   * Fetch combined costs for a specific workspace (explicit org + workspace IDs).
   * Used for cross-workspace cost comparison in the org settings page.
   */
  getCombinedCostsForWorkspace: async (orgSlug, wsId, startDate, endDate) => {
    const params = { start_date: startDate, end_date: endDate, granularity: 'DAILY' };
    const base = `/orgs/${orgSlug}/workspaces/${wsId}`;
    const [awsResult, azureResult, gcpResult] = await Promise.allSettled([
      api.get(`${base}/aws/costs`, { params }),
      api.get(`${base}/azure/costs`, { params }),
      api.get(`${base}/gcp/costs`, { params }),
    ]);
    return _mergeCosts(awsResult, azureResult, gcpResult);
  },
};

export default costService;
