import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Webhook, Plus, Trash2, Edit2, Play, RefreshCw,
  Copy, Check, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, XCircle, Clock, AlertCircle,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import PlanGate from '../components/common/PlanGate';
import PermissionGate from '../components/common/PermissionGate';
import webhookService from '../services/webhookService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';

// ── helpers ──────────────────────────────────────────────────────────────────

const PLAN_ORDER = { free: 0, pro: 1, enterprise: 2 };

const EVENT_LABELS = {
  'resource.started':       'Recurso iniciado',
  'resource.stopped':       'Recurso parado',
  'resource.failed':        'Recurso falhou',
  'alert.triggered':        'Alerta disparado',
  'finops.scan.completed':  'Scan FinOps concluído',
  'webhook.test':           'Teste de webhook',
};

function statusIcon(status) {
  if (status === 'success') return <CheckCircle2 size={14} className="text-green-500" />;
  if (status === 'failed')  return <XCircle      size={14} className="text-red-500"   />;
  return                           <Clock        size={14} className="text-yellow-500" />;
}

function httpBadge(code) {
  if (!code) return null;
  const color = code < 300 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-mono ${color}`}>{code}</span>;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-gray-500 dark:text-slate-400" />}
    </button>
  );
}

// ── WebhookModal ──────────────────────────────────────────────────────────────

function WebhookModal({ initial, supportedEvents, onClose, onSaved }) {
  const editing = Boolean(initial);
  const [name, setName]       = useState(initial?.name   || '');
  const [url, setUrl]         = useState(initial?.url    || '');
  const [events, setEvents]   = useState(initial?.events || []);
  const [active, setActive]   = useState(initial?.is_active ?? true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Slack Alerts"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">URL do Endpoint *</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
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
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${active ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
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
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── SecretBanner ──────────────────────────────────────────────────────────────

function SecretBanner({ secret, onDismiss }) {
  return (
    <div className="rounded-xl border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-4 space-y-2">
      <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">
        Guarde o segredo — ele não será exibido novamente!
      </p>
      <div className="flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-yellow-200 dark:border-yellow-700 px-3 py-2 font-mono text-xs text-gray-800 dark:text-slate-200 overflow-x-auto">
        <span className="flex-1 select-all">{secret}</span>
        <CopyButton text={secret} />
      </div>
      <button onClick={onDismiss} className="text-xs text-yellow-700 dark:text-yellow-500 hover:underline">
        Entendido, fechar
      </button>
    </div>
  );
}

// ── DeliveryHistory ───────────────────────────────────────────────────────────

function DeliveryHistory({ webhookId }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['webhook-deliveries', webhookId, page],
    queryFn: () => webhookService.deliveries(webhookId, page),
  });

  if (isLoading) return <p className="text-xs text-gray-500 dark:text-slate-500 py-2 text-center">Carregando…</p>;

  const items = data?.items || [];
  if (items.length === 0) return <p className="text-xs text-gray-500 dark:text-slate-500 py-2 text-center">Sem entregas ainda.</p>;

  return (
    <div className="space-y-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 dark:text-slate-500 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-1 pr-3 font-medium">Evento</th>
            <th className="text-left py-1 pr-3 font-medium">Status</th>
            <th className="text-left py-1 pr-3 font-medium">HTTP</th>
            <th className="text-left py-1 font-medium">Entregue em</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((d) => (
            <tr key={d.id}>
              <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-slate-300">{d.event_type}</td>
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-1">
                  {statusIcon(d.status)}
                  <span className={d.status === 'success' ? 'text-green-600 dark:text-green-400' : d.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}>
                    {d.status}
                  </span>
                </div>
              </td>
              <td className="py-1.5 pr-3">{httpBadge(d.http_status)}</td>
              <td className="py-1.5 text-gray-500 dark:text-slate-500">
                {d.delivered_at ? new Date(d.delivered_at).toLocaleString('pt-BR') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {data?.pages > 1 && (
        <div className="flex items-center gap-2 pt-1 justify-end">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
            ← Anterior
          </button>
          <span className="text-xs text-gray-500 dark:text-slate-500">{page}/{data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}

// ── WebhookCard ───────────────────────────────────────────────────────────────

function WebhookCard({ hook, supportedEvents, onEdit, onDelete }) {
  const qc = useQueryClient();
  const [expanded, setExpanded]         = useState(false);
  const [testing, setTesting]           = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newSecret, setNewSecret]       = useState(null);
  const [feedback, setFeedback]         = useState(null); // { type: 'ok'|'err', msg }

  const flash = (type, msg) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await webhookService.test(hook.id);
      flash('ok', 'Ping enviado! Verifique o histórico de entregas.');
      qc.invalidateQueries(['webhook-deliveries', hook.id]);
    } catch {
      flash('err', 'Falha ao enviar teste.');
    } finally {
      setTesting(false);
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('Rotacionar o segredo invalidará o segredo atual. Continuar?')) return;
    setRegenerating(true);
    try {
      const res = await webhookService.regenerateSecret(hook.id);
      setNewSecret(res.secret);
    } catch {
      flash('err', 'Erro ao rotacionar segredo.');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="card rounded-xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-slate-100 truncate">{hook.name}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${hook.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-slate-400'}`}>
              {hook.is_active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 max-w-full">
            <a href={hook.url} target="_blank" rel="noreferrer"
               className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-xs"
               onClick={(e) => e.stopPropagation()}>
              {hook.url}
            </a>
            <ExternalLink size={10} className="text-gray-400 flex-shrink-0" />
          </div>
        </div>

        <PermissionGate permission="webhooks.manage">
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleTest}
              disabled={testing}
              title="Enviar teste"
              className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <Play size={14} />
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              title="Rotacionar segredo"
              className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => onEdit(hook)}
              title="Editar"
              className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => onDelete(hook)}
              title="Excluir"
              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </PermissionGate>
      </div>

      {/* Events */}
      <div className="flex flex-wrap gap-1.5">
        {(hook.events || []).map((ev) => (
          <span key={ev} className="rounded-full bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 text-xs font-mono text-indigo-700 dark:text-indigo-400">
            {ev}
          </span>
        ))}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${feedback.type === 'ok' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
          {feedback.type === 'ok' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
          {feedback.msg}
        </div>
      )}

      {/* New secret banner */}
      {newSecret && (
        <SecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />
      )}

      {/* Delivery history toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
      >
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        Histórico de entregas
      </button>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
          <DeliveryHistory webhookId={hook.id} />
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const Webhooks = () => {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const plan  = (currentOrg?.plan_tier || 'free').toLowerCase();
  const isPro = (PLAN_ORDER[plan] ?? 0) >= 1;
  const qc    = useQueryClient();

  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [newSecret, setNewSecret]   = useState(null); // secret after create

  const { data, isLoading, error } = useQuery({
    queryKey: ['webhooks', currentWorkspace?.id],
    queryFn: () => webhookService.list(),
    enabled: isPro && Boolean(currentWorkspace),
  });

  const webhooks        = data?.webhooks        || [];
  const supportedEvents = data?.supported_events || [];

  const openCreate = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit   = (h) => { setEditTarget(h);   setModalOpen(true); };

  const handleSaved = (result, isNew) => {
    setModalOpen(false);
    qc.invalidateQueries(['webhooks', currentWorkspace?.id]);
    if (isNew && result.secret) setNewSecret(result.secret);
  };

  const handleDelete = async (hook) => {
    if (!window.confirm(`Excluir o webhook "${hook.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await webhookService.remove(hook.id);
      qc.invalidateQueries(['webhooks', currentWorkspace?.id]);
    } catch {
      alert('Erro ao excluir webhook.');
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-600/20 p-2">
              <Webhook size={20} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Webhooks</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Receba notificações de eventos em tempo real no seu endpoint
              </p>
            </div>
          </div>

          <PermissionGate permission="webhooks.manage">
            <button
              onClick={openCreate}
              disabled={!isPro}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={16} />
              Novo
            </button>
          </PermissionGate>
        </div>

        {/* Plan gate */}
        <PlanGate requiredPlan="pro" currentPlan={plan}>

          {/* Post-create secret banner */}
          {newSecret && (
            <SecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />
          )}

          {/* Loading */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="card rounded-xl p-4 h-28 animate-pulse bg-gray-100 dark:bg-gray-700" />
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="card rounded-xl p-6 text-center text-red-600 dark:text-red-400">
              Erro ao carregar webhooks.
            </div>
          )}

          {/* Empty */}
          {!isLoading && !error && webhooks.length === 0 && (
            <div className="card rounded-xl p-10 text-center space-y-3">
              <Webhook size={32} className="mx-auto text-gray-300 dark:text-slate-600" />
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                Nenhum webhook configurado ainda.
              </p>
              <PermissionGate permission="webhooks.manage">
                <button
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  <Plus size={15} />
                  Criar primeiro webhook
                </button>
              </PermissionGate>
            </div>
          )}

          {/* List */}
          {!isLoading && webhooks.length > 0 && (
            <div className="space-y-3">
              {webhooks.map((hook) => (
                <WebhookCard
                  key={hook.id}
                  hook={hook}
                  supportedEvents={supportedEvents}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {/* Info box */}
          {!isLoading && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-xs text-gray-500 dark:text-slate-500 space-y-1">
              <p className="font-medium text-gray-700 dark:text-slate-300">Como usar</p>
              <p>Cada requisição inclui o header <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">X-CloudHub-Signature</span> com HMAC-SHA256 do payload para verificação de autenticidade.</p>
              <p>Máximo de 10 webhooks por workspace.</p>
            </div>
          )}

        </PlanGate>
      </div>

      {/* Modal */}
      {modalOpen && (
        <WebhookModal
          initial={editTarget}
          supportedEvents={supportedEvents}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </Layout>
  );
};

export default Webhooks;
