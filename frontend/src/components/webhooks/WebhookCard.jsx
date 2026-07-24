import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Play, RefreshCw, Edit2, Trash2,
  ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, XCircle,
} from 'lucide-react';
import PermissionGate from '../common/PermissionGate';
import SecretBanner from './SecretBanner';
import DeliveryHistory from './DeliveryHistory';
import webhookService from '../../services/webhookService';

const WebhookCard = ({ hook, supportedEvents, onEdit, onDelete }) => {
  const qc = useQueryClient();
  const [expanded, setExpanded]         = useState(false);
  const [testing, setTesting]           = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newSecret, setNewSecret]       = useState(null);
  const [feedback, setFeedback]         = useState(null);

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
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{hook.name}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${hook.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
              {hook.is_active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 max-w-full">
            <a href={hook.url} target="_blank" rel="noreferrer"
               className="text-xs text-primary-dark dark:text-primary-light hover:underline truncate max-w-xs"
               onClick={(e) => e.stopPropagation()}>
              {hook.url}
            </a>
            <ExternalLink size={10} className="text-gray-400 flex-shrink-0" />
          </div>
        </div>

        <PermissionGate permission="webhooks.manage">
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={handleTest} disabled={testing} title="Enviar teste"
              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
              <Play size={14} />
            </button>
            <button onClick={handleRegenerate} disabled={regenerating} title="Rotacionar segredo"
              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => onEdit(hook)} title="Editar"
              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={() => onDelete(hook)} title="Excluir"
              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </PermissionGate>
      </div>

      {/* Events */}
      <div className="flex flex-wrap gap-1.5">
        {(hook.events || []).map((ev) => (
          <span key={ev} className="rounded-full bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 text-xs font-mono text-primary-dark dark:text-primary-light">
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
      {newSecret && <SecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />}

      {/* Delivery history toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
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
};

export default WebhookCard;
