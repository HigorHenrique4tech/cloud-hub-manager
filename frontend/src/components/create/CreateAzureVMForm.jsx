import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import azureService from '../../services/azureservices';
import { AZURE_LOCATIONS, AZURE_VM_SIZES, VM_OS_PRESETS } from '../../data/azureConstants';

const DISK_TYPES = [
  { value: 'Standard_LRS',    label: 'HDD Standard (Standard_LRS)' },
  { value: 'StandardSSD_LRS', label: 'SSD Standard (StandardSSD_LRS)' },
  { value: 'Premium_LRS',     label: 'SSD Premium (Premium_LRS)' },
  { value: 'UltraSSD_LRS',    label: 'Ultra Disk (UltraSSD_LRS)' },
];

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

const defaultDataDisk = (lun) => ({ name: `data-disk-${lun}`, disk_size_gb: 32, lun, storage_account_type: 'Standard_LRS' });

const PRESET_GROUPS = [...new Set(VM_OS_PRESETS.map((p) => p.group))];

export default function CreateAzureVMForm({ form, setForm }) {
  const [apiLocations, setApiLocations] = useState([]);
  const [apiSizes, setApiSizes] = useState([]);
  const [resourceGroups, setResourceGroups] = useState([]);
  const [authMode, setAuthMode] = useState('password');
  const [osMode, setOsMode] = useState('preset');
  const [selectedPreset, setSelectedPreset] = useState('Ubuntu 22.04 LTS (Jammy)');

  const locations = apiLocations.length > 0 ? apiLocations : AZURE_LOCATIONS;
  const sizes = apiSizes.length > 0 ? apiSizes : AZURE_VM_SIZES;
  const location = form.location || '';

  useEffect(() => {
    azureService.listLocations()
      .then((d) => d?.locations?.length && setApiLocations(d.locations))
      .catch(() => {});
    azureService.listResourceGroups()
      .then((d) => d?.resource_groups?.length && setResourceGroups(d.resource_groups))
      .catch(() => {});
    // Apply default preset on mount
    applyPreset('Ubuntu 22.04 LTS (Jammy)');
  }, []);

  useEffect(() => {
    if (!location) return;
    azureService.listVMSizes(location)
      .then((d) => d?.sizes?.length && setApiSizes(d.sizes))
      .catch(() => {});
  }, [location]);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  const applyPreset = (presetLabel) => {
    const preset = VM_OS_PRESETS.find((p) => p.label === presetLabel);
    if (!preset) return;
    setSelectedPreset(presetLabel);
    if (preset.publisher !== '') {
      setForm((p) => ({
        ...p,
        image_publisher: preset.publisher,
        image_offer: preset.offer,
        image_sku: preset.sku,
        image_version: preset.version || 'latest',
      }));
    }
    if (preset.publisher === '') setOsMode('manual');
  };

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
          <select className={inputCls} value={location} onChange={(e) => set('location', e.target.value)}>
            <option value="">Selecione...</option>
            {locations.map((l) => (
              <option key={l.name} value={l.name}>{l.display_name || l.name}</option>
            ))}
          </select>
        </div>
      </FormSection>

      <FormSection title="Tamanho" description="Recursos de computação (vCPU e memória)">
        <div>
          <label className={labelCls}>Tamanho da VM</label>
          <select className={inputCls} value={form.vm_size || 'Standard_B1s'} onChange={(e) => set('vm_size', e.target.value)}>
            {sizes.map((s) => (
              <option key={s.name} value={s.name}>
                {s.label || `${s.name} (${s.vcpus} vCPU, ${Math.round(s.memory_mb / 1024)} GB RAM)`}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Disponibilidade varia por região.{' '}
            <a href="https://learn.microsoft.com/pt-br/azure/virtual-machines/sizes" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Ver todos os tamanhos →
            </a>
          </p>
        </div>
      </FormSection>

      <FormSection title="Imagem" description="Sistema operacional da VM">
        <div className="flex gap-4">
          {[['preset', 'Selecionar SO'], ['manual', 'Avançado (Publisher/Offer/SKU)']].map(([mode, lbl]) => (
            <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" className={toggleCls} checked={osMode === mode} onChange={() => setOsMode(mode)} />
              <span className="text-gray-700 dark:text-gray-300">{lbl}</span>
            </label>
          ))}
        </div>

        {osMode === 'preset' ? (
          <div>
            <label className={labelCls}>Sistema Operacional <span className="text-red-500">*</span></label>
            <select className={inputCls} value={selectedPreset} onChange={(e) => applyPreset(e.target.value)}>
              {PRESET_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {VM_OS_PRESETS.filter((p) => p.group === group).map((p) => (
                    <option key={p.label} value={p.label}>{p.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {form.image_publisher && (
              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900/40 rounded-lg text-xs text-gray-500 dark:text-gray-400 font-mono space-y-0.5">
                <div>Publisher: <span className="text-gray-700 dark:text-gray-200">{form.image_publisher}</span></div>
                <div>Offer: <span className="text-gray-700 dark:text-gray-200">{form.image_offer}</span></div>
                <div>SKU: <span className="text-gray-700 dark:text-gray-200">{form.image_sku}</span></div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className={labelCls}>Publisher <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.image_publisher || ''} onChange={(e) => set('image_publisher', e.target.value)}
                placeholder="Ex: Canonical, MicrosoftWindowsServer, RedHat" />
              <p className="text-xs text-gray-400 mt-1">
                <a href="https://learn.microsoft.com/pt-br/azure/virtual-machines/linux/cli-ps-findimage" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  Como encontrar imagens na documentação →
                </a>
              </p>
            </div>
            <div>
              <label className={labelCls}>Offer <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.image_offer || ''} onChange={(e) => set('image_offer', e.target.value)}
                placeholder="Ex: 0001-com-ubuntu-server-jammy, WindowsServer" />
            </div>
            <div>
              <label className={labelCls}>SKU <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.image_sku || ''} onChange={(e) => set('image_sku', e.target.value)}
                placeholder="Ex: 22_04-lts-gen2, 2022-datacenter-g2" />
            </div>
            <div>
              <label className={labelCls}>Versão</label>
              <input className={inputCls} value={form.image_version || 'latest'} onChange={(e) => set('image_version', e.target.value)} />
            </div>
          </>
        )}
      </FormSection>

      <FormSection title="Administrador" description="Credenciais de acesso à VM">
        <div>
          <label className={labelCls}>Usuário Admin <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.admin_username || ''} onChange={(e) => set('admin_username', e.target.value)} placeholder="azureuser" />
          <p className="text-xs text-gray-400 mt-1">Não use: admin, administrator, root, guest, user.</p>
        </div>
        <div className="flex gap-4">
          {[['password', 'Senha'], ['ssh', 'Chave SSH pública']].map(([mode, lbl]) => (
            <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" className={toggleCls} checked={authMode === mode} onChange={() => setAuthMode(mode)} />
              <span className="text-gray-700 dark:text-gray-300">{lbl}</span>
            </label>
          ))}
        </div>
        {authMode === 'password' ? (
          <div>
            <label className={labelCls}>Senha <span className="text-red-500">*</span></label>
            <input type="password" className={inputCls} value={form.admin_password || ''} onChange={(e) => set('admin_password', e.target.value)}
              placeholder="Mín. 12 caracteres com letras, números e símbolos" />
            <p className="text-xs text-gray-400 mt-1">12–123 caracteres com maiúsculas, minúsculas, números e símbolos.</p>
          </div>
        ) : (
          <div>
            <label className={labelCls}>Chave Pública SSH <span className="text-red-500">*</span></label>
            <textarea className={`${inputCls} h-24 resize-none font-mono text-xs`}
              value={form.ssh_public_key || ''} onChange={(e) => set('ssh_public_key', e.target.value)}
              placeholder="ssh-rsa AAAAB3NzaC1yc2E..." />
            <p className="text-xs text-gray-400 mt-1">Cole o conteúdo de ~/.ssh/id_rsa.pub ou id_ed25519.pub.</p>
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

      <FormSection title="Disco OS" description="Disco do sistema operacional">
        <div>
          <label className={labelCls}>Tipo de Disco OS</label>
          <select className={inputCls} value={form.os_disk_type || 'StandardSSD_LRS'} onChange={(e) => set('os_disk_type', e.target.value)}>
            {DISK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Tamanho do Disco OS (GB)</label>
          <input type="number" className={inputCls} value={form.os_disk_size_gb || ''} onChange={(e) => set('os_disk_size_gb', e.target.value ? +e.target.value : null)}
            min={30} placeholder="Padrão da imagem (recomendado)" />
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
                    {DISK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addDisk} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-dark font-medium">
            <Plus className="w-4 h-4" /> Adicionar Disco de Dados
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
