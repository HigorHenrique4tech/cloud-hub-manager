import { useState, useEffect } from 'react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import azureService from '../../services/azureservices';
import { AZURE_LOCATIONS } from '../../data/azureConstants';

const SKUS = [
  { value: 'Basic',      label: 'Basic — DTU, 5 DTUs, 2 GB' },
  { value: 'S0',         label: 'S0 — Standard, 10 DTUs, 250 GB' },
  { value: 'S1',         label: 'S1 — Standard, 20 DTUs, 250 GB' },
  { value: 'S2',         label: 'S2 — Standard, 50 DTUs, 250 GB' },
  { value: 'S3',         label: 'S3 — Standard, 100 DTUs, 250 GB' },
  { value: 'P1',         label: 'P1 — Premium, 125 DTUs, 500 GB' },
  { value: 'P2',         label: 'P2 — Premium, 250 DTUs, 500 GB' },
  { value: 'GP_Gen5_2',  label: 'GP_Gen5_2 — General Purpose, 2 vCores, 10.2 GB' },
  { value: 'GP_Gen5_4',  label: 'GP_Gen5_4 — General Purpose, 4 vCores, 20.4 GB' },
  { value: 'GP_Gen5_8',  label: 'GP_Gen5_8 — General Purpose, 8 vCores, 40.8 GB' },
  { value: 'BC_Gen5_2',  label: 'BC_Gen5_2 — Business Critical, 2 vCores, 10.2 GB' },
  { value: 'BC_Gen5_4',  label: 'BC_Gen5_4 — Business Critical, 4 vCores, 20.4 GB' },
];
const MAX_SIZES = [
  { label: '100 MB', value: 104857600 },
  { label: '250 MB', value: 268435456 },
  { label: '500 MB', value: 536870912 },
  { label: '1 GB', value: 1073741824 },
  { label: '2 GB', value: 2147483648 },
  { label: '5 GB', value: 5368709120 },
  { label: '10 GB', value: 10737418240 },
  { label: '50 GB', value: 53687091200 },
  { label: '100 GB', value: 107374182400 },
];
const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

export default function CreateAzureSQLForm({ form, setForm }) {
  const [apiLocations, setApiLocations] = useState([]);
  const [resourceGroups, setResourceGroups] = useState([]);

  const locations = apiLocations.length > 0 ? apiLocations : AZURE_LOCATIONS;

  useEffect(() => {
    azureService.listLocations().then((d) => d?.locations?.length && setApiLocations(d.locations)).catch(() => {});
    azureService.listResourceGroups().then((d) => d?.resource_groups && setResourceGroups(d.resource_groups)).catch(() => {});
  }, []);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  return (
    <>
      <FormSection title="Servidor SQL" description="Configurações do servidor Azure SQL">
        <div>
          <label className={labelCls}>Nome do Servidor <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.server_name || ''} onChange={(e) => set('server_name', e.target.value)} placeholder="meu-servidor-sql" />
          <p className="text-xs text-gray-400 mt-1">Deve ser globalmente único. Será acessível como {form.server_name || 'servidor'}.database.windows.net</p>
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

      <FormSection title="Credenciais do Administrador">
        <div>
          <label className={labelCls}>Login <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.admin_login || ''} onChange={(e) => set('admin_login', e.target.value)} placeholder="sqladmin" />
        </div>
        <div>
          <label className={labelCls}>Senha <span className="text-red-500">*</span></label>
          <input type="password" className={inputCls} value={form.admin_password || ''} onChange={(e) => set('admin_password', e.target.value)} />
        </div>
      </FormSection>

      <FormSection title="Banco de Dados">
        <div>
          <label className={labelCls}>Nome do Banco <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.database_name || ''} onChange={(e) => set('database_name', e.target.value)} placeholder="meu-banco" />
        </div>
        <div>
          <label className={labelCls}>SKU / Tier</label>
          <select className={inputCls} value={form.sku_name || 'Basic'} onChange={(e) => set('sku_name', e.target.value)}>
            {SKUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Tamanho Máximo</label>
          <select className={inputCls} value={form.max_size_bytes || ''} onChange={(e) => set('max_size_bytes', e.target.value ? +e.target.value : null)}>
            <option value="">Padrão do SKU</option>
            {MAX_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Collation</label>
          <input className={inputCls} value={form.collation || 'SQL_Latin1_General_CP1_CI_AS'} onChange={(e) => set('collation', e.target.value)} />
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
