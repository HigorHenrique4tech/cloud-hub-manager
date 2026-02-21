import api, { wsUrl } from './api';

const dashboardConfigService = {
  getConfig: () => api.get(wsUrl('/dashboard-config')).then((r) => r.data),
  saveConfig: (widgets) =>
    api.put(wsUrl('/dashboard-config'), { widgets }).then((r) => r.data),
};

export default dashboardConfigService;
