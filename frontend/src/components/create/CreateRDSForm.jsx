import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import FieldError from '../common/FieldError';
import awsService from '../../services/awsservices';
import { AWS_RDS_INSTANCE_CLASSES, AWS_RDS_ENGINE_VERSIONS } from '../../data/awsConstants';
import useFormValidation from '../../hooks/useFormValidation';

const ENGINES = [
  { value: 'mysql',              label: 'MySQL' },
  { value: 'postgres',           label: 'PostgreSQL' },
  { value: 'mariadb',            label: 'MariaDB' },
  { value: 'oracle-ee',          label: 'Oracle Enterprise Edition' },
  { value: 'sqlserver-ex',       label: 'SQL Server Express' },
  { value: 'aurora-mysql',       label: 'Aurora MySQL (Serverless ready)' },
  { value: 'aurora-postgresql',  label: 'Aurora PostgreSQL (Serverless ready)' },
];
const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

const RULES = {
  db_instance_identifier: [
    { required: true, message: 'Identificador é obrigatório' },
    { maxLength: 63, message: 'Máximo 63 caracteres' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9-]*$/, message: 'Deve começar com letra e conter apenas letras, números e hífens' },
  ],
  engine: [{ required: true, message: 'Engine é obrigatório' }],
  db_instance_class: [{ required: true, message: 'Classe da instância é obrigatória' }],
  master_username: [
    { required: true, message: 'Usuário master é obrigatório' },
    { maxLength: 16, message: 'Máximo 16 caracteres' },
  ],
  master_password: [
    { required: true, message: 'Senha master é obrigatória' },
    { minLength: 8, message: 'Mínimo 8 caracteres' },
  ],
  allocated_storage_gb: [
    { required: true, message: 'Tamanho de storage é obrigatório' },
    { min: 20, message: 'Mínimo 20 GB' },
  ],
};

const CreateRDSForm = forwardRef(function CreateRDSForm({ form, setForm }, ref) {
  const [apiVersions, setApiVersions] = useState([]);
  const [apiClasses, setApiClasses] = useState([]);
  const [subnetGroups, setSubnetGroups] = useState([]);
  const [securityGroups, setSecurityGroups] = useState([]);
  const { errors, touched, touch, touchAll, isValid } = useFormValidation(form, RULES);
  useImperativeHandle(ref, () => ({ touchAll, isValid }));

  const engine = form.engine || 'mysql';
  const versions = apiVersions.length > 0 ? apiVersions : (AWS_RDS_ENGINE_VERSIONS[engine] || []);
  const classes = apiClasses.length > 0 ? apiClasses : (AWS_RDS_INSTANCE_CLASSES[engine] || ['db.t3.micro']);

  useEffect(() => {
    setApiVersions([]);
    setApiClasses([]);
    awsService.listRDSEngineVersions(engine).then((d) => d?.versions?.length && setApiVersions(d.versions)).catch(() => {});
    awsService.listRDSInstanceClasses(engine).then((d) => d?.instance_classes?.length && setApiClasses(d.instance_classes)).catch(() => {});
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
          <input
            className={`${inputCls} ${touched.db_instance_identifier && errors.db_instance_identifier ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.db_instance_identifier || ''}
            onChange={(e) => set('db_instance_identifier', e.target.value)}
            onBlur={() => touch('db_instance_identifier')}
            placeholder="meu-banco-prod"
          />
          <FieldError message={touched.db_instance_identifier ? errors.db_instance_identifier : null} />
        </div>
        <div>
          <label className={labelCls}>Engine <span className="text-red-500">*</span></label>
          <select
            className={`${inputCls} ${touched.engine && errors.engine ? 'border-red-500 dark:border-red-500' : ''}`}
            value={engine}
            onChange={(e) => { set('engine', e.target.value); set('engine_version', ''); }}
            onBlur={() => touch('engine')}
          >
            {ENGINES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <FieldError message={touched.engine ? errors.engine : null} />
        </div>
        <div>
          <label className={labelCls}>Versão</label>
          <select className={inputCls} value={form.engine_version || ''} onChange={(e) => set('engine_version', e.target.value)}>
            <option value="">Última versão</option>
            {versions.map((v) => <option key={v.version} value={v.version}>{v.version}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Classe da Instância <span className="text-red-500">*</span></label>
          <select
            className={`${inputCls} ${touched.db_instance_class && errors.db_instance_class ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.db_instance_class || 'db.t3.micro'}
            onChange={(e) => set('db_instance_class', e.target.value)}
            onBlur={() => touch('db_instance_class')}
          >
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <FieldError message={touched.db_instance_class ? errors.db_instance_class : null} />
        </div>
      </FormSection>

      <FormSection title="Storage" description="Configurações de armazenamento">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Tamanho (GB) <span className="text-red-500">*</span></label>
            <input
              type="number"
              className={`${inputCls} ${touched.allocated_storage_gb && errors.allocated_storage_gb ? 'border-red-500 dark:border-red-500' : ''}`}
              value={form.allocated_storage_gb || 20}
              onChange={(e) => set('allocated_storage_gb', +e.target.value)}
              onBlur={() => touch('allocated_storage_gb')}
              min={20}
            />
            <FieldError message={touched.allocated_storage_gb ? errors.allocated_storage_gb : null} />
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
          <input
            className={`${inputCls} ${touched.master_username && errors.master_username ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.master_username || ''}
            onChange={(e) => set('master_username', e.target.value)}
            onBlur={() => touch('master_username')}
            placeholder="admin"
          />
          <FieldError message={touched.master_username ? errors.master_username : null} />
        </div>
        <div>
          <label className={labelCls}>Senha Master <span className="text-red-500">*</span></label>
          <input
            type="password"
            className={`${inputCls} ${touched.master_password && errors.master_password ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.master_password || ''}
            onChange={(e) => set('master_password', e.target.value)}
            onBlur={() => touch('master_password')}
          />
          <FieldError message={touched.master_password ? errors.master_password : null} />
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
});

export default CreateRDSForm;
