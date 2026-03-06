import api, { wsUrl } from './api';

const reportService = {
  getSettings: () =>
    api.get(wsUrl('/executive-reports/settings')).then(r => r.data),

  saveSettings: (payload) =>
    api.put(wsUrl('/executive-reports/settings'), payload).then(r => r.data),

  list: () =>
    api.get(wsUrl('/executive-reports')).then(r => r.data),

  generate: (period = null) =>
    api.post(wsUrl('/executive-reports/generate'), { period }).then(r => r.data),

  downloadPdf: async (id, period) => {
    const resp = await api.get(wsUrl(`/executive-reports/${id}/pdf`), { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-executivo-${period}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },

  send: (id) =>
    api.post(wsUrl(`/executive-reports/${id}/send`)).then(r => r.data),
};

export default reportService;
