import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Webhook, Plus } from 'lucide-react';
import Layout from '../components/layout/layout';
import PlanGate from '../components/common/PlanGate';
import PermissionGate from '../components/common/PermissionGate';
import WebhookModal from '../components/webhooks/WebhookModal';
import SecretBanner from '../components/webhooks/SecretBanner';
import WebhookCard from '../components/webhooks/WebhookCard';
import webhookService from '../services/webhookService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';

const PLAN_ORDER = { free: 0, basic: 1, standard: 2, enterprise_e1: 3, enterprise_e2: 4, enterprise_e3: 5, enterprise_migration: 6 };

const Webhooks = () => {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const plan  = (currentOrg?.plan_tier || 'free').toLowerCase();
  const isPro = (PLAN_ORDER[plan] ?? 0) >= 1;
  const qc    = useQueryClient();

  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [newSecret, setNewSecret]   = useState(null);

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
            <div className="rounded-lg bg-primary/20 p-2">
              <Webhook size={20} className="text-primary-light" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Webhooks</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Receba notificações de eventos em tempo real no seu endpoint
              </p>
            </div>
          </div>
          <PermissionGate permission="webhooks.manage">
            <button
              onClick={openCreate}
              disabled={!isPro}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={16} /> Novo
            </button>
          </PermissionGate>
        </div>

        {/* Plan gate */}
        <PlanGate requiredPlan="pro" currentPlan={plan}>
          {newSecret && <SecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />}

          {isLoading && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="card rounded-xl p-4 h-28 animate-pulse bg-gray-100 dark:bg-gray-700" />
              ))}
            </div>
          )}

          {error && (
            <div className="card rounded-xl p-6 text-center text-red-600 dark:text-red-400">
              Erro ao carregar webhooks.
            </div>
          )}

          {!isLoading && !error && webhooks.length === 0 && (
            <div className="card rounded-xl p-10 text-center space-y-3">
              <Webhook size={32} className="mx-auto text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhum webhook configurado ainda.</p>
              <PermissionGate permission="webhooks.manage">
                <button
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
                >
                  <Plus size={15} /> Criar primeiro webhook
                </button>
              </PermissionGate>
            </div>
          )}

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

          {!isLoading && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-xs text-gray-500 dark:text-gray-500 space-y-1">
              <p className="font-medium text-gray-700 dark:text-gray-300">Como usar</p>
              <p>Cada requisição inclui o header <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">X-CloudAtlas-Signature</span> com HMAC-SHA256 do payload para verificação de autenticidade.</p>
              <p>Máximo de 10 webhooks por workspace.</p>
            </div>
          )}
        </PlanGate>
      </div>

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
