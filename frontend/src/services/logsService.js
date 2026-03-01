import api, { wsUrl } from './api';

export const logsService = {
  getLogs: async ({ limit = 50, offset = 0, action = '', provider = '', startDate = '', endDate = '', userEmail = '' } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', limit);
    params.set('offset', offset);
    if (action)     params.set('action', action);
    if (provider)   params.set('provider', provider);
    if (startDate)  params.set('start_date', startDate);
    if (endDate)    params.set('end_date', endDate);
    if (userEmail)  params.set('user_email', userEmail);
    return (await api.get(`${wsUrl('/logs')}?${params.toString()}`)).data;
  },

  exportLogs: async ({ action = '', provider = '', startDate = '', endDate = '', userEmail = '' } = {}) => {
    const params = new URLSearchParams();
    if (action)    params.set('action', action);
    if (provider)  params.set('provider', provider);
    if (startDate) params.set('start_date', startDate);
    if (endDate)   params.set('end_date', endDate);
    if (userEmail) params.set('user_email', userEmail);

    const resp = await api.get(`${wsUrl('/logs/export')}?${params.toString()}`, { responseType: 'blob' });
    const url = URL.createObjectURL(resp.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

export default logsService;
