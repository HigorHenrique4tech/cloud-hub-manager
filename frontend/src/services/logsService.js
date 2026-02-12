import api from './api';

export const logsService = {
  getLogs: async ({ limit = 50, offset = 0, action = '', provider = '', startDate = '', endDate = '' } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', limit);
    params.set('offset', offset);
    if (action)    params.set('action', action);
    if (provider)  params.set('provider', provider);
    if (startDate) params.set('start_date', startDate);
    if (endDate)   params.set('end_date', endDate);
    return (await api.get(`/logs?${params.toString()}`)).data;
  },
};

export default logsService;
