import { useState } from 'react';
import { X, Upload, AlertCircle, RefreshCw } from 'lucide-react';
import { useImportKubeconfig } from '../../hooks/useK8s';

const ImportKubeconfigModal = ({ onClose, onImported }) => {
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const importMut = useImportKubeconfig();

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setRaw(ev.target.result || '');
    reader.readAsText(file);
  };

  const submit = async () => {
    setError('');
    if (!name.trim()) { setError('Informe um nome para o cluster.'); return; }
    if (!raw.trim()) { setError('Cole o conteúdo do kubeconfig.'); return; }
    try {
      // O YAML é parseado e validado no backend.
      await importMut.mutateAsync({ name: name.trim(), kubeconfig_raw: raw });
      onImported?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Falha ao importar.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-cyan-500" /> Importar kubeconfig
          </p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome do cluster</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="ex: prod-cluster"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Conteúdo do kubeconfig (YAML)</label>
              <label className="text-xs text-cyan-600 dark:text-cyan-400 cursor-pointer hover:underline">
                Carregar arquivo
                <input type="file" accept=".yaml,.yml,.config,.txt,*" className="hidden" onChange={handleFile} />
              </label>
            </div>
            <textarea
              value={raw} onChange={e => setRaw(e.target.value)}
              rows={10} placeholder="apiVersion: v1&#10;clusters:&#10;- cluster: ..."
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
            Cancelar
          </button>
          <button onClick={submit} disabled={importMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50">
            {importMut.isPending && <RefreshCw className="w-4 h-4 animate-spin" />}
            Importar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportKubeconfigModal;
