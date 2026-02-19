import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import azureService from '../../services/azureservices';
import { AZURE_LOCATIONS } from '../../data/azureConstants';

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

export default function CreateAzureVNetForm({ form, setForm }) {
  const [apiLocations, setApiLocations] = useState([]);
  const [resourceGroups, setResourceGroups] = useState([]);

  const locations = apiLocations.length > 0 ? apiLocations : AZURE_LOCATIONS;

  useEffect(() => {
    azureService.listLocations().then((d) => d?.locations?.length && setApiLocations(d.locations)).catch(() => {});
    azureService.listResourceGroups().then((d) => d?.resource_groups && setResourceGroups(d.resource_groups)).catch(() => {});
  }, []);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  const addPrefix = () => setForm((p) => ({ ...p, address_prefixes: [...(p.address_prefixes || ['10.0.0.0/16']), ''] }));
  const removePrefix = (i) => setForm((p) => ({ ...p, address_prefixes: (p.address_prefixes || []).filter((_, idx) => idx !== i) }));
  const updatePrefix = (i, val) => setForm((p) => ({ ...p, address_prefixes: (p.address_prefixes || []).map((v, idx) => idx === i ? val : v) }));

  const addSubnet = () => setForm((p) => ({ ...p, subnets: [...(p.subnets || []), { name: '', address_prefix: '' }] }));
  const removeSubnet = (i) => setForm((p) => ({ ...p, subnets: (p.subnets || []).filter((_, idx) => idx !== i) }));
  const updateSubnet = (i, field, val) => setForm((p) => ({ ...p, subnets: (p.subnets || []).map((s, idx) => idx === i ? { ...s, [field]: val } : s) }));

  return (
    <>
      <FormSection title="Básico">
        <div>
          <label className={labelCls}>Nome <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="minha-vnet" />
        </div>
        <div>
          <label className={labelCls}>Resource Group <span className="text-red-500">*</span></label>
          {resourceGroups.length > 0 ? (
            <select className={inputCls} value={form.resource_group || ''} onChange={(e) => set('resource_group', e.target.value)}>
              <option value="">Selecione...</option>
              {resourceGroups.map((rg) => <option key={rg.name} value={rg.name}>{rg.name}</option>)}
            </select>
          ) : (
            <input className={inputCls} value={form.resource_group || ''} onChange={(e) => set('resource_group', e.target.value)} placeholder="meu-resource-group" />
          )}
        </div>
        <div>
          <label className={labelCls}>Localização <span className="text-red-500">*</span></label>
          <select className={inputCls} value={form.location || ''} onChange={(e) => set('location', e.target.value)}>
            <option value="">Selecione...</option>
            {locations.map((l) => <option key={l.name} value={l.name}>{l.display_name || l.name}</option>)}
          </select>
        </div>
      </FormSection>

      <FormSection title="Espaço de Endereços" description="CIDRs da VNet">
        <div className="space-y-2">
          {(form.address_prefixes || ['10.0.0.0/16']).map((prefix, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputCls} value={prefix} onChange={(e) => updatePrefix(i, e.target.value)} placeholder="10.0.0.0/16" />
              {(form.address_prefixes || []).length > 1 && (
                <button type="button" onClick={() => removePrefix(i)} className="p-2 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addPrefix} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-dark font-medium">
            <Plus className="w-4 h-4" /> Adicionar Prefixo
          </button>
        </div>
      </FormSection>

      <FormSection title="Subnets" description="Subnets criadas junto com a VNet">
        <div className="space-y-3">
          {(form.subnets || []).map((subnet, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputCls} value={subnet.name} onChange={(e) => updateSubnet(i, 'name', e.target.value)} placeholder="default" />
              <input className={inputCls} value={subnet.address_prefix} onChange={(e) => updateSubnet(i, 'address_prefix', e.target.value)} placeholder="10.0.1.0/24" />
              <button type="button" onClick={() => removeSubnet(i)} className="p-2 text-gray-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addSubnet} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-dark font-medium">
            <Plus className="w-4 h-4" /> Adicionar Subnet
          </button>
        </div>
      </FormSection>

      <FormSection title="Tags">
        <TagEditor tags={form.tags_list || []} onChange={(tags) => {
          const obj = {};
          tags.forEach(({ key, value }) => { if (key) obj[key] = value; });
          setForm((p) => ({ ...p, tags: obj, tags_list: tags }));
        }} />
      </FormSection>
    </>
  );
}
