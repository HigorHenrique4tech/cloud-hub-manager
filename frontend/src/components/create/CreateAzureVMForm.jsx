import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import azureService from '../../services/azureservices';

const DISK_TYPES = ['Standard_LRS', 'StandardSSD_LRS', 'Premium_LRS'];
const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

const defaultDataDisk = (lun) => ({ name: `data-disk-${lun}`, disk_size_gb: 32, lun, storage_account_type: 'Standard_LRS' });

export default function CreateAzureVMForm({ form, setForm }) {
  const [locations, setLocations] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [resourceGroups, setResourceGroups] = useState([]);
  const [publishers, setPublishers] = useState([]);
  const [offers, setOffers] = useState([]);
  const [skus, setSkus] = useState([]);
  const [authMode, setAuthMode] = useState('password');

  const location = form.location || '';

  useEffect(() => {
    azureService.listLocations().then((d) => d?.locations && setLocations(d.locations)).catch(() => {});
    azureService.listResourceGroups().then((d) => d?.resource_groups && setResourceGroups(d.resource_groups)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!location) return;
    azureService.listVMSizes(location).then((d) => d?.sizes && setSizes(d.sizes)).catch(() => {});
    azureService.listVMImagePublishers(location).then((d) => d?.publishers && setPublishers(d.publishers)).catch(() => {});
  }, [location]);

  useEffect(() => {
    const pub = form.image_publisher;
    if (!location || !pub) return;
    azureService.listVMImageOffers(location, pub).then((d) => d?.offers && setOffers(d.offers)).catch(() => {});
    setForm((p) => ({ ...p, image_offer: '', image_sku: '' }));
  }, [form.image_publisher]);

  useEffect(() => {
    const pub = form.image_publisher;
    const offer = form.image_offer;
    if (!location || !pub || !offer) return;
    azureService.listVMImageSkus(location, pub, offer).then((d) => d?.skus && setSkus(d.skus)).catch(() => {});
    setForm((p) => ({ ...p, image_sku: '' }));
  }, [form.image_offer]);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  const addDisk = () => {
    const lun = (form.data_disks || []).length;
    setForm((p) => ({ ...p, data_disks: [...(p.data_disks || []), defaultDataDisk(lun)] }));
  };
  const removeDisk = (i) => setForm((p) => ({ ...p, data_disks: p.data_disks.filter((_, idx) => idx !== i) }));
  const updateDisk = (i, field, val) =>
    setForm((p) => ({ ...p, data_disks: p.data_disks.map((d, idx) => idx === i ? { ...d, [field]: val } : d) }));

  return (
    <>
      <FormSection title="Básico">
        <div>
          <label className={labelCls}>Nome <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="minha-vm" />
        </div>
        <div>
          <label className={labelCls}>Resource Group <span className="text-red-500">*</span></label>
          <select className={inputCls} value={form.resource_group || ''} onChange={(e) => set('resource_group', e.target.value)}>
            <option value="">Selecione...</option>
            {resourceGroups.map((rg) => <option key={rg.name} value={rg.name}>{rg.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Localização <span className="text-red-500">*</span></label>
          <select className={inputCls} value={location} onChange={(e) => set('location', e.target.value)}>
            <option value="">Selecione...</option>
            {locations.map((l) => <option key={l.name} value={l.name}>{l.display_name}</option>)}
          </select>
        </div>
      </FormSection>

      <FormSection title="Tamanho">
        <div>
          <label className={labelCls}>Tamanho da VM</label>
          <select className={inputCls} value={form.vm_size || 'Standard_B1s'} onChange={(e) => set('vm_size', e.target.value)}>
            {sizes.length === 0
              ? <option value="Standard_B1s">Standard_B1s (2 vCPU, 1GB RAM)</option>
              : sizes.map((s) => (
                <option key={s.name} value={s.name}>{s.name} ({s.vcpus} vCPU, {Math.round(s.memory_mb / 1024)}GB RAM)</option>
              ))}
          </select>
        </div>
      </FormSection>

      <FormSection title="Imagem" description="Sistema operacional">
        <div>
          <label className={labelCls}>Publisher</label>
          <select className={inputCls} value={form.image_publisher || ''} onChange={(e) => set('image_publisher', e.target.value)}>
            <option value="">Selecione...</option>
            {publishers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className={`${inputCls} mt-2`} value={form.image_publisher || ''} onChange={(e) => set('image_publisher', e.target.value)} placeholder="Ou insira manualmente (ex: Canonical)" />
        </div>
        <div>
          <label className={labelCls}>Offer</label>
          <select className={inputCls} value={form.image_offer || ''} onChange={(e) => set('image_offer', e.target.value)}>
            <option value="">Selecione...</option>
            {offers.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input className={`${inputCls} mt-2`} value={form.image_offer || ''} onChange={(e) => set('image_offer', e.target.value)} placeholder="Ou insira manualmente" />
        </div>
        <div>
          <label className={labelCls}>SKU</label>
          <select className={inputCls} value={form.image_sku || ''} onChange={(e) => set('image_sku', e.target.value)}>
            <option value="">Selecione...</option>
            {skus.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className={`${inputCls} mt-2`} value={form.image_sku || ''} onChange={(e) => set('image_sku', e.target.value)} placeholder="Ou insira manualmente" />
        </div>
        <div>
          <label className={labelCls}>Versão</label>
          <input className={inputCls} value={form.image_version || 'latest'} onChange={(e) => set('image_version', e.target.value)} />
        </div>
      </FormSection>

      <FormSection title="Administrador" description="Credenciais de acesso">
        <div>
          <label className={labelCls}>Usuário Admin <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.admin_username || ''} onChange={(e) => set('admin_username', e.target.value)} placeholder="azureuser" />
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" className={toggleCls} checked={authMode === 'password'} onChange={() => setAuthMode('password')} />
            <span className="text-gray-700 dark:text-gray-300">Senha</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" className={toggleCls} checked={authMode === 'ssh'} onChange={() => setAuthMode('ssh')} />
            <span className="text-gray-700 dark:text-gray-300">Chave SSH</span>
          </label>
        </div>
        {authMode === 'password' ? (
          <div>
            <label className={labelCls}>Senha</label>
            <input type="password" className={inputCls} value={form.admin_password || ''} onChange={(e) => set('admin_password', e.target.value)} />
          </div>
        ) : (
          <div>
            <label className={labelCls}>Chave Pública SSH</label>
            <textarea className={`${inputCls} h-20 resize-none font-mono text-xs`}
              value={form.ssh_public_key || ''} onChange={(e) => set('ssh_public_key', e.target.value)}
              placeholder="ssh-rsa AAAA..." />
          </div>
        )}
      </FormSection>

      <FormSection title="Rede">
        <div>
          <label className={labelCls}>VNet (nome)</label>
          <input className={inputCls} value={form.vnet_name || ''} onChange={(e) => set('vnet_name', e.target.value)} placeholder="minha-vnet" />
        </div>
        <div>
          <label className={labelCls}>Subnet (nome)</label>
          <input className={inputCls} value={form.subnet_name || ''} onChange={(e) => set('subnet_name', e.target.value)} placeholder="default" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className={toggleCls} checked={form.create_public_ip || false} onChange={(e) => set('create_public_ip', e.target.checked)} />
          <span className="text-gray-700 dark:text-gray-300">Criar IP Público</span>
        </label>
      </FormSection>

      <FormSection title="Disco OS">
        <div>
          <label className={labelCls}>Tipo de Disco OS</label>
          <select className={inputCls} value={form.os_disk_type || 'Standard_LRS'} onChange={(e) => set('os_disk_type', e.target.value)}>
            {DISK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Tamanho do Disco OS (GB) — deixe vazio para padrão da imagem</label>
          <input type="number" className={inputCls} value={form.os_disk_size_gb || ''} onChange={(e) => set('os_disk_size_gb', e.target.value ? +e.target.value : null)} min={30} placeholder="Padrão da imagem" />
        </div>
      </FormSection>

      <FormSection title="Discos de Dados">
        <div className="space-y-4">
          {(form.data_disks || []).map((disk, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Disco {i + 1}</span>
                <button type="button" onClick={() => removeDisk(i)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nome</label>
                  <input className={inputCls} value={disk.name} onChange={(e) => updateDisk(i, 'name', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Tamanho (GB)</label>
                  <input type="number" className={inputCls} value={disk.disk_size_gb} onChange={(e) => updateDisk(i, 'disk_size_gb', +e.target.value)} min={1} />
                </div>
                <div>
                  <label className={labelCls}>LUN</label>
                  <input type="number" className={inputCls} value={disk.lun} onChange={(e) => updateDisk(i, 'lun', +e.target.value)} min={0} max={63} />
                </div>
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select className={inputCls} value={disk.storage_account_type} onChange={(e) => updateDisk(i, 'storage_account_type', e.target.value)}>
                    {DISK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addDisk} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-dark font-medium">
            <Plus className="w-4 h-4" /> Adicionar Disco
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
