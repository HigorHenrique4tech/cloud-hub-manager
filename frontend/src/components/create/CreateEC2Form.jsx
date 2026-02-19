import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import awsService from '../../services/awsservices';
import { AWS_EC2_INSTANCE_TYPES } from '../../data/awsConstants';

const VOLUME_TYPES = [
  { value: 'gp3', label: 'gp3 — SSD de propósito geral v3 (recomendado)' },
  { value: 'gp2', label: 'gp2 — SSD de propósito geral v2' },
  { value: 'io1', label: 'io1 — SSD IOPS provisionados v1' },
  { value: 'io2', label: 'io2 — SSD IOPS provisionados v2 (maior durabilidade)' },
  { value: 'st1', label: 'st1 — HDD otimizado para throughput (big data)' },
  { value: 'sc1', label: 'sc1 — HDD frio (acesso infrequente, mais barato)' },
];

const defaultVolume = () => ({
  device_name: '/dev/sda1',
  volume_size_gb: 20,
  volume_type: 'gp3',
  iops: '',
  throughput: '',
  delete_on_termination: true,
  encrypted: false,
});

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

export default function CreateEC2Form({ form, setForm }) {
  const [amis, setAmis] = useState([]);
  const [amiSearch, setAmiSearch] = useState('');
  const [apiInstanceTypes, setApiInstanceTypes] = useState([]);
  const [keyPairs, setKeyPairs] = useState([]);
  const [securityGroups, setSecurityGroups] = useState([]);
  const [subnets, setSubnets] = useState([]);
  const [iamRoles, setIamRoles] = useState([]);
  const [loading, setLoading] = useState({});

  const instanceTypes = apiInstanceTypes.length > 0 ? apiInstanceTypes : AWS_EC2_INSTANCE_TYPES;

  const load = async (key, fn) => {
    setLoading((p) => ({ ...p, [key]: true }));
    try {
      const data = await fn();
      return data;
    } catch { return null; }
    finally { setLoading((p) => ({ ...p, [key]: false })); }
  };

  useEffect(() => {
    load('types', awsService.listInstanceTypes).then((d) => d?.instance_types?.length && setApiInstanceTypes(d.instance_types));
    load('keys', awsService.listKeyPairs).then((d) => d && setKeyPairs(d.key_pairs || []));
    load('sgs', awsService.listSecurityGroups).then((d) => d && setSecurityGroups(d.security_groups || []));
    load('subnets', awsService.listSubnets).then((d) => d && setSubnets(d.subnets || []));
    load('roles', awsService.listIAMRoles).then((d) => d && setIamRoles(d.roles || []));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load('amis', () => awsService.listAMIs(amiSearch)).then((d) => d && setAmis(d.amis || []));
    }, 400);
    return () => clearTimeout(t);
  }, [amiSearch]);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  const addVolume = () => setForm((p) => ({ ...p, volumes: [...(p.volumes || []), defaultVolume()] }));
  const removeVolume = (i) => setForm((p) => ({ ...p, volumes: p.volumes.filter((_, idx) => idx !== i) }));
  const updateVolume = (i, field, val) =>
    setForm((p) => ({ ...p, volumes: p.volumes.map((v, idx) => idx === i ? { ...v, [field]: val } : v) }));

  const toggleSG = (id) => {
    const current = form.security_group_ids || [];
    setForm((p) => ({
      ...p,
      security_group_ids: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    }));
  };

  return (
    <>
      <FormSection title="Básico" description="Nome, imagem e tipo da instância">
        <div>
          <label className={labelCls}>Nome <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="minha-instancia" />
        </div>
        <div>
          <label className={labelCls}>Buscar AMI</label>
          <input className={inputCls} value={amiSearch} onChange={(e) => setAmiSearch(e.target.value)} placeholder="ubuntu, amazon-linux, windows..." />
          {loading.amis && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
        </div>
        <div>
          <label className={labelCls}>AMI ID <span className="text-red-500">*</span></label>
          <select className={inputCls} value={form.image_id || ''} onChange={(e) => set('image_id', e.target.value)}>
            <option value="">Selecione uma AMI</option>
            {amis.map((a) => (
              <option key={a.image_id} value={a.image_id}>{a.name || a.image_id} ({a.image_id})</option>
            ))}
          </select>
          <input className={`${inputCls} mt-2`} value={form.image_id || ''} onChange={(e) => set('image_id', e.target.value)} placeholder="Ou insira o AMI ID manualmente (ex: ami-0abcdef...)" />
        </div>
        <div>
          <label className={labelCls}>Tipo de Instância</label>
          <select className={inputCls} value={form.instance_type || 't3.micro'} onChange={(e) => set('instance_type', e.target.value)}>
            {loading.types ? <option>Carregando...</option> : instanceTypes.map((t) => (
              <option key={t.name} value={t.name}>{t.label || `${t.name} — ${t.vcpus} vCPU, ${Math.round(t.memory_mb / 1024)} GB RAM`}</option>
            ))}
          </select>
        </div>
      </FormSection>

      <FormSection title="Rede" description="Configurações de rede e segurança">
        <div>
          <label className={labelCls}>Par de Chaves SSH</label>
          <select className={inputCls} value={form.key_name || ''} onChange={(e) => set('key_name', e.target.value)}>
            <option value="">Nenhum</option>
            {keyPairs.map((k) => <option key={k.name} value={k.name}>{k.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Subnet</label>
          <select className={inputCls} value={form.subnet_id || ''} onChange={(e) => set('subnet_id', e.target.value)}>
            <option value="">Padrão</option>
            {subnets.map((s) => (
              <option key={s.id} value={s.id}>{s.name || s.id} — {s.cidr} ({s.az})</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Security Groups</label>
          <div className="space-y-1 max-h-36 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2">
            {securityGroups.map((sg) => (
              <label key={sg.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className={toggleCls}
                  checked={(form.security_group_ids || []).includes(sg.id)}
                  onChange={() => toggleSG(sg.id)} />
                <span className="text-gray-700 dark:text-gray-300">{sg.name} <span className="text-gray-400">({sg.id})</span></span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className={toggleCls}
            checked={form.associate_public_ip || false}
            onChange={(e) => set('associate_public_ip', e.target.checked)} />
          <span className="text-gray-700 dark:text-gray-300">Associar IP Público</span>
        </label>
      </FormSection>

      <FormSection title="Storage (EBS)" description="Volumes de armazenamento">
        <div className="space-y-4">
          {(form.volumes || []).map((vol, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Volume {i + 1}</span>
                <button type="button" onClick={() => removeVolume(i)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Device</label>
                  <input className={inputCls} value={vol.device_name} onChange={(e) => updateVolume(i, 'device_name', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Tamanho (GB)</label>
                  <input type="number" className={inputCls} value={vol.volume_size_gb} onChange={(e) => updateVolume(i, 'volume_size_gb', +e.target.value)} min={1} />
                </div>
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select className={inputCls} value={vol.volume_type} onChange={(e) => updateVolume(i, 'volume_type', e.target.value)}>
                    {VOLUME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {['io1', 'io2', 'gp3'].includes(vol.volume_type) && (
                  <div>
                    <label className={labelCls}>IOPS</label>
                    <input type="number" className={inputCls} value={vol.iops} onChange={(e) => updateVolume(i, 'iops', +e.target.value)} />
                  </div>
                )}
                {vol.volume_type === 'gp3' && (
                  <div>
                    <label className={labelCls}>Throughput (MiB/s)</label>
                    <input type="number" className={inputCls} value={vol.throughput} onChange={(e) => updateVolume(i, 'throughput', +e.target.value)} />
                  </div>
                )}
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className={toggleCls} checked={vol.delete_on_termination} onChange={(e) => updateVolume(i, 'delete_on_termination', e.target.checked)} />
                  <span className="text-gray-700 dark:text-gray-300">Excluir ao terminar</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className={toggleCls} checked={vol.encrypted} onChange={(e) => updateVolume(i, 'encrypted', e.target.checked)} />
                  <span className="text-gray-700 dark:text-gray-300">Criptografado</span>
                </label>
              </div>
            </div>
          ))}
          <button type="button" onClick={addVolume} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-dark font-medium">
            <Plus className="w-4 h-4" /> Adicionar Volume
          </button>
        </div>
      </FormSection>

      <FormSection title="Avançado">
        <div>
          <label className={labelCls}>User Data</label>
          <textarea className={`${inputCls} h-24 resize-none font-mono text-xs`}
            value={form.user_data || ''} onChange={(e) => set('user_data', e.target.value)}
            placeholder="#!/bin/bash&#10;echo 'Hello World'" />
        </div>
        <div>
          <label className={labelCls}>IAM Instance Profile (ARN ou nome)</label>
          <input className={inputCls} value={form.iam_instance_profile || ''}
            onChange={(e) => set('iam_instance_profile', e.target.value)}
            placeholder="arn:aws:iam::123456789012:instance-profile/MyProfile" />
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
