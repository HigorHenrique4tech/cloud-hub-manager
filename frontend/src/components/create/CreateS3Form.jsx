import { useState, useEffect } from 'react';
import FormSection from '../common/FormSection';
import TagEditor from '../common/TagEditor';
import awsService from '../../services/awsservices';

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const toggleCls = 'w-4 h-4 text-primary accent-primary';

export default function CreateS3Form({ form, setForm }) {
  const [regions, setRegions] = useState([]);

  useEffect(() => {
    awsService.listS3Regions().then((d) => d?.regions && setRegions(d.regions)).catch(() => {});
  }, []);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  return (
    <>
      <FormSection title="Identificação" description="Nome e região do bucket">
        <div>
          <label className={labelCls}>Nome do Bucket <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.bucket_name || ''} onChange={(e) => set('bucket_name', e.target.value)}
            placeholder="meu-bucket-unico-123" />
          <p className="text-xs text-gray-400 mt-1">Deve ser globalmente único, 3–63 caracteres, somente letras minúsculas, números e hífens.</p>
        </div>
        <div>
          <label className={labelCls}>Região</label>
          <select className={inputCls} value={form.region || 'us-east-1'} onChange={(e) => set('region', e.target.value)}>
            {regions.length === 0
              ? <option value="us-east-1">us-east-1 (N. Virginia)</option>
              : regions.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
      </FormSection>

      <FormSection title="Versionamento">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className={toggleCls}
            checked={form.versioning_enabled || false}
            onChange={(e) => set('versioning_enabled', e.target.checked)} />
          <span className="text-gray-700 dark:text-gray-300">Habilitar Versionamento</span>
        </label>
        <p className="text-xs text-gray-400">Mantém múltiplas versões de cada objeto no bucket.</p>
      </FormSection>

      <FormSection title="Criptografia" description="Configurações de criptografia server-side">
        <div>
          <label className={labelCls}>Algoritmo</label>
          <select className={inputCls} value={form.encryption_algorithm || 'AES256'} onChange={(e) => set('encryption_algorithm', e.target.value)}>
            <option value="AES256">AES-256 (SSE-S3)</option>
            <option value="aws:kms">AWS KMS (SSE-KMS)</option>
          </select>
        </div>
        {form.encryption_algorithm === 'aws:kms' && (
          <div>
            <label className={labelCls}>KMS Key ID (opcional)</label>
            <input className={inputCls} value={form.kms_key_id || ''} onChange={(e) => set('kms_key_id', e.target.value)}
              placeholder="arn:aws:kms:... ou alias/minha-chave" />
          </div>
        )}
      </FormSection>

      <FormSection title="Bloqueio de Acesso Público" description="Configurações de segurança de acesso público">
        {[
          ['block_public_acls', 'Bloquear ACLs públicas'],
          ['block_public_policy', 'Bloquear políticas públicas'],
          ['ignore_public_acls', 'Ignorar ACLs públicas'],
          ['restrict_public_buckets', 'Restringir buckets públicos'],
        ].map(([field, label]) => (
          <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className={toggleCls}
              checked={form[field] !== false}
              onChange={(e) => set(field, e.target.checked)} />
            <span className="text-gray-700 dark:text-gray-300">{label}</span>
          </label>
        ))}
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
