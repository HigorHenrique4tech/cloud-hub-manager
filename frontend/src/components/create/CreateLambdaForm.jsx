import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import FieldError from '../common/FieldError';
import awsService from '../../services/awsservices';
import useFormValidation from '../../hooks/useFormValidation';

const RUNTIMES = [
  'python3.12', 'python3.11', 'python3.10',
  'nodejs20.x', 'nodejs18.x',
  'java21', 'java17',
  'dotnet8', 'dotnet6',
  'ruby3.3', 'go1.x',
];
const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

const RULES = {
  function_name: [
    { required: true, message: 'Nome da função é obrigatório' },
    { maxLength: 64, message: 'Máximo 64 caracteres' },
    { pattern: /^[a-zA-Z0-9\-_]+$/, message: 'Apenas letras, números, hífens e underscores' },
  ],
  runtime: [{ required: true, message: 'Runtime é obrigatório' }],
  handler: [{ required: true, message: 'Handler é obrigatório' }],
  role_arn: [
    { required: true, message: 'IAM Role ARN é obrigatório' },
    { pattern: /^arn:aws:iam::\d{12}:role\/.+$/, message: 'Formato inválido. Use: arn:aws:iam::123456789012:role/NomeDoRole' },
  ],
};

const CreateLambdaForm = forwardRef(function CreateLambdaForm({ form, setForm }, ref) {
  const [roles, setRoles] = useState([]);
  const [codeSource, setCodeSource] = useState('zip');
  const fileRef = useRef();
  const { errors, touched, touch, touchAll, isValid } = useFormValidation(form, RULES);
  useImperativeHandle(ref, () => ({ touchAll, isValid }));

  useEffect(() => {
    awsService.listIAMRoles('lambda').then((d) => d?.roles && setRoles(d.roles)).catch(() => {});
  }, []);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  const addEnvVar = () => setForm((p) => ({ ...p, environment_variables: [...(p.environment_variables || []), { key: '', value: '' }] }));
  const removeEnvVar = (i) => setForm((p) => ({ ...p, environment_variables: p.environment_variables.filter((_, idx) => idx !== i) }));
  const updateEnvVar = (i, field, val) =>
    setForm((p) => ({ ...p, environment_variables: p.environment_variables.map((ev, idx) => idx === i ? { ...ev, [field]: val } : ev) }));

  const handleZipUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target.result.split(',')[1];
      set('code_zip_base64', b64);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <FormSection title="Identificação">
        <div>
          <label className={labelCls}>Nome da Função <span className="text-red-500">*</span></label>
          <input
            className={`${inputCls} ${touched.function_name && errors.function_name ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.function_name || ''}
            onChange={(e) => set('function_name', e.target.value)}
            onBlur={() => touch('function_name')}
            placeholder="minha-funcao"
          />
          <FieldError message={touched.function_name ? errors.function_name : null} />
        </div>
        <div>
          <label className={labelCls}>Descrição</label>
          <input className={inputCls} value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Runtime <span className="text-red-500">*</span></label>
          <select
            className={`${inputCls} ${touched.runtime && errors.runtime ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.runtime || 'python3.12'}
            onChange={(e) => set('runtime', e.target.value)}
            onBlur={() => touch('runtime')}
          >
            {RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <FieldError message={touched.runtime ? errors.runtime : null} />
        </div>
        <div>
          <label className={labelCls}>Handler <span className="text-red-500">*</span></label>
          <input
            className={`${inputCls} ${touched.handler && errors.handler ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.handler || 'lambda_function.lambda_handler'}
            onChange={(e) => set('handler', e.target.value)}
            onBlur={() => touch('handler')}
          />
          <FieldError message={touched.handler ? errors.handler : null} />
        </div>
        <div>
          <label className={labelCls}>IAM Role ARN <span className="text-red-500">*</span></label>
          <select
            className={`${inputCls} ${touched.role_arn && errors.role_arn ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.role_arn || ''}
            onChange={(e) => set('role_arn', e.target.value)}
            onBlur={() => touch('role_arn')}
          >
            <option value="">Selecione um role</option>
            {roles.map((r) => <option key={r.arn} value={r.arn}>{r.name}</option>)}
          </select>
          <input
            className={`${inputCls} mt-2 ${touched.role_arn && errors.role_arn ? 'border-red-500 dark:border-red-500' : ''}`}
            value={form.role_arn || ''}
            onChange={(e) => set('role_arn', e.target.value)}
            onBlur={() => touch('role_arn')}
            placeholder="Ou insira o ARN manualmente"
          />
          <FieldError message={touched.role_arn ? errors.role_arn : null} />
        </div>
      </FormSection>

      <FormSection title="Código" description="Fonte do código da função">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" className={toggleCls} checked={codeSource === 'zip'} onChange={() => setCodeSource('zip')} />
            <span className="text-gray-700 dark:text-gray-300">Upload ZIP</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" className={toggleCls} checked={codeSource === 's3'} onChange={() => setCodeSource('s3')} />
            <span className="text-gray-700 dark:text-gray-300">Referência S3</span>
          </label>
        </div>
        {codeSource === 'zip' ? (
          <div>
            <label className={labelCls}>Arquivo ZIP</label>
            <input ref={fileRef} type="file" accept=".zip" onChange={handleZipUpload}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer" />
            {form.code_zip_base64 && <p className="text-xs text-green-600 dark:text-green-400 mt-1">Arquivo carregado ✓</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>S3 Bucket</label>
              <input className={inputCls} value={form.code_s3_bucket || ''} onChange={(e) => set('code_s3_bucket', e.target.value)} placeholder="meu-bucket-codigo" />
            </div>
            <div>
              <label className={labelCls}>S3 Key</label>
              <input className={inputCls} value={form.code_s3_key || ''} onChange={(e) => set('code_s3_key', e.target.value)} placeholder="funcoes/minha-funcao.zip" />
            </div>
          </div>
        )}
      </FormSection>

      <FormSection title="Configuração de Execução">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Memória (MB): {form.memory_size_mb || 128}</label>
            <input type="range" min={128} max={10240} step={64}
              value={form.memory_size_mb || 128} onChange={(e) => set('memory_size_mb', +e.target.value)}
              className="w-full accent-primary" />
          </div>
          <div>
            <label className={labelCls}>Timeout (segundos): {form.timeout_seconds || 3}</label>
            <input type="range" min={1} max={900} step={1}
              value={form.timeout_seconds || 3} onChange={(e) => set('timeout_seconds', +e.target.value)}
              className="w-full accent-primary" />
          </div>
        </div>
      </FormSection>

      <FormSection title="Variáveis de Ambiente">
        <div className="space-y-2">
          {(form.environment_variables || []).map((ev, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="CHAVE" value={ev.key} onChange={(e) => updateEnvVar(i, 'key', e.target.value)} />
              <input className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="valor" value={ev.value} onChange={(e) => updateEnvVar(i, 'value', e.target.value)} />
              <button type="button" onClick={() => removeEnvVar(i)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addEnvVar} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-dark font-medium">
            <Plus className="w-4 h-4" /> Adicionar Variável
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

export default CreateLambdaForm;
