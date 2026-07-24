import api, { wsUrl } from './api';

const inventoryService = {
  getInventory: (params = {}) =>
    api.get(wsUrl('/inventory'), { params }).then(r => r.data),

  exportInventory: (params = {}) =>
    api.get(wsUrl('/inventory/export'), {
      params,
      responseType: 'blob',
    }).then(r => r.data),
};

export default inventoryService;
