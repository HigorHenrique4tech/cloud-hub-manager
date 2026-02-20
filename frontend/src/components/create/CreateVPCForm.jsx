import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import FieldError from '../common/FieldError';
import awsService from '../../services/awsservices';
import useFormValidation from '../../hooks/useFormValidation';

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

const CIDR_PATTERN = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

const defaultSubnet = () => ({ cidr_block: '', availability_zone: '', name: '', is_public: false });

const RULES = {
  name: [{ required: true, message: 'Nome da VPC é obrigatório' }],
  cidr_block: [
    { required: true, message: 'CIDR block é obrigatório' },
    { pattern: CIDR_PATTERN, message: 'Formato inválido. Use o formato: 10.0.0.0/16' },
  ],
};

const CreateVPCForm = forwardRef(function CreateVPCForm({ form, setForm }, ref) {
  const [azs, setAzs] = useState([]);
  const { errors, touched, touch, touchAll, isValid } = useFormValidation(form, RULES);
  useImperativeHandle(ref, () => ({ touchAll, isValid }));

  useEffect(() => {
    awsService.listAvailabilityZones().then((d) => d?.availability_zones && setAzs(d.availability_zones)).catch(() => {});
  }, []);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  const addSubnet = () => setForm((p) => ({ ...p, subnets: [...(p.subnets || []), defaultSubnet()] }));
  const removeSubnet = (i) => setForm((p) => ({ ...p, subnets: p.subnets.filter((_, idx) => idx !== i) }));
  const updateSubnet = (i, field, val) =>
    setForm((p) => ({ ...p, subnets: p.subnets.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }));

  return (
    <>
      <FormSection title="Configuração da VPC">
        <div>
          <label className={labelCls}>Nome <span className="text-red-500">*</span></label>
          <input
            className={`${inputCls} ${touched.name && errors.name ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.name || ''}
            onChange={(e) => set('name', e.target.value)}
            onBlur={() => touch('name')}
            placeholder="minha-vpc"
          />
          <FieldError message={touched.name ? errors.name : null} />
        </div>
        <div>
          <label className={labelCls}>CIDR Block <span className="text-red-500">*</span></label>
          <input
            className={`${inputCls} ${touched.cidr_block && errors.cidr_block ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.cidr_block || '10.0.0.0/16'}
            onChange={(e) => set('cidr_block', e.target.value)}
            onBlur={() => touch('cidr_block')}
            placeholder="10.0.0.0/16"
          />
          <FieldError message={touched.cidr_block ? errors.cidr_block : null} />
        </div>
        <div>
          <label className={labelCls}>Tenancy</label>
          <select className={inputCls} value={form.tenancy || 'default'} onChange={(e) => set('tenancy', e.target.value)}>
            <option value="default">Default</option>
            <option value="dedicated">Dedicated</option>
          </select>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className={toggleCls}
              checked={form.enable_dns_support !== false}
              onChange={(e) => set('enable_dns_support', e.target.checked)} />
            <span className="text-gray-700 dark:text-gray-300">DNS Support</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className={toggleCls}
              checked={form.enable_dns_hostnames !== false}
              onChange={(e) => set('enable_dns_hostnames', e.target.checked)} />
            <span className="text-gray-700 dark:text-gray-300">DNS Hostnames</span>
          </label>
        </div>
      </FormSection>

      <FormSection title="Subnets" description="Subnets iniciais criadas com a VPC">
        <div className="space-y-4">
          {(form.subnets || []).map((subnet, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Subnet {i + 1}</span>
                <button type="button" onClick={() => removeSubnet(i)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nome</label>
                  <input className={inputCls} value={subnet.name} onChange={(e) => updateSubnet(i, 'name', e.target.value)} placeholder="subnet-publica-1" />
                </div>
                <div>
                  <label className={labelCls}>CIDR</label>
                  <input className={inputCls} value={subnet.cidr_block} onChange={(e) => updateSubnet(i, 'cidr_block', e.target.value)} placeholder="10.0.1.0/24" />
                </div>
                <div>
                  <label className={labelCls}>Availability Zone</label>
                  <select className={inputCls} value={subnet.availability_zone} onChange={(e) => updateSubnet(i, 'availability_zone', e.target.value)}>
                    <option value="">Automático</option>
                    {azs.map((az) => <option key={az.zone_name} value={az.zone_name}>{az.zone_name}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className={toggleCls} checked={subnet.is_public} onChange={(e) => updateSubnet(i, 'is_public', e.target.checked)} />
                    <span className="text-gray-700 dark:text-gray-300">Pública</span>
                  </label>
                </div>
              </div>
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
});

export default CreateVPCForm;
