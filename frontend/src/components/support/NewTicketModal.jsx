import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Layers, AlertTriangle, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import supportService from '../../services/supportService';
import orgService from '../../services/orgService';

const DESK_URL = 'https://desk.cloudatlas.app.br';

export default function NewTicketModal({ onClose }) {
  const orgSlug = localStorage.getItem('selectedOrg');
  const [form, setForm] = useState({
    title: '', category: 'technical', priority: 'normal', message: '', workspace_id: '',
  });
  const [submitted, setSubmitted] = useState(null); // ticket id after success
  const [error, setError] = useState('');

  const workspacesQ = useQuery({
    queryKey: ['workspaces', orgSlug],
    queryFn: () => orgService.listWorkspaces(orgSlug),
    enabled: !!orgSlug,
  });
  const workspaces = workspacesQ.data?.workspaces || workspacesQ.data || [];

  const mut = useMutation({
    mutationFn: () =>
      supportService.create({ ...form, workspace_id: form.workspace_id || undefined }),
    onSuccess: (data) => setSubmitted(data.id),
    onError: (e) => setError(e.response?.data?.detail || 'Erro ao criar chamado'),
  });

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Abrir Chamado</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          /* ── Success state ── */
          <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Chamado aberto com sucesso!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Nossa equipe entrará em contato em breve.
              </p>
            </div>
            <a
              href={DESK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Acompanhar no Desk
            </a>
            <button
              onClick={onClose}
              className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Fechar
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <>
            <div className="px-6 py-5 space-y-4">
              {/* Workspace */}
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> Workspace relacionado
                  <span className="text-gray-400">(opcional)</span>
                </span>
                <select
                  value={form.workspace_id}
                  onChange={set('workspace_id')}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                             px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
                >
                  <option value="">Nenhum workspace específico</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Categoria</span>
                  <select
                    value={form.category}
                    onChange={set('category')}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                               px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
                  >
                    <option value="technical">Técnico</option>
                    <option value="billing">Financeiro</option>
                    <option value="feature_request">Sugestão</option>
                    <option value="other">Outro</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Prioridade</span>
                  <select
                    value={form.priority}
                    onChange={set('priority')}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                               px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
                  >
                    <option value="low">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Assunto</span>
                <input
                  value={form.title}
                  onChange={set('title')}
                  placeholder="Descreva brevemente o problema..."
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                             px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Descrição</span>
                <textarea
                  value={form.message}
                  onChange={set('message')}
                  rows={4}
                  placeholder="Descreva o problema em detalhes..."
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                             px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary resize-none"
                />
              </label>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <a
                href={DESK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-primary hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Ver meus tickets
              </a>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm
                             text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => mut.mutate()}
                  disabled={mut.isPending || !form.title.trim() || !form.message.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold
                             hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2
                             active:scale-[0.97]"
                >
                  {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Abrir Chamado
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
