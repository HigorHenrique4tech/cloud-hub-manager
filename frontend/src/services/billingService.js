import api from './api';

const billingService = {
  checkout: async (slug, plan_tier, payment_method = 'PIX', tax_id = null, phone = null, installments = 1) => {
    const { data } = await api.post(`/orgs/${slug}/billing/checkout`, {
      plan_tier,
      payment_method,
      ...(tax_id && { tax_id }),
      ...(phone && { phone }),
      ...(installments > 1 && { installments }),
    });
    return data;
  },

  downgrade: async (slug, plan_tier) => {
    const { data } = await api.post(`/orgs/${slug}/billing/downgrade`, { plan_tier });
    return data;
  },

  verifyPayment: async (slug, paymentId) => {
    const { data } = await api.get(`/orgs/${slug}/billing/verify/${paymentId}`);
    return data;
  },

  getHistory: async (slug) => {
    const { data } = await api.get(`/orgs/${slug}/billing/history`);
    return data;
  },

  getUsage: async (slug) => {
    const { data } = await api.get(`/orgs/${slug}/usage`);
    return data;
  },
};

export default billingService;
