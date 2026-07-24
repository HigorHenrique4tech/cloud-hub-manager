import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link2, Plus, RefreshCw, Copy, Mail, AlertTriangle,
  CheckCircle, XCircle, Clock, Trash2, X, Check,
} from 'lucide-react';
import m365Service from '../../services/m365Service';
import { useEscapeKey } from '../../hooks/useEscapeKey';

const GDAP_ROLES = [
  { id: '729827e3-9c14-49f7-bb1b-9608f156bbb8', name: 'Helpdesk Administrator' },
  { id: 'f023fd81-a637-4b56-95fd-791ac0226033', name: 'Service Support Administrator' },
  { id: 'fe930be7-5e62-47db-91af-98c3a49a38b1', name: 'User Administrator' },
  { id: '29232cdf-9323-42fd-afe2-4b33bb6ef9bb', name: 'Exchange Administrator' },
  { id: '69091246-20e8-4a56-aa4d-066075b2a7a8', name: 'Teams Administrator' },
  { id: 'f28a1f50-f6e7-4571-818b-6a12f2af6b6c', name: 'SharePoint Administrator' },
  { id: '194ae4cb-b126-40b2-bd5b-6091b380977d', name: 'Security Administrator' },
  { id: '4d6ac14f-3453-41d0-bef9-a3e0c569773a', name: 'License Administrator' },
];

const ROLE_TEMPLATES = {
  tier1: ['729827e3-9c14-49f7-bb1b-9608f156bbb8', 'f023fd81-a637-4b56-95fd-791ac0226033'],
  tier2: [
    '729827e3-9c14-49f7-bb1b-9608f156bbb8', 'f023fd81-a637-4b56-95fd-791ac0226033',
    'fe930be7-5e62-47db-91af-98c3a49a38b1', '29232cdf-9323-42fd-afe2-4b33bb6ef9bb',
    '69091246-20e8-4a56-aa4d-066075b2a7a8',
  ],
  full: GDAP_ROLES.map(r => r.id),
};

const DURATION_OPTIONS = [
  { label: '90 dias', value: 90 },
  { label: '180 dias', value: 180 },
  { label: '1 ano', value: 365 },
  { label: '2 anos', value: 730 },
];

const STATUS_CONFIG = {
  active:              { label: 'Ativo',             color: 'green',  Icon: CheckCircle },
  approvalPending:     { label: 'Aguardando',       color: 'yellow', Icon: Clock },
  created:             { label: 'Criado',           color: 'blue',   Icon: Clock },
  expiring:            { label: 'Expirando',        color: 'orange', Icon: AlertTriangle },
  expired:             { label: 'Expirado',         color: 'gray',   Icon: XCircle },
  terminated:          { label: 'Encerrado',        color: 'red',    Icon: XCircle },
  terminationRequested:{ label: 'Enc. Solicitado',  color: 'red',    Icon: XCircle },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const colorClass = (color) => ({
  green:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  blue:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  gray:   'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  red:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}[color] || 'bg-gray-100 text-gray-600');

function isExpiringSoon(endDateTime) {
  if (!endDateTime) return false;
  const diff = new Date(endDateTime) - new Date();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
}

function resolveStatus(rel) {
  if (rel.status === 'active' && isExpiringSoon(rel.endDateTime)) return 'expiring';
  return rel.status;
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'gray', Icon: Clock };
  const { label, color, Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${colorClass(color)}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function RelationshipCard({ rel, onTerminate, onInvite, onRenew }) {
  const status = resolveStatus(rel);
  const roles = rel.accessDetails?.unifiedRoles || [];
  const roleNames = roles.map(r => GDAP_ROLES.find(g => g.id === r.roleDefinitionId)?.name || r.roleDefinitionId);
  const canAct = !['expired', 'terminated', 'terminationRequested'].includes(status);

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{rel.displayName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {rel.customer?.displayName || 'Cliente não vinculado'}
              {rel.endDateTime && (
                <span className="ml-2">· Expira {fmtDate(rel.endDateTime)}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {roleNames.slice(0, 4).map(name => (
                <span key={name} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                  {name}
                </span>
              ))}
              {roleNames.length > 4 && (
                <span className="text-xs text-gray-400 dark:text-gray-500 px-1.5 py-0.5">
                  +{roleNames.length - 4} mais
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusBadge status={status} />
          {canAct && (
            <div className="flex items-center gap-1">
              {(status === 'approvalPending' || status === 'active' || status === 'expiring') && rel.inviteUrl && (
                <button
                  onClick={() => onInvite(rel)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  title="Enviar convite"
                >
                  <Mail className="w-4 h-4" />
                </button>
              )}
              {(status === 'active' || status === 'expiring') && (
                <button
                  onClick={() => onRenew(rel)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                  title="Renovar relação"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => onTerminate(rel)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Encerrar relação"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreated, preCustomer = null }) {
  useEscapeKey(true, onClose);
  const [form, setForm] = useState({
    display_name: preCustomer ? `${preCustomer.displayName} - GDAP` : '',
    duration_days: 365,
    roles: [...ROLE_TEMPLATES.tier1],
    auto_extend: false,
    customer_tenant_id: preCustomer?.id || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleRole = (id) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(id) ? f.roles.filter(r => r !== id) : [...f.roles, id],
    }));
  };

  const applyTemplate = (key) => setForm(f => ({ ...f, roles: [...ROLE_TEMPLATES[key]] }));

  const handleSubmit = async () => {
    if (!form.display_name.trim()) { setError('Nome da relação é obrigatório.'); return; }
    if (form.roles.length === 0) { setError('Selecione pelo menos uma role.'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await m365Service.createGdapRelationship(form);
      onCreated(result);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Erro ao criar relação GDAP');
      setLoading(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Nova Relação GDAP</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Requer permissão <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">DelegatedAdminRelationship.ReadWrite.All</code> no App Registration com admin consent.
            </p>
          </div>

          {preCustomer && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Cliente vinculado</p>
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 truncate">{preCustomer.displayName}</p>
                <p className="text-xs text-blue-500 dark:text-blue-400 font-mono truncate">{preCustomer.id}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da Relação *</label>
            <input
              className={inputCls}
              placeholder="Ex: Contoso - Suporte Tier 1"
              value={form.display_name}
              onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Duração</label>
            <select
              className={inputCls}
              value={form.duration_days}
              onChange={e => setForm(f => ({ ...f, duration_days: Number(e.target.value) }))}
            >
              {DURATION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.auto_extend}
              onChange={e => setForm(f => ({ ...f, auto_extend: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Auto-renovar por 180 dias</span>
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Templates Rápidos</label>
            <div className="flex gap-2">
              {[
                { key: 'tier1', label: 'Tier 1 (Suporte)' },
                { key: 'tier2', label: 'Tier 2 (Operador)' },
                { key: 'full',  label: 'Full MSP' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => applyTemplate(t.key)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Permissões ({form.roles.length} selecionada{form.roles.length !== 1 ? 's' : ''})
            </label>
            <div className="space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-48 overflow-y-auto">
              {GDAP_ROLES.map(role => (
                <label key={role.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{role.name}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {loading ? 'Criando...' : 'Criar Relação'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteModal({ rel, onClose }) {
  useEscapeKey(true, onClose);
  const [emails, setEmails] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [error, setError] = useState('');

  const inviteUrl = rel?.inviteUrl || '';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [inviteUrl]);

  const addEmail = () => {
    const e = inputVal.trim();
    if (e && !emails.includes(e)) {
      setEmails(prev => [...prev, e]);
    }
    setInputVal('');
  };

  const handleKeyDown = (ev) => {
    if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); addEmail(); }
  };

  const handleSend = async () => {
    if (emails.length === 0) { setError('Adicione pelo menos um e-mail.'); return; }
    setSending(true);
    setError('');
    try {
      const result = await m365Service.sendGdapInvite(rel.id, emails);
      setSendResult(result);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Erro ao enviar convites');
    } finally {
      setSending(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Enviar Convite GDAP</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <strong>{rel?.displayName}</strong>
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Link de Aprovação</label>
            <div className="flex gap-2">
              <input
                readOnly
                className={`${inputCls} flex-1 text-xs font-mono`}
                value={inviteUrl}
              />
              <button
                onClick={handleCopy}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-1 text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Envie este link para o Administrador Global do tenant cliente. Expira em 30 dias.
            </p>
          </div>

          {!sendResult && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Enviar por E-mail</label>
                <div className="flex gap-2">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="admin@contoso.com"
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={addEmail}
                  />
                  <button
                    onClick={addEmail}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
                  >
                    Adicionar
                  </button>
                </div>
                {emails.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {emails.map(e => (
                      <span key={e} className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        {e}
                        <button onClick={() => setEmails(prev => prev.filter(x => x !== e))}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </>
          )}

          {sendResult && (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">Convites enviados!</p>
              {sendResult.sent?.length > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Enviados: {sendResult.sent.join(', ')}</p>
              )}
              {sendResult.failed?.length > 0 && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Falhas: {sendResult.failed.join(', ')}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Fechar
          </button>
          {!sendResult && (
            <button
              onClick={handleSend}
              disabled={sending || emails.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              {sending ? 'Enviando...' : 'Enviar Convite'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TerminateModal({ rel, onClose, onConfirmed }) {
  useEscapeKey(true, onClose);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await m365Service.terminateGdapRelationship(rel.id);
      onConfirmed();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Erro ao encerrar relação');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Encerrar Relação GDAP</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Você está encerrando a relação:
          </p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            {rel?.displayName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Após encerrada, o acesso delegado será revogado. Esta ação é permanente.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {loading ? 'Encerrando...' : 'Encerrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GdapPanel({ workspaceId, customerTenantId = null, customerDisplayName = null }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [createCustomer, setCreateCustomer] = useState(null);
  const [inviteTarget, setInviteTarget] = useState(null);
  const [terminateTarget, setTerminateTarget] = useState(null);

  const relQ = useQuery({
    queryKey: ['m365', 'gdap', 'relationships', workspaceId],
    queryFn: m365Service.getGdapRelationships,
    refetchInterval: 30000,
  });

  const cusQ = useQuery({
    queryKey: ['m365', 'gdap', 'customers', workspaceId],
    queryFn: m365Service.getGdapCustomers,
    refetchInterval: 60000,
    enabled: !customerTenantId,
  });

  const allRelationships = relQ.data?.relationships || [];

  // Filter by customer if context is provided
  const relationships = customerTenantId
    ? allRelationships.filter(r => r.customer?.tenantId === customerTenantId)
    : allRelationships;

  const filtered = relationships.filter(rel => {
    const status = resolveStatus(rel);
    if (activeTab === 0) return true;
    if (activeTab === 1) return status === 'active';
    if (activeTab === 2) return status === 'approvalPending' || status === 'created';
    if (activeTab === 3) return status === 'expiring';
    return true;
  });

  const tabCounts = [
    relationships.length,
    relationships.filter(r => resolveStatus(r) === 'active').length,
    relationships.filter(r => ['approvalPending', 'created'].includes(resolveStatus(r))).length,
    relationships.filter(r => resolveStatus(r) === 'expiring').length,
  ];

  const openCreate = (customer = null) => {
    // If we have a customer context from props, always pre-fill it
    const preCustomer = customer || (customerTenantId
      ? { id: customerTenantId, displayName: customerDisplayName || customerTenantId }
      : null);
    setCreateCustomer(preCustomer);
    setShowCreate(true);
  };

  const handleCreated = (rel) => {
    setShowCreate(false);
    setCreateCustomer(null);
    qc.invalidateQueries({ queryKey: ['m365', 'gdap', 'relationships'] });
    if (rel.inviteUrl) {
      setInviteTarget(rel);
    }
  };

  const handleTerminated = () => {
    setTerminateTarget(null);
    qc.invalidateQueries({ queryKey: ['m365', 'gdap', 'relationships'] });
  };

  const handleRenew = () => {
    openCreate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {customerTenantId
            ? `Relações GDAP — ${customerDisplayName || customerTenantId}`
            : 'Gerenciar delegações de acesso com tenants de clientes'}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['m365', 'gdap', 'relationships'] })}
            disabled={relQ.isFetching}
            className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${relQ.isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            onClick={() => openCreate()}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Relação
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {['Relações', 'Ativas', 'Aguardando', 'Expirando'].map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === i
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab}
            {tabCounts[i] > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === i
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {tabCounts[i]}
              </span>
            )}
          </button>
        ))}
      </div>

      {relQ.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : relQ.isError ? (
        <div className="card text-center py-12">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {relQ.error?.response?.data?.detail || 'Erro ao carregar relações GDAP'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Link2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {activeTab === 0
              ? 'Nenhuma relação GDAP encontrada. Clique em "Nova Relação" para começar.'
              : 'Nenhuma relação nesta categoria.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(rel => (
            <RelationshipCard
              key={rel.id}
              rel={rel}
              onTerminate={setTerminateTarget}
              onInvite={setInviteTarget}
              onRenew={handleRenew}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => { setShowCreate(false); setCreateCustomer(null); }}
          onCreated={handleCreated}
          preCustomer={createCustomer}
        />
      )}
      {inviteTarget && (
        <InviteModal rel={inviteTarget} onClose={() => setInviteTarget(null)} />
      )}
      {terminateTarget && (
        <TerminateModal
          rel={terminateTarget}
          onClose={() => setTerminateTarget(null)}
          onConfirmed={handleTerminated}
        />
      )}
    </div>
  );
}
