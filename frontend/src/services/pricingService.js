import api, { wsUrl } from './api';

/**
 * Maps the form object for each resource type to the EstimateRequest schema
 * expected by the backend, normalising field name differences between forms.
 */
function buildPayload(type, form) {
  if (type === 'ec2') {
    return {
      type,
      instance_type:  form.instance_type,
      image_platform: form.image_platform || 'linux',
      volumes: (form.volumes || []).map(v => ({
        volume_type:    v.volume_type    || 'gp3',
        volume_size_gb: v.volume_size_gb || 8,
      })),
    };
  }

  if (type === 'rds') {
    return {
      type,
      db_instance_class: form.db_instance_class,
      engine:            form.engine          || 'mysql',
      multi_az:          form.multi_az        || false,
      // form uses allocated_storage_gb, backend expects allocated_storage
      allocated_storage: form.allocated_storage_gb || form.allocated_storage || 20,
      storage_type:      form.storage_type    || 'gp2',
    };
  }

  if (type === 'azure-vm') {
    return {
      type,
      vm_size:         form.vm_size,
      image_publisher: form.image_publisher,
      image_offer:     form.image_offer,
      os_disk_type:    form.os_disk_type    || 'Standard_LRS',
      os_disk_size_gb: form.os_disk_size_gb || 128,
      location:        form.location        || 'eastus',
      data_disks: (form.data_disks || []).map(d => ({
        // Azure VM form uses disk_size_gb + storage_account_type
        size_gb: d.disk_size_gb || d.size_gb || 128,
        type:    d.storage_account_type || d.type || 'Standard_LRS',
      })),
    };
  }

  if (type === 'azure-sql') {
    return { type, sku_name: form.sku_name };
  }

  if (type === 'azure-app-service') {
    return { type, plan_sku: form.plan_sku };
  }

  return { type, ...form };
}

const pricingService = {
  /**
   * Request a live cost estimate from the backend.
   * Returns { monthly, hourly, items, source, region }.
   * Throws on network / pricing-unavailable errors — callers should fall back
   * to the static estimate tables in CostEstimatePanel.
   */
  getEstimate: async (type, form) => {
    const payload = buildPayload(type, form);
    const { data } = await api.post(wsUrl('/pricing/estimate'), payload);
    return data;
  },
};

export default pricingService;
