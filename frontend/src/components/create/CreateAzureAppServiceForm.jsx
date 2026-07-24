import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import FieldError from '../common/FieldError';
import azureService from '../../services/azureservices';
import { AZURE_LOCATIONS } from '../../data/azureConstants';
import useFormValidation from '../../hooks/useFormValidation';

const RUNTIMES = [
  { label: 'Node.js 20 LTS', value: 'NODE|20-lts' },
  { label: 'Node.js 18 LTS', value: 'NODE|18-lts' },
  { label: 'Python 3.12', value: 'PYTHON|3.12' },
  { label: 'Python 3.11', value: 'PYTHON|3.11' },
  { label: 'Python 3.10', value: 'PYTHON|3.10' },
  { label: 'Java 21', value: 'JAVA|21-java21' },
  { label: 'Java 17', value: 'JAVA|17-java17' },
  { label: '.NET 8', value: 'DOTNETCORE|8.0' },
  { label: '.NET 6', value: 'DOTNETCORE|6.0' },
  { label: 'PHP 8.2', value: 'PHP|8.2' },
  { label: 'Ruby 3.2', value: 'RUBY|3.2' },
];

const PLAN_SKUS = [
  { value: 'F1', label: 'F1 — Free (60 min/dia)' },
  { value: 'B1', label: 'B1 — Basic (1 core, 1.75 GB)' },
  { value: 'B2', label: 'B2 — Basic (2 core, 3.5 GB)' },
  { value: 'B3', label: 'B3 — Basic (4 core, 7 GB)' },
  { value: 'S1', label: 'S1 — Standard (1 core, 1.75 GB)' },
  { value: 'S2', label: 'S2 — Standard (2 core, 3.5 GB)' },
  { value: 'S3', label: 'S3 — Standard (4 core, 7 GB)' },
  { value: 'P1v2', label: 'P1v2 — PremiumV2 (1 core, 3.5 GB)' },
  { value: 'P2v2', label: 'P2v2 — PremiumV2 (2 core, 7 GB)' },
];

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

const RULES = {
  name: [
    { required: true, message: 'Nome do App Service é obrigatório' },
    { minLength: 2, message: 'Mínimo 2 caracteres' },
    { maxLength: 60, message: 'Máximo 60 caracteres' },
    { pattern: /^[a-zA-Z0-9\-]+$/, message: 'Apenas letras, números e hífens' },
  ],
  resource_group: [{ required: true, message: 'Resource Group é obrigatório' }],
  location: [{ required: true, message: 'Localização é obrigatória' }],
};

const CreateAzureAppServiceForm = forwardRef(function CreateAzureAppServiceForm({ form, setForm }, ref) {
  const [apiLocations, setApiLocations] = useState([]);
  const [resourceGroups, setResourceGroups] = useState([]);
  const { errors, touched, touch, touchAll, isValid } = useFormValidation(form, RULES);
  useImperativeHandle(ref, () => ({ touchAll, isValid }));

  const isPaidTier = !['F1', 'D1'].includes(form.plan_sku || 'F1');
  const locations = apiLocations.length > 0 ? apiLocations : AZURE_LOCATIONS;

  useEffect(() => {
    azureService.listLocations().then((d) => d?.locations?.length && setApiLocations(d.locations)).catch(() => {});
    azureService.listResourceGroups().then((d) => d?.resource_groups && setResourceGroups(d.resource_groups)).catch(() => {});
  }, []);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  return (
    <>
      <FormSection title="Básico">
        <div>
          <label className={labelCls}>Nome <span className="text-red-500">*</span></label>
          <input
            className={`${inputCls} ${touched.name && errors.name ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.name || ''}
            onChange={(e) => set('name', e.target.value)}
            onBlur={() => touch('name')}
            placeholder="meu-app"
          />
          <FieldError message={touched.name ? errors.name : null} />
          {!(touched.name && errors.name) && (
            <p className="text-xs text-gray-400 mt-1">Será acessível como {form.name || 'app'}.azurewebsites.net</p>
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
        <div>
          <label className={labelCls}>Runtime <span className="text-red-500">*</span></label>
          <select className={inputCls} value={form.runtime || 'NODE|18-lts'} onChange={(e) => set('runtime', e.target.value)}>
            {RUNTIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </FormSection>

      <FormSection title="Plano de Hospedagem" description="App Service Plan (recursos de computação)">
        <div>
          <label className={labelCls}>Nome do Plano</label>
          <input className={inputCls} value={form.plan_name || ''} onChange={(e) => set('plan_name', e.target.value)}
            placeholder={form.name ? `${form.name}-plan` : 'meu-app-plan'} />
          <p className="text-xs text-gray-400 mt-1">Deixe vazio para gerar automaticamente.</p>
        </div>
        <div>
          <label className={labelCls}>SKU / Tier</label>
          <select className={inputCls} value={form.plan_sku || 'F1'} onChange={(e) => set('plan_sku', e.target.value)}>
            {PLAN_SKUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <label className={`flex items-center gap-2 text-sm cursor-pointer ${!isPaidTier ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <input type="checkbox" className={toggleCls}
            disabled={!isPaidTier}
            checked={form.always_on && isPaidTier}
            onChange={(e) => set('always_on', e.target.checked)} />
          <span className="text-gray-700 dark:text-gray-300">Always On {!isPaidTier && <span className="text-xs text-gray-400">(requer Basic ou superior)</span>}</span>
        </label>
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

export default CreateAzureAppServiceForm;
