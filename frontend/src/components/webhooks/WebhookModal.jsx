import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import webhookService from '../../services/webhookService';

const EVENT_LABELS = {
  'resource.started':       'Recurso iniciado',
  'resource.stopped':       'Recurso parado',
  'resource.failed':        'Recurso falhou',
  'alert.triggered':        'Alerta disparado',
  'finops.scan.completed':  'Scan FinOps concluído',
  'webhook.test':           'Teste de webhook',
};

const WebhookModal = ({ initial, supportedEvents, onClose, onSaved }) => {
  const editing = Boolean(initial);
  const [name, setName]     = useState(initial?.name   || '');
  const [url, setUrl]       = useState(initial?.url    || '');
  const [events, setEvents] = useState(initial?.events || []);
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const toggleEvent = (ev) =>
    setEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !url.trim() || events.length === 0) {
      setError('Preencha nome, URL e selecione pelo menos um evento.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), url: url.trim(), events, is_active: active };
      const result = editing
        ? await webhookService.update(initial.id, payload)
        : await webhookService.create(payload);
      onSaved(result, !editing);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erro ao salvar webhook.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h2 className="font-semibold text-gray-900 dark:text-slate-100">
            {editing ? 'Editar Webhook' : 'Novo Webhook'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nome *</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Slack Alerts"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">URL do Endpoint *</label>
            <input
              value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.example.com/..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Eventos *</label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {supportedEvents.map((ev) => (
                <label key={ev} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-slate-300">
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded mr-2">{ev}</span>
                    {EVENT_LABELS[ev] || ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {editing && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Ativo</label>
              <button
                type="button"
                onClick={() => setActive((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${active ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button
              type="submit" disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WebhookModal;
