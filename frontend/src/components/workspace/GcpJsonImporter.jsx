import { Upload } from 'lucide-react';

const GcpJsonImporter = ({ setFormData, setLabel }) => {
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        setFormData({
          project_id: json.project_id || '',
          client_email: json.client_email || '',
          private_key_id: json.private_key_id || '',
          private_key: json.private_key || '',
        });
        setLabel((prev) => prev || json.project_id || 'gcp-account');
      } catch {
        alert('Arquivo JSON inválido. Certifique-se de usar o arquivo da Service Account do GCP.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <Upload className="w-4 h-4 text-blue-500 flex-shrink-0" />
      <p className="text-xs text-blue-700 dark:text-blue-300 flex-1">
        Importe o arquivo JSON da Service Account para preencher os campos automaticamente.
      </p>
      <label className="cursor-pointer px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg whitespace-nowrap">
        Importar JSON
        <input type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
      </label>
    </div>
  );
};

export default GcpJsonImporter;
