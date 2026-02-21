import api, { wsUrl } from './api';

const scheduleService = {
  getSchedules: async ({ provider, is_enabled } = {}) => {
    const params = {};
    if (provider !== undefined)    params.provider   = provider;
    if (is_enabled !== undefined)  params.is_enabled = is_enabled;
    const { data } = await api.get(wsUrl('/schedules'), { params });
    return data;
  },

  createSchedule: async (payload) => {
    const { data } = await api.post(wsUrl('/schedules'), payload);
    return data;
  },

  updateSchedule: async (id, payload) => {
    const { data } = await api.patch(wsUrl(`/schedules/${id}`), payload);
    return data;
  },

  deleteSchedule: async (id) => {
    await api.delete(wsUrl(`/schedules/${id}`));
  },
};

export default scheduleService;
