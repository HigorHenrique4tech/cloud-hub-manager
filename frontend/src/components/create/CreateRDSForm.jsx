import { useState, useEffect } from 'react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import awsService from '../../services/awsservices';

const ENGINES = ['mysql', 'postgres', 'mariadb', 'oracle-ee', 'sqlserver-ex', 'aurora-mysql', 'aurora-postgresql'];
const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

export default function CreateRDSForm({ form, setForm }) {
  const [versions, setVersions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subnetGroups, setSubnetGroups] = useState([]);
  const [securityGroups, setSecurityGroups] = useState([]);

  const engine = form.engine || 'mysql';

  useEffect(() => {
    awsService.listRDSEngineVersions(engine).then((d) => d?.versions && setVersions(d.versions)).catch(() => {});
    awsService.listRDSInstanceClasses(engine).then((d) => d?.instance_classes && setClasses(d.instance_classes)).catch(() => {});
  }, [engine]);

  useEffect(() => {
    awsService.listDBSubnetGroups().then((d) => d?.subnet_groups && setSubnetGroups(d.subnet_groups)).catch(() => {});
    awsService.listSecurityGroups().then((d) => d?.security_groups && setSecurityGroups(d.security_groups)).catch(() => {});
  }, []);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  const toggleSG = (id) => {
    const current = form.vpc_security_group_ids || [];
    setForm((p) => ({
      ...p,
      vpc_security_group_ids: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    }));
  };

  return (
    <>
      <FormSection title="Identificação e Engine" description="Configurações principais do banco">
        <div>
          <label className={labelCls}>Identificador da Instância <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.db_instance_identifier || ''} onChange={(e) => set('db_instance_identifier', e.target.value)} placeholder="meu-banco-prod" />
        </div>
        <div>
          <label className={labelCls}>Engine <span className="text-red-500">*</span></label>
          <select className={inputCls} value={engine} onChange={(e) => { set('engine', e.target.value); set('engine_version', ''); }}>
            {ENGINES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Versão</label>
          <select className={inputCls} value={form.engine_version || ''} onChange={(e) => set('engine_version', e.target.value)}>
            <option value="">Última versão</option>
            {versions.map((v) => <option key={v.version} value={v.version}>{v.version}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Classe da Instância</label>
          <select className={inputCls} value={form.db_instance_class || 'db.t3.micro'} onChange={(e) => set('db_instance_class', e.target.value)}>
            {classes.length === 0
              ? <option value="db.t3.micro">db.t3.micro</option>
              : classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </FormSection>

      <FormSection title="Storage" description="Configurações de armazenamento">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Tamanho (GB)</label>
            <input type="number" className={inputCls} value={form.allocated_storage_gb || 20} onChange={(e) => set('allocated_storage_gb', +e.target.value)} min={20} />
          </div>
          <div>
            <label className={labelCls}>Tipo de Storage</label>
            <select className={inputCls} value={form.storage_type || 'gp3'} onChange={(e) => set('storage_type', e.target.value)}>
              <option value="gp2">gp2</option>
              <option value="gp3">gp3</option>
              <option value="io1">io1</option>
            </select>
          </div>
          {['io1', 'gp3'].includes(form.storage_type) && (
            <div>
              <label className={labelCls}>IOPS</label>
              <input type="number" className={inputCls} value={form.iops || ''} onChange={(e) => set('iops', +e.target.value)} />
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className={toggleCls} checked={form.storage_encrypted !== false} onChange={(e) => set('storage_encrypted', e.target.checked)} />
          <span className="text-gray-700 dark:text-gray-300">Criptografar Storage</span>
        </label>
      </FormSection>

      <FormSection title="Credenciais" description="Banco de dados e acesso">
        <div>
          <label className={labelCls}>Nome do Banco (inicial)</label>
          <input className={inputCls} value={form.db_name || ''} onChange={(e) => set('db_name', e.target.value)} placeholder="mydb" />
        </div>
        <div>
          <label className={labelCls}>Usuário Master <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.master_username || ''} onChange={(e) => set('master_username', e.target.value)} placeholder="admin" />
        </div>
        <div>
          <label className={labelCls}>Senha Master <span className="text-red-500">*</span></label>
          <input type="password" className={inputCls} value={form.master_password || ''} onChange={(e) => set('master_password', e.target.value)} />
        </div>
      </FormSection>

      <FormSection title="Rede e Segurança">
        <div>
          <label className={labelCls}>Subnet Group</label>
          <select className={inputCls} value={form.db_subnet_group_name || ''} onChange={(e) => set('db_subnet_group_name', e.target.value)}>
            <option value="">Padrão</option>
            {subnetGroups.map((g) => <option key={g.name} value={g.name}>{g.name} ({g.vpc_id})</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Security Groups</label>
          <div className="space-y-1 max-h-28 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2">
            {securityGroups.map((sg) => (
              <label key={sg.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className={toggleCls}
                  checked={(form.vpc_security_group_ids || []).includes(sg.id)}
                  onChange={() => toggleSG(sg.id)} />
                <span className="text-gray-700 dark:text-gray-300">{sg.name} <span className="text-gray-400">({sg.id})</span></span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className={toggleCls} checked={form.publicly_accessible || false} onChange={(e) => set('publicly_accessible', e.target.checked)} />
          <span className="text-gray-700 dark:text-gray-300">Acessível Publicamente</span>
        </label>
      </FormSection>

      <FormSection title="Configurações Avançadas">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Retenção de Backup (dias)</label>
            <input type="number" className={inputCls} value={form.backup_retention_days || 7} onChange={(e) => set('backup_retention_days', +e.target.value)} min={0} max={35} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          {[
            ['multi_az', 'Multi-AZ'],
            ['auto_minor_version_upgrade', 'Atualização Automática de Minor Version'],
            ['deletion_protection', 'Proteção contra Exclusão'],
          ].map(([field, label]) => (
            <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className={toggleCls}
                checked={form[field] || (field === 'auto_minor_version_upgrade' ? true : false)}
                onChange={(e) => set(field, e.target.checked)} />
              <span className="text-gray-700 dark:text-gray-300">{label}</span>
            </label>
          ))}
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
