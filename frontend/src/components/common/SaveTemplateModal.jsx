import { useState } from 'react';
import { X, BookmarkPlus, Check } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import templateService from '../../services/templateService';

/**
 * Modal to name and save the current form state as a reusable template.
 *
 * Props:
 *   provider      — 'aws' | 'azure'
 *   resourceType  — 'ec2' | 's3' | 'rds' | etc.
 *   formConfig    — current form state object (will be stored as JSONB)
 *   onClose       — () => void
 */
const SaveTemplateModal = ({ provider, resourceType, formConfig, onClose }) => {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saved, setSaved] = useState(false);

  const saveMut = useMutation({
    mutationFn: () =>
      templateService.createTemplate({
        provider,
        resource_type: resourceType,
        name: name.trim(),
        description: description.trim() || undefined,
        form_config: formConfig,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', provider, resourceType] });
      setSaved(true);
      setTimeout(onClose, 1200);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveMut.mutate();
  };

  const RESOURCE_LABEL = {
    ec2: 'EC2', s3: 'S3', rds: 'RDS', lambda: 'Lambda', vpc: 'VPC',
    vm: 'Azure VM', storage: 'Storage Account', vnet: 'VNet',
    sql: 'SQL Database', app_service: 'App Service',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <BookmarkPlus size={18} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-100">Salvar como Template</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <p className="text-xs text-slate-400">
            Tipo: <span className="font-medium text-slate-300">{RESOURCE_LABEL[resourceType] || resourceType}</span>
            {' · '}
            Provider: <span className="font-medium text-slate-300">{provider?.toUpperCase()}</span>
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Nome do template <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: VM de dev padrão"
              maxLength={255}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Descrição (opcional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Ubuntu 22.04 com 8GB RAM, SG padrão"
              maxLength={500}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {saveMut.isError && (
            <p className="text-xs text-red-400">
              {saveMut.error?.response?.data?.detail || 'Erro ao salvar template.'}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saveMut.isPending || saved}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {saved ? (
                <><Check size={14} /> Salvo!</>
              ) : saveMut.isPending ? (
                'Salvando…'
              ) : (
                <><BookmarkPlus size={14} /> Salvar</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SaveTemplateModal;
