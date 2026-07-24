import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import FieldError from '../common/FieldError';
import azureService from '../../services/azureservices';
import { AZURE_LOCATIONS } from '../../data/azureConstants';
import useFormValidation from '../../hooks/useFormValidation';

const SKUS = [
  { value: 'Standard_LRS',   label: 'Standard_LRS — LRS (redundância local, mais barato)' },
  { value: 'Standard_GRS',   label: 'Standard_GRS — GRS (redundância geográfica)' },
  { value: 'Standard_RAGRS', label: 'Standard_RAGRS — RA-GRS (geo com leitura)' },
  { value: 'Standard_ZRS',   label: 'Standard_ZRS — ZRS (redundância de zona)' },
  { value: 'Premium_LRS',    label: 'Premium_LRS — Premium LRS (SSD, blobs de bloco)' },
  { value: 'Premium_ZRS',    label: 'Premium_ZRS — Premium ZRS (SSD + zona)' },
];
const KINDS = [
  { value: 'StorageV2',        label: 'StorageV2 — Uso geral v2 (recomendado)' },
  { value: 'BlobStorage',      label: 'BlobStorage — Somente blobs' },
  { value: 'BlockBlobStorage', label: 'BlockBlobStorage — Blobs de bloco Premium' },
  { value: 'FileStorage',      label: 'FileStorage — Azure Files Premium' },
  { value: 'Storage',          label: 'Storage — Uso geral v1 (legado)' },
];
const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

const RULES = {
  name: [
    { required: true, message: 'Nome da Storage Account é obrigatório' },
    { minLength: 3, message: 'Mínimo 3 caracteres' },
    { maxLength: 24, message: 'Máximo 24 caracteres' },
    { pattern: /^[a-z0-9]+$/, message: 'Apenas letras minúsculas e números' },
  ],
  resource_group: [{ required: true, message: 'Resource Group é obrigatório' }],
  location: [{ required: true, message: 'Localização é obrigatória' }],
};

const CreateAzureStorageForm = forwardRef(function CreateAzureStorageForm({ form, setForm }, ref) {
  const [apiLocations, setApiLocations] = useState([]);
  const [resourceGroups, setResourceGroups] = useState([]);
  const { errors, touched, touch, touchAll, isValid } = useFormValidation(form, RULES);
  useImperativeHandle(ref, () => ({ touchAll, isValid }));

  const locations = apiLocations.length > 0 ? apiLocations : AZURE_LOCATIONS;

  useEffect(() => {
    azureService.listLocations().then((d) => d?.locations?.length && setApiLocations(d.locations)).catch(() => {});
    azureService.listResourceGroups().then((d) => d?.resource_groups?.length && setResourceGroups(d.resource_groups)).catch(() => {});
  }, []);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  return (
    <>
      <FormSection title="Identificação" description="Nome e localização da Storage Account">
        <div>
          <label className={labelCls}>Nome <span className="text-red-500">*</span></label>
          <input
            className={`${inputCls} ${touched.name && errors.name ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.name || ''}
            onChange={(e) => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
            onBlur={() => touch('name')}
            placeholder="meuarmazenamento"
            maxLength={24}
          />
          <FieldError message={touched.name ? errors.name : null} />
          {!(touched.name && errors.name) && (
            <p className="text-xs text-gray-400 mt-1">3–24 caracteres, somente letras minúsculas e números.</p>
          )}
        </div>
        <div>
          <label className={labelCls}>Resource Group <span className="text-red-500">*</span></label>
          {resourceGroups.length > 0 ? (
            <select
              className={`${inputCls} ${touched.resource_group && errors.resource_group ? 'border-red-500 dark:border-red-500' : ''}`}
              value={form.resource_group || ''}
              onChange={(e) => set('resource_group', e.target.value)}
              onBlur={() => touch('resource_group')}
            >
              <option value="">Selecione...</option>
              {resourceGroups.map((rg) => <option key={rg.name} value={rg.name}>{rg.name}</option>)}
            </select>
          ) : (
            <input
              className={`${inputCls} ${touched.resource_group && errors.resource_group ? 'border-red-500 dark:border-red-500' : ''}`}
              value={form.resource_group || ''}
              onChange={(e) => set('resource_group', e.target.value)}
              onBlur={() => touch('resource_group')}
              placeholder="meu-resource-group"
            />
          )}
          <FieldError message={touched.resource_group ? errors.resource_group : null} />
        </div>
        <div>
          <label className={labelCls}>Localização <span className="text-red-500">*</span></label>
          <select
            className={`${inputCls} ${touched.location && errors.location ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.location || ''}
            onChange={(e) => set('location', e.target.value)}
            onBlur={() => touch('location')}
          >
            <option value="">Selecione...</option>
            {locations.map((l) => <option key={l.name} value={l.name}>{l.display_name || l.name}</option>)}
          </select>
          <FieldError message={touched.location ? errors.location : null} />
        </div>
      </FormSection>

      <FormSection title="Tipo e Performance">
        <div>
          <label className={labelCls}>SKU</label>
          <select className={inputCls} value={form.sku || 'Standard_LRS'} onChange={(e) => set('sku', e.target.value)}>
            {SKUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Kind</label>
          <select className={inputCls} value={form.kind || 'StorageV2'} onChange={(e) => set('kind', e.target.value)}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Access Tier</label>
          <div className="flex gap-4">
            {['Hot', 'Cool'].map((tier) => (
              <label key={tier} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" className={toggleCls} checked={(form.access_tier || 'Hot') === tier} onChange={() => set('access_tier', tier)} />
                <span className="text-gray-700 dark:text-gray-300">{tier}</span>
              </label>
            ))}
          </div>
        </div>
      </FormSection>

      <FormSection title="Segurança">
        {[
          ['enable_https_only', 'Somente HTTPS'],
          ['allow_blob_public_access', 'Permitir Acesso Público ao Blob'],
        ].map(([field, label]) => (
          <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className={toggleCls}
              checked={form[field] !== undefined ? form[field] : (field === 'enable_https_only' ? true : false)}
              onChange={(e) => set(field, e.target.checked)} />
            <span className="text-gray-700 dark:text-gray-300">{label}</span>
          </label>
        ))}
        <div>
          <label className={labelCls}>Versão Mínima TLS</label>
          <select className={inputCls} value={form.min_tls_version || 'TLS1_2'} onChange={(e) => set('min_tls_version', e.target.value)}>
            <option value="TLS1_0">TLS 1.0</option>
            <option value="TLS1_1">TLS 1.1</option>
            <option value="TLS1_2">TLS 1.2 (Recomendado)</option>
          </select>
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

export default CreateAzureStorageForm;
