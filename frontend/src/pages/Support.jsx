import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  LifeBuoy, Plus, Clock, CheckCircle, AlertCircle, Loader2,
  AlertTriangle, ArrowRight, X,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import supportService from '../services/supportService';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  open:           { label: 'Aberto',          cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' },
  in_progress:    { label: 'Em Andamento',    cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' },
  waiting_client: { label: 'Aguardando Você', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800' },
  resolved:       { label: 'Resolvido',       cls: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' },
  closed:         { label: 'Encerrado',       cls: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600' },
};

const PRIORITY_CONFIG = {
  low:    { label: 'Baixa',   cls: 'text-gray-500 dark:text-gray-400' },
  normal: { label: 'Normal',  cls: 'text-blue-600 dark:text-blue-400' },
  high:   { label: 'Alta',    cls: 'text-orange-600 dark:text-orange-400' },
  urgent: { label: 'Urgente', cls: 'text-red-600 dark:text-red-400 font-semibold' },
};

const CATEGORY_LABELS = {
  billing:         'Financeiro',
  technical:       'Técnico',
  feature_request: 'Sugestão',
  other:           'Outro',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function NewTicketModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', category: 'technical', priority: 'normal', message: '' });
  const [error, setError] = useState('');

  const mut = useMutation({
    mutationFn: () => supportService.create(form),
    onSuccess: (data) => {
      onCreated(data.id);
    },
    onError: (e) => setError(e.response?.data?.detail || 'Erro ao criar chamado'),
  });

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Abrir Chamado</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Categoria</span>
              <select
                value={form.category}
                onChange={set('category')}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
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
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
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
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Descrição detalhada</span>
            <textarea
              value={form.message}
              onChange={set('message')}
              rows={5}
              placeholder="Descreva o problema em detalhes, incluindo passos para reproduzir, mensagens de erro, etc."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary resize-none"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.title.trim() || !form.message.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Abrir Chamado
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const Support = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['support-tickets', statusFilter],
    queryFn: () => supportService.list(statusFilter ? { status: statusFilter } : {}),
  });

  const tickets = data?.tickets || [];
  const stats = data?.stats || { open: 0, resolved: 0 };

  const handleCreated = (ticketId) => {
    qc.invalidateQueries({ queryKey: ['support-tickets'] });
    setShowModal(false);
    navigate(`/support/${ticketId}`);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <LifeBuoy size={22} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Suporte</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Abra e acompanhe seus chamados</p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" /> Abrir Chamado
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.open}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Abertos</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.resolved}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Resolvidos</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.open + stats.resolved}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary"
          >
            <option value="">Todos os status</option>
            <option value="open">Aberto</option>
            <option value="in_progress">Em Andamento</option>
            <option value="waiting_client">Aguardando Você</option>
            <option value="resolved">Resolvido</option>
            <option value="closed">Encerrado</option>
          </select>
          <span className="text-sm text-gray-500 dark:text-gray-400">{tickets.length} chamado(s)</span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="card py-16 text-center">
            <LifeBuoy size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum chamado encontrado</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Abrir o primeiro chamado
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Assunto</th>
                  <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">Categoria</th>
                  <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium hidden md:table-cell">Prioridade</th>
                  <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium hidden lg:table-cell">Atualizado em</th>
                  <th className="py-3 px-4 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {tickets.map((t) => {
                  const pCfg = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.normal;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/support/${t.id}`)}
                      className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate">
                        #{t.id.slice(0, 8)} — {t.title}
                      </td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                        {CATEGORY_LABELS[t.category] || t.category}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className={`py-3 px-4 text-xs hidden md:table-cell ${pCfg.cls}`}>
                        {pCfg.label}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                        {fmtDate(t.updated_at)}
                      </td>
                      <td className="py-3 px-4">
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <NewTicketModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </Layout>
  );
};

export default Support;
