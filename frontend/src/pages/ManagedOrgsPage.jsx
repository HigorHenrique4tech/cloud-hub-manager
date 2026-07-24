import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Plus, ExternalLink, Trash2, X, Users, Layers, Cloud,
  AlertTriangle, Grid3x3, CheckCircle, XCircle, PlusCircle, Pencil,
  StickyNote, Search, ArrowUpDown, Ban, Palette, RefreshCw,
  ChevronLeft, ChevronRight, CheckSquare, Square, Power, PowerOff,
  Store, Link2, ShieldCheck, AlertCircle, Check, RefreshCcw, Shield,
  Globe, CalendarClock, Package, Activity, CreditCard, Zap,
  Receipt, Download, FileText, DollarSign, Clock, Mail, TrendingUp, FileDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import { AwsIcon, AzureIcon, GcpIcon, M365Icon } from '../components/common/CloudProviderIcons';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import orgService from '../services/orgService';
import m365Service from '../services/m365Service';
import GdapPanel from '../components/gdap/GdapPanel';
import PurchaseSubscriptionModal from './managed/PurchaseSubscriptionModal';

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatRelativeTime = (timestamp) => {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
};

const HEALTH_CONFIG = {
  healthy:  { dot: 'bg-green-500', pulse: true,  label: 'Saudável', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-400' },
  warning:  { dot: 'bg-amber-500', pulse: false, label: 'Alerta',   bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400' },
  critical: { dot: 'bg-red-500',   pulse: false, label: 'Crítico',  bg: 'bg-red-50 dark:bg-red-900/20',     text: 'text-red-700 dark:text-red-400' },
};

const PROVIDER_ICONS = {
  aws:   { icon: AwsIcon,   color: 'text-orange-500' },
  azure: { icon: AzureIcon, color: 'text-sky-500' },
  gcp:   { icon: GcpIcon,   color: 'text-green-500' },
  m365:  { icon: M365Icon,  color: 'text-blue-500' },
};

/* ── Add Partner Modal ───────────────────────────────────────────────────── */

const AddPartnerModal = ({ onClose, onSave, saving }) => {
  useEscapeKey(true, onClose);
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Adicionar Organização Parceira</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nome da organização</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
              placeholder="Ex: TechCorp Solutions"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              Um workspace padrão será criado automaticamente. Você será adicionado como owner.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
            <button onClick={() => name.trim() && onSave(name.trim())} disabled={saving || !name.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-colors">
              {saving ? 'Criando…' : 'Criar Parceira'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Remove Confirm Modal ───────────────────────────────────────────────── */

const RemoveConfirmModal = ({ org, onClose, onConfirm, removing }) => {
  useEscapeKey(true, onClose);
  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertTriangle size={20} className="text-red-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Remover organização parceira?</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{org.name}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        A organização será desvinculada e seu plano será revertido para <strong>Free</strong>. Os dados internos não serão apagados.
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
        <button onClick={onConfirm} disabled={removing}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 transition-colors">
          {removing ? 'Removendo…' : 'Remover'}
        </button>
      </div>
    </div>
  </div>
);
};

/* ── Edit Partner Modal ──────────────────────────────────────────────────── */

const EditPartnerModal = ({ org, onClose, onSave, saving }) => {
  useEscapeKey(true, onClose);
  const [name, setName] = useState(org.name);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Editar Organização</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nome da organização</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none" />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 font-mono">slug: {org.slug} (não muda)</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
            <button onClick={() => name.trim() && onSave(name.trim())} disabled={saving || !name.trim() || name === org.name}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-colors">
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Notes Modal ─────────────────────────────────────────────────────────── */

const NotesModal = ({ org, onClose, onSave, saving }) => {
  useEscapeKey(true, onClose);
  const [notes, setNotes] = useState(org.notes || '');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Notas internas — {org.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} rows={5}
            placeholder="Notas sobre o contrato, contato, SLA, observações internas…"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
            <button onClick={() => onSave(notes)} disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-colors">
              {saving ? 'Salvando…' : 'Salvar nota'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Branding Partner Modal ──────────────────────────────────────────────── */

const BrandingPartnerModal = ({ org, onClose, onSave, saving }) => {
  useEscapeKey(true, onClose);
  const [form, setForm] = useState({
    platform_name: org.branding?.platform_name === 'CloudAtlas' ? '' : (org.branding?.platform_name || ''),
    color_primary: org.branding?.color_primary || '#1E6FD9',
    color_accent: org.branding?.color_accent || '#0EA5E9',
    powered_by: org.branding?.powered_by ?? true,
    email_sender_name: org.branding?.email_sender_name === 'CloudAtlas' ? '' : (org.branding?.email_sender_name || ''),
  });
  const [inherit, setInherit] = useState(!org.has_custom_branding);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-purple-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Personalizar Marca — {org.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Herdar marca da org principal</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Quando ativo, usa a personalização da organização master</p>
            </div>
            <button type="button" role="switch" aria-checked={inherit} onClick={() => setInherit(!inherit)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${inherit ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${inherit ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {!inherit && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nome da Plataforma</label>
                <input value={form.platform_name} onChange={(e) => setForm({ ...form, platform_name: e.target.value })}
                  placeholder="Herdar da org principal" maxLength={100}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cor Primária</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color_primary} onChange={(e) => setForm({ ...form, color_primary: e.target.value })}
                      className="h-9 w-12 rounded border border-gray-300 dark:border-gray-700 cursor-pointer" />
                    <input value={form.color_primary} onChange={(e) => setForm({ ...form, color_primary: e.target.value })}
                      maxLength={7} className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs font-mono text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cor Accent</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color_accent} onChange={(e) => setForm({ ...form, color_accent: e.target.value })}
                      className="h-9 w-12 rounded border border-gray-300 dark:border-gray-700 cursor-pointer" />
                    <input value={form.color_accent} onChange={(e) => setForm({ ...form, color_accent: e.target.value })}
                      maxLength={7} className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs font-mono text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Powered by CloudAtlas</span>
                <button type="button" role="switch" aria-checked={form.powered_by}
                  onClick={() => setForm({ ...form, powered_by: !form.powered_by })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.powered_by ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.powered_by ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Remetente de E-mail</label>
                <input value={form.email_sender_name} onChange={(e) => setForm({ ...form, email_sender_name: e.target.value })}
                  placeholder="Herdar da org principal" maxLength={100}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none" />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
          <button onClick={() => inherit ? onSave(null) : onSave(form)} disabled={saving}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60 transition-colors">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Partner Org Card (Enhanced) ─────────────────────────────────────────── */

const PartnerCard = ({ org, onAccess, onRemove, onEdit, onNotes, onBranding, onInvite, batchMode, isSelected, onToggleSelect }) => {
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
  const fmtBRL = (v) => v?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '—';
  const initials = (name) => name ? name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?';

  const health = HEALTH_CONFIG[org.health_status] || HEALTH_CONFIG.healthy;
  const providers = org.cloud_providers || [];

  const activityAgo = org.last_activity_at
    ? formatRelativeTime(new Date(org.last_activity_at).getTime())
    : null;

  return (
    <div
      className={`rounded-xl border bg-white dark:bg-gray-800/60 p-5 flex flex-col gap-3 transition-all ${
        batchMode && isSelected
          ? 'border-primary ring-2 ring-primary/30'
          : !org.is_active
          ? 'border-red-300/50 dark:border-red-800/40 opacity-70'
          : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 shadow-sm'
      }`}
      onClick={batchMode ? () => onToggleSelect(org.slug) : undefined}
      style={batchMode ? { cursor: 'pointer' } : undefined}
    >
      {/* Top row: health dot + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Batch checkbox */}
        {batchMode && (
          <button onClick={(e) => { e.stopPropagation(); onToggleSelect(org.slug); }} className="flex-shrink-0">
            {isSelected
              ? <CheckSquare size={18} className="text-primary" />
              : <Square size={18} className="text-gray-400 dark:text-gray-600" />
            }
          </button>
        )}

        {/* Health dot */}
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0" title={health.label}>
          {health.pulse && <span className={`absolute inset-0 rounded-full ${health.dot} animate-ping opacity-40`} />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${health.dot}`} />
        </span>

        {/* Health score badge */}
        {org.health_score !== undefined && (
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${health.bg} ${health.text}`}
            title={`Score: ${org.health_score}/100`}>
            {org.health_score}
          </span>
        )}

        {/* Provider icons */}
        {providers.map(p => {
          const cfg = PROVIDER_ICONS[p];
          if (!cfg) return null;
          const Icon = cfg.icon;
          return <Icon key={p} className={`w-3.5 h-3.5 ${cfg.color}`} />;
        })}

        <div className="flex-1" />

        {/* Badges */}
        {!org.is_active && (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-300/50 dark:border-red-800/40 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
            <Ban size={10} /> Suspensa
          </span>
        )}
        {org.has_custom_branding && (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 dark:bg-purple-500/10 border border-purple-300/50 dark:border-purple-500/30 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-400">
            <Palette size={10} /> Marca
          </span>
        )}
        {org.partner_center_id && (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-500/10 border border-blue-300/50 dark:border-blue-500/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
            <Store size={10} /> PC
          </span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 bg-primary/10">
            <Building2 size={18} className="text-primary-light" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{org.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 font-mono truncate">{org.slug}</p>
          </div>
        </div>
        {!batchMode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onEdit(org)} className="p-1.5 text-gray-500 dark:text-gray-600 hover:text-primary-dark dark:hover:text-primary-light hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors rounded" title="Renomear">
              <Pencil size={14} />
            </button>
            <button onClick={() => onNotes(org)} className="p-1.5 text-gray-500 dark:text-gray-600 hover:text-yellow-600 dark:hover:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-500/10 transition-colors rounded" title="Notas internas">
              <StickyNote size={14} />
            </button>
            <button onClick={() => onBranding(org)} title="Personalizar marca"
              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors">
              <Palette size={15} />
            </button>
            <button onClick={() => onInvite(org)} title="Convidar proprietário"
              className="p-1.5 rounded text-gray-500 dark:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
              <Mail size={14} />
            </button>
            <button onClick={() => onRemove(org)} className="p-1.5 text-gray-500 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors rounded" title="Remover parceira">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Owner info */}
      {org.owner_name && (
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 dark:bg-indigo-900/30 text-primary-dark dark:text-primary-light text-[10px] font-bold flex-shrink-0">
            {initials(org.owner_name)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{org.owner_name}</p>
            {org.owner_email && <p className="text-[10px] text-gray-500 dark:text-gray-500 truncate">{org.owner_email}</p>}
          </div>
        </div>
      )}

      {/* Notes preview */}
      {org.notes && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2 px-1 border-l-2 border-yellow-300 dark:border-yellow-600 pl-2">
          {org.notes}
        </p>
      )}

      {/* Connection health bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          {org.cloud_accounts_count > 0 ? (
            <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }} />
          ) : (
            <div className="h-full bg-red-400 rounded-full" style={{ width: '100%' }} />
          )}
        </div>
        <span className="text-[10px] text-gray-500 dark:text-gray-500 whitespace-nowrap font-medium">
          {org.cloud_accounts_count} conta{org.cloud_accounts_count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-100 dark:bg-gray-700/50 px-2 py-1.5 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-gray-100">{org.workspaces_count}</p>
          <p className="text-[10px] text-gray-600 dark:text-gray-500 flex items-center justify-center gap-0.5 font-medium">
            <Layers size={9} /> Workspaces
          </p>
        </div>
        <div className="rounded-lg bg-gray-100 dark:bg-gray-700/50 px-2 py-1.5 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-gray-100">{org.cloud_accounts_count}</p>
          <p className="text-[10px] text-gray-600 dark:text-gray-500 flex items-center justify-center gap-0.5 font-medium">
            <Cloud size={9} /> Contas
          </p>
        </div>
        <div className="rounded-lg bg-gray-100 dark:bg-gray-700/50 px-2 py-1.5 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-gray-100">{org.members_count}</p>
          <p className="text-[10px] text-gray-600 dark:text-gray-500 flex items-center justify-center gap-0.5 font-medium">
            <Users size={9} /> Membros
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 dark:text-gray-500">
          <p>Criada em {fmtDate(org.created_at)}</p>
          {activityAgo && <p className="text-[10px] text-gray-500 dark:text-gray-500">Atividade: {activityAgo}</p>}
        </div>
        {!batchMode && (
          <button onClick={() => onAccess(org)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors">
            Acessar <ExternalLink size={11} />
          </button>
        )}
      </div>
    </div>
  );
};

/* ── Invite Owner Modal ──────────────────────────────────────────────────── */

const InviteOwnerModal = ({ org, masterSlug, onClose }) => {
  useEscapeKey(true, onClose);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inviteMut = useMutation({
    mutationFn: () => orgService.invitePartnerOwner(masterSlug, org.slug, email),
    onSuccess: () => setSuccess(true),
    onError: (err) => setError(err?.response?.data?.detail || 'Erro ao enviar convite'),
  });

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!email.includes('@')) { setError('E-mail inválido'); return; }
    inviteMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Convidar Proprietário</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check size={22} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Convite enviado!</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">O link expirará em 7 dias.</p>
              <button onClick={onClose} className="mt-2 px-4 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary-dark">Fechar</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Convide um usuário externo para se tornar proprietário de{' '}
                <span className="font-semibold text-gray-800 dark:text-gray-200">{org.name}</span>.
                Ele receberá um e-mail com link de acesso.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">E-mail do convidado</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>
                <button type="submit" disabled={inviteMut.isPending || !email}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary-dark disabled:opacity-50 text-white rounded-lg">
                  <Mail size={12} /> {inviteMut.isPending ? 'Enviando...' : 'Enviar convite'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Costs Tab ───────────────────────────────────────────────────────────── */

const CostsTab = ({ orgSlug }) => {
  const [months, setMonths] = useState(6);
  const [editingMarkup, setEditingMarkup] = useState(null);
  const qc = useQueryClient();

  const costsQ = useQuery({
    queryKey: ['consolidated-costs', orgSlug, months],
    queryFn: () => orgService.getConsolidatedCosts(orgSlug, months),
    enabled: Boolean(orgSlug),
    staleTime: 5 * 60_000,
  });

  const markupMut = useMutation({
    mutationFn: ({ partnerSlug, value }) => orgService.updatePartnerMarkup(orgSlug, partnerSlug, value),
    onSuccess: () => {
      setEditingMarkup(null);
      qc.invalidateQueries({ queryKey: ['consolidated-costs'] });
      qc.invalidateQueries({ queryKey: ['managed-orgs'] });
    },
  });

  const fmtCost = (v) => `$${(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (costsQ.isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (costsQ.isError) return (
    <div className="rounded-lg border border-red-300/50 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-600 dark:text-red-400">
      Erro ao carregar custos consolidados.
    </div>
  );

  const { partners = [], month_list = [], total_cost = 0 } = costsQ.data || {};

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custos Consolidados por Parceira</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Valores com markup aplicado · Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{fmtCost(total_cost)}</span>
          </p>
        </div>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))}
          className="text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary">
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
        </select>
      </div>

      {partners.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <TrendingUp size={40} className="mb-3 opacity-20" />
          <p className="text-sm">Nenhum dado de custo disponível para este período.</p>
          <p className="text-xs mt-1 text-gray-400 dark:text-gray-600">Os custos são coletados automaticamente pelo FinOps.</p>
        </div>
      ) : (
        <div className="card rounded-2xl overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Parceira</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Markup</th>
                {month_list.map(ym => (
                  <th key={ym} className="px-3 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{ym}</th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {partners.map((p) => (
                <tr key={p.slug} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${p.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingMarkup?.slug === p.slug ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number" min={0} max={200} step={0.1}
                          value={editingMarkup.value}
                          onChange={(e) => setEditingMarkup(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                          className="w-16 px-2 py-0.5 text-xs rounded border border-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none"
                          autoFocus
                        />
                        <span className="text-xs text-gray-400">%</span>
                        <button onClick={() => markupMut.mutate({ partnerSlug: p.slug, value: editingMarkup.value })}
                          disabled={markupMut.isPending}
                          className="p-0.5 rounded text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                          <Check size={12} />
                        </button>
                        <button onClick={() => setEditingMarkup(null)}
                          className="p-0.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingMarkup({ slug: p.slug, value: p.cost_markup_pct })}
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary-light transition-colors rounded px-1.5 py-0.5 hover:bg-primary/5">
                        {p.cost_markup_pct}% <Pencil size={9} className="opacity-50" />
                      </button>
                    )}
                  </td>
                  {month_list.map(ym => (
                    <td key={ym} className="px-3 py-3 text-right text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {(p.costs_by_month[ym] || 0) > 0 ? fmtCost(p.costs_by_month[ym]) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {fmtCost(p.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <td colSpan={2} className="px-4 py-3 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Total</td>
                {month_list.map(ym => {
                  const t = partners.reduce((s, p) => s + (p.costs_by_month[ym] || 0), 0);
                  return (
                    <td key={ym} className="px-3 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {t > 0 ? fmtCost(t) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right text-sm font-bold text-primary dark:text-primary-light whitespace-nowrap">{fmtCost(total_cost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

/* ── M365 Tenants Tab ────────────────────────────────────────────────────── */

const M365TenantsTab = ({ orgSlug, onAccess }) => {
  const tenantsQ = useQuery({
    queryKey: ['m365-tenants-summary', orgSlug],
    queryFn: () => m365Service.getTenantsSummary(orgSlug),
    enabled: Boolean(orgSlug),
    retry: false,
  });

  if (tenantsQ.isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (tenantsQ.isError) {
    return (
      <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
        Erro ao carregar tenants M365.
      </div>
    );
  }

  const tenants = tenantsQ.data?.tenants || [];
  const connectedCount = tenants.filter((t) => t.connected).length;

  if (tenants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
        <Grid3x3 size={48} className="mb-4 opacity-20" />
        <p className="text-base font-medium">Nenhuma organização parceira encontrada</p>
        <p className="text-sm mt-1">Adicione parceiros para visualizar seus tenants M365</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {connectedCount} de {tenants.length} workspace(s) com M365 conectado
      </p>
      <div className="card rounded-2xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800/60">
            <tr>
              {['Organização', 'Workspace', 'Tenant', 'Usuários', 'Licenças', 'Equipes', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {tenants.map((t, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="px-4 py-3">
                  <button onClick={() => onAccess(t.org_slug)} className="text-sm font-medium text-primary-dark dark:text-primary-light hover:underline">
                    {t.org_name}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{t.workspace_name}</td>
                <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 font-mono">{t.tenant_domain || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{t.overview?.total_users ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {t.overview ? `${t.overview.assigned_licenses} / ${t.overview.total_licenses}` : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{t.overview?.total_teams ?? '—'}</td>
                <td className="px-4 py-3">
                  {t.error ? (
                    <span className="flex items-center gap-1 text-xs text-red-500"><XCircle size={12} /> Erro</span>
                  ) : t.connected ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle size={12} /> Conectado</span>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500">Não configurado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ── Customer Detail Drawer ──────────────────────────────────────────────── */

const SUB_TABS = ['Visão Geral', 'Assinaturas', 'GDAP'];

const fmtSubDate = (d) => d
  ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

function isAzure(sub) {
  const n = (sub.offer_name || '').toLowerCase();
  return n.includes('azure') || sub.unit_type === 'Usage-Based';
}

function SubStatusBadge({ status }) {
  const active = status === 'active';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
      active
        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    }`}>
      {active ? <CheckCircle size={10} /> : <XCircle size={10} />}
      {active ? 'Ativo' : status === 'suspended' ? 'Suspenso' : status}
    </span>
  );
}

function SubscriptionRow({ sub, onEditQuantity }) {
  const canEditQty = onEditQuantity && !isAzure(sub) && sub.status === 'active';
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700/60 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{sub.offer_name || sub.friendly_name}</p>
        {sub.friendly_name && sub.friendly_name !== sub.offer_name && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{sub.friendly_name}</p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-right">
        {!isAzure(sub) && (
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium inline-flex items-center gap-1.5">
            {sub.quantity} {sub.unit_type === 'Licenses' ? 'licença' : 'seat'}{sub.quantity !== 1 ? 's' : ''}
            {canEditQty && (
              <button
                onClick={() => onEditQuantity(sub)}
                className="p-0.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                title="Alterar quantidade"
              >
                <Pencil size={12} />
              </button>
            )}
          </span>
        )}
        <div className="text-right">
          <SubStatusBadge status={sub.status} />
          {sub.commitment_end_date && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              Renova {fmtSubDate(sub.commitment_end_date)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Edit Subscription Quantity Modal ────────────────────────────────────── */

const EditQuantityModal = ({ sub, onClose, onSubmit, isPending, error }) => {
  useEscapeKey(true, onClose);
  const [quantity, setQuantity] = useState(sub?.quantity || 1);
  if (!sub) return null;
  const submit = (e) => {
    e.preventDefault();
    if (quantity < 1 || quantity === sub.quantity) return;
    onSubmit(quantity);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Alterar quantidade</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{sub.offer_name || sub.friendly_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Atual: {sub.quantity} licença{sub.quantity !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nova quantidade</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending || quantity < 1 || quantity === sub.quantity}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg"
          >
            {isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
};

const OverviewTab = ({ customer, subs, relQ, onEditQuantity }) => {
  const azure = (subs || []).filter(isAzure);
  const m365 = (subs || []).filter(s => !isAzure(s));
  const activeCount = (subs || []).filter(s => s.status === 'active').length;
  const suspendedCount = (subs || []).filter(s => s.status === 'suspended').length;
  const gdapActive = (relQ?.data?.relationships || []).filter(r => r.status === 'active' && r.customer?.tenantId === customer.tenant_id).length;

  const stats = [
    { label: 'Assinaturas ativas', value: activeCount, icon: CheckCircle, color: 'text-green-500' },
    { label: 'Suspensas', value: suspendedCount, icon: XCircle, color: 'text-red-500' },
    { label: 'Licenças M365', value: m365.reduce((a, s) => a + (s.quantity || 0), 0), icon: Package, color: 'text-blue-500' },
    { label: 'GDAP ativo', value: gdapActive, icon: Shield, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-5">
      {/* Customer info */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-2.5">
        {[
          { label: 'Domínio', value: customer.domain, icon: Globe },
          { label: 'Tenant ID', value: customer.tenant_id, icon: Building2, mono: true },
          { label: 'País', value: customer.country || '—', icon: Globe },
          { label: 'Relacionamento', value: customer.relationship_to_partner || '—', icon: Link2 },
        ].map(({ label, value, icon: Icon, mono }) => value && (
          <div key={label} className="flex items-center gap-3">
            <Icon size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <span className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">{label}</span>
            <span className={`text-xs text-gray-800 dark:text-gray-200 truncate ${mono ? 'font-mono' : 'font-medium'}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-3 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-700`}>
              <Icon size={16} className={color} />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Azure plans summary */}
      {azure.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Zap size={11} /> Azure ({azure.length})
          </p>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 px-4 divide-y divide-gray-100 dark:divide-gray-700/60">
            {azure.map(s => <SubscriptionRow key={s.id} sub={s} onEditQuantity={onEditQuantity} />)}
          </div>
        </div>
      )}

      {/* M365 plans summary */}
      {m365.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Package size={11} /> Microsoft 365 ({m365.length})
          </p>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 px-4 divide-y divide-gray-100 dark:divide-gray-700/60">
            {m365.slice(0, 5).map(s => <SubscriptionRow key={s.id} sub={s} onEditQuantity={onEditQuantity} />)}
            {m365.length > 5 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
                +{m365.length - 5} assinaturas — veja na aba Assinaturas
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SubscriptionsTab = ({ subs, loading, onEditQuantity, onPurchase, canPurchase }) => {
  const [filter, setFilter] = useState('all');

  if (loading) return <div className="flex justify-center py-10"><LoadingSpinner /></div>;

  const azure = (subs || []).filter(isAzure);
  const m365 = (subs || []).filter(s => !isAzure(s));
  const visible = filter === 'azure' ? azure : filter === 'm365' ? m365 : (subs || []);
  const activeCount = (subs || []).filter(s => s.status === 'active').length;
  const suspendedCount = (subs || []).filter(s => s.status === 'suspended').length;

  if (!subs || subs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
      <Package size={36} className="mb-3 opacity-20" />
      <p className="text-sm mb-3">Nenhuma assinatura encontrada</p>
      {canPurchase && (
        <button
          onClick={onPurchase}
          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <PlusCircle size={13} className="mr-1.5" /> Nova Assinatura
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Summary row + Purchase button */}
      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
          <CheckCircle size={13} /> {activeCount} ativa{activeCount !== 1 ? 's' : ''}
        </span>
        {suspendedCount > 0 && (
          <span className="flex items-center gap-1 text-red-500 font-medium">
            <XCircle size={13} /> {suspendedCount} suspensa{suspendedCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="text-gray-400 dark:text-gray-500 text-xs ml-auto">{subs.length} total</span>
        {canPurchase && (
          <button
            onClick={onPurchase}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            <PlusCircle size={12} className="mr-1" /> Nova
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {[
          { key: 'all', label: `Todas (${subs.length})` },
          { key: 'm365', label: `M365 (${m365.length})` },
          { key: 'azure', label: `Azure (${azure.length})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 px-4 divide-y divide-gray-100 dark:divide-gray-700/60">
        {visible.length === 0 ? (
          <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-6">Nenhuma assinatura nesta categoria</p>
        ) : (
          visible.map(s => <SubscriptionRow key={s.id} sub={s} onEditQuantity={onEditQuantity} />)
        )}
      </div>

      {/* Expiring soon */}
      {(() => {
        const soon = subs.filter(s => {
          if (!s.commitment_end_date) return false;
          const diff = new Date(s.commitment_end_date) - new Date();
          return diff > 0 && diff < 45 * 24 * 60 * 60 * 1000;
        });
        if (soon.length === 0) return null;
        return (
          <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-2">
              <CalendarClock size={12} /> {soon.length} renovação{soon.length !== 1 ? 'ões' : ''} em até 45 dias
            </p>
            {soon.map(s => (
              <p key={s.id} className="text-xs text-amber-700 dark:text-amber-300">
                · {s.offer_name} — {fmtSubDate(s.commitment_end_date)}
              </p>
            ))}
          </div>
        );
      })()}
    </div>
  );
};

const CustomerDetailDrawer = ({ customer, workspaceId, orgSlug, onClose }) => {
  useEscapeKey(true, onClose);
  const [tab, setTab] = useState(0);
  const [editQtySub, setEditQtySub] = useState(null);
  const [editQtyError, setEditQtyError] = useState(null);
  const [showPurchase, setShowPurchase] = useState(false);
  const qc = useQueryClient();

  const subsQ = useQuery({
    queryKey: ['pc-subs', orgSlug, workspaceId, customer.id],
    queryFn: () => orgService.pcGetSubscriptions(orgSlug, workspaceId, customer.id),
    enabled: Boolean(customer.id),
    staleTime: 5 * 60_000,
  });

  const relQ = useQuery({
    queryKey: ['m365', 'gdap', 'relationships', workspaceId],
    queryFn: m365Service.getGdapRelationships,
    staleTime: 30_000,
  });

  const updateQtyMut = useMutation({
    mutationFn: (newQty) => orgService.pcUpdateSubscriptionQuantity(
      orgSlug, workspaceId, customer.id, editQtySub.id, newQty,
    ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pc-subs', orgSlug, workspaceId, customer.id] });
      setEditQtySub(null);
      setEditQtyError(null);
      if (data?.async) {
        // eslint-disable-next-line no-alert
        alert('Alteração agendada — pode levar alguns minutos para refletir.');
      }
    },
    onError: (err) => {
      setEditQtyError(err?.response?.data?.detail || 'Falha ao alterar quantidade.');
    },
  });

  const handleEditQuantity = (sub) => {
    setEditQtyError(null);
    setEditQtySub(sub);
  };

  const subs = subsQ.data?.subscriptions || [];
  const initials = customer.name
    ? customer.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{customer.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{customer.domain}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 px-6">
          {SUB_TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === i
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {t}
              {i === 1 && subs.length > 0 && (
                <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full ${tab === i ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                  {subs.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 0 && (
            <OverviewTab customer={customer} subs={subsQ.isLoading ? null : subs} relQ={relQ} onEditQuantity={handleEditQuantity} />
          )}
          {tab === 1 && (
            <SubscriptionsTab
              subs={subs}
              loading={subsQ.isLoading}
              onEditQuantity={handleEditQuantity}
              onPurchase={() => setShowPurchase(true)}
              canPurchase={Boolean(customer.country)}
            />
          )}
          {tab === 2 && (
            <GdapPanel
              workspaceId={workspaceId}
              customerTenantId={customer.tenant_id}
              customerDisplayName={customer.name}
            />
          )}
        </div>
      </div>
      {editQtySub && (
        <EditQuantityModal
          sub={editQtySub}
          onClose={() => { setEditQtySub(null); setEditQtyError(null); }}
          onSubmit={(qty) => updateQtyMut.mutate(qty)}
          isPending={updateQtyMut.isPending}
          error={editQtyError}
        />
      )}
      {showPurchase && (
        <PurchaseSubscriptionModal
          customer={customer}
          orgSlug={orgSlug}
          workspaceId={workspaceId}
          onClose={() => setShowPurchase(false)}
          onPurchased={() => {
            setShowPurchase(false);
            qc.invalidateQueries({ queryKey: ['pc-subs', orgSlug, workspaceId, customer.id] });
          }}
        />
      )}
    </>
  );
};

/* ── Partner Center — Invoice helpers ────────────────────────────────────── */

const fmtInvDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtInvCurrency = (value, currency) => {
  if (value == null) return '—';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'USD' }).format(value); }
  catch { return `${currency || ''} ${Number(value).toFixed(2)}`; }
};

const INV_STATUS = {
  paid:    { label: 'Paga',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', Icon: CheckCircle },
  unpaid:  { label: 'Em aberto', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', Icon: Clock },
  pending: { label: 'Pendente',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',     Icon: Clock },
  overdue: { label: 'Vencida',   cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',         Icon: AlertCircle },
};

function InvStatusBadge({ status }) {
  const cfg = INV_STATUS[(status || '').toLowerCase()] || { label: status || '—', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', Icon: FileText };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      <cfg.Icon size={11} /> {cfg.label}
    </span>
  );
}

function InvoiceDrawer({ invoice, orgSlug, workspaceId, onClose }) {
  useEscapeKey(true, onClose);
  const [tab, setTab] = useState(0);
  const TABS = ['Resumo', 'Itens M365 / Onetime', 'Uso Azure'];

  const onetimeQ = useQuery({
    queryKey: ['pc-invoice-lineitems', invoice.id, 'onetime'],
    queryFn: () => orgService.pcGetInvoiceLineItems(orgSlug, workspaceId, invoice.id, { provider: 'onetime', line_item_type: 'billinglineitems' }),
    enabled: tab === 1,
    staleTime: 30 * 60_000,
  });

  const azureQ = useQuery({
    queryKey: ['pc-invoice-lineitems', invoice.id, 'azure'],
    queryFn: () => orgService.pcGetInvoiceLineItems(orgSlug, workspaceId, invoice.id, { provider: 'azure', line_item_type: 'usagelineitems' }),
    enabled: tab === 2,
    staleTime: 30 * 60_000,
  });

  const groupedOnetime = useMemo(() => {
    const items = onetimeQ.data?.items || [];
    const groups = new Map();
    for (const item of items) {
      const key = item.customer_name || item.customer_id || 'Sem cliente';
      if (!groups.has(key)) groups.set(key, { items: [], totals: {} });
      const g = groups.get(key);
      g.items.push(item);
      const cur = item.currency || 'USD';
      g.totals[cur] = (g.totals[cur] || 0) + (Number(item.amount) || 0);
    }
    return Array.from(groups.entries());
  }, [onetimeQ.data]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">Fatura {invoice.id}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {fmtInvDate(invoice.invoice_date)} · {fmtInvCurrency(invoice.total_amount, invoice.currency_code)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 px-6">
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === i ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 0 && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Período', value: `${fmtInvDate(invoice.billing_period_start)} → ${fmtInvDate(invoice.billing_period_end)}` },
                { label: 'Data da fatura', value: fmtInvDate(invoice.invoice_date) },
                { label: 'Vencimento', value: fmtInvDate(invoice.due_date) },
                { label: 'Valor total', value: fmtInvCurrency(invoice.total_amount, invoice.currency_code) },
                { label: 'Valor pago', value: fmtInvCurrency(invoice.paid_amount, invoice.currency_code) },
                { label: 'Status', value: <InvStatusBadge status={invoice.status} /> },
              ].map(({ label, value }) => (
                <div key={label} className="card p-3">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">{value}</p>
                </div>
              ))}
            </div>
          )}
          {tab === 1 && (
            onetimeQ.isLoading ? <div className="flex justify-center py-10"><LoadingSpinner /></div>
            : onetimeQ.isError ? <p className="text-sm text-red-500 py-10 text-center">{onetimeQ.error?.response?.data?.detail || 'Erro ao carregar itens'}</p>
            : groupedOnetime.length === 0 ? <p className="text-sm text-gray-400 text-center py-10">Nenhum item Onetime nesta fatura.</p>
            : <div className="space-y-4">
                {groupedOnetime.map(([customer, { items, totals }]) => (
                  <div key={customer} className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Building2 size={14} className="text-blue-500" />{customer}</p>
                      <div className="text-right text-xs text-gray-500">
                        {Object.entries(totals).map(([cur, sum]) => <p key={cur} className="font-medium text-gray-900 dark:text-gray-100">{fmtInvCurrency(sum, cur)}</p>)}
                        <p>{items.length} item(s)</p>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                      {items.map((it, idx) => (
                        <div key={idx} className="py-2 flex items-start gap-3 text-xs">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{it.product_name || it.subscription_description || it.sku_name}</p>
                            <p className="text-gray-400 truncate">{it.charge_type} · qty {it.quantity} · {fmtInvDate(it.charge_start_date)} → {fmtInvDate(it.charge_end_date)}</p>
                          </div>
                          <p className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmtInvCurrency(it.amount, it.currency)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
          )}
          {tab === 2 && (
            azureQ.isLoading ? <div className="flex justify-center py-10"><LoadingSpinner /></div>
            : azureQ.isError ? <p className="text-sm text-red-500 py-10 text-center">{azureQ.error?.response?.data?.detail || 'Erro ao carregar uso Azure'}</p>
            : (azureQ.data?.items || []).length === 0 ? <p className="text-sm text-gray-400 text-center py-10">Nenhum item de uso Azure nesta fatura.</p>
            : <div className="card p-4">
                <p className="text-xs text-gray-500 mb-3">{azureQ.data.items.length} registro(s)</p>
                <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[60vh] overflow-y-auto">
                  {azureQ.data.items.slice(0, 200).map((it, idx) => (
                    <div key={idx} className="py-2 flex items-start gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{it.customer_name} — {it.product_name || it.sku_name}</p>
                        <p className="text-gray-400 truncate">qty {it.quantity} · {fmtInvDate(it.charge_start_date)}</p>
                      </div>
                      <p className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmtInvCurrency(it.amount, it.currency)}</p>
                    </div>
                  ))}
                  {azureQ.data.items.length > 200 && <p className="text-xs text-gray-400 text-center py-2">Mostrando 200 de {azureQ.data.items.length}</p>}
                </div>
              </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Partner Center Tab ──────────────────────────────────────────────────── */

const PC_PER_PAGE = 20;

const PartnerCenterTab = ({ orgSlug, workspaceId }) => {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [gdapCustomer, setGdapCustomer] = useState(null);
  const [pcSearch, setPcSearch] = useState('');
  const [pcPage, setPcPage] = useState(1);
  const [pcSubTab, setPcSubTab] = useState('clientes');

  const statusQ = useQuery({
    queryKey: ['pc-status', orgSlug, workspaceId],
    queryFn: () => orgService.pcStatus(orgSlug, workspaceId),
    enabled: Boolean(orgSlug && workspaceId),
    retry: false,
    staleTime: 60_000,
  });

  const customersQ = useQuery({
    queryKey: ['pc-customers', orgSlug, workspaceId],
    queryFn: () => orgService.pcListCustomers(orgSlug, workspaceId),
    enabled: Boolean(statusQ.data?.configured && statusQ.data?.token_valid),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const importMut = useMutation({
    mutationFn: (customer) => orgService.pcImportCustomer(orgSlug, workspaceId, {
      customer_id: customer.id,
      customer_name: customer.name,
      customer_tenant_id: customer.tenant_id,
    }),
    onSuccess: (_, customer) => {
      qc.invalidateQueries({ queryKey: ['pc-customers'] });
      qc.invalidateQueries({ queryKey: ['managed-orgs'] });
    },
  });

  const syncMut = useMutation({
    mutationFn: () => orgService.pcSyncCustomers(orgSlug, workspaceId, [...selected]),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['pc-customers'] });
      qc.invalidateQueries({ queryKey: ['managed-orgs'] });
    },
  });

  // Faturas
  const [invSearch, setInvSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const invoicesQ = useQuery({
    queryKey: ['pc-invoices', orgSlug, workspaceId],
    queryFn: () => orgService.pcListInvoices(orgSlug, workspaceId, { size: 200, offset: 0 }),
    enabled: Boolean(pcSubTab === 'faturas' && statusQ.data?.configured && statusQ.data?.token_valid),
    staleTime: 30 * 60_000,
  });

  const filteredInvoices = useMemo(() => {
    const list = invoicesQ.data?.invoices || [];
    if (!invSearch.trim()) return list;
    const q = invSearch.toLowerCase();
    return list.filter(inv => (inv.id || '').toLowerCase().includes(q) || (inv.status || '').toLowerCase().includes(q));
  }, [invoicesQ.data, invSearch]);

  const invStats = useMemo(() => {
    const list = invoicesQ.data?.invoices || [];
    const totals = {}, dueTotals = {};
    for (const inv of list) {
      const cur = inv.currency_code || 'USD';
      totals[cur] = (totals[cur] || 0) + (Number(inv.total_amount) || 0);
      if (['unpaid','pending','overdue'].includes((inv.status || '').toLowerCase())) {
        dueTotals[cur] = (dueTotals[cur] || 0) + Math.max(0, (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0));
      }
    }
    return { totals, dueTotals, count: list.length };
  }, [invoicesQ.data]);

  const downloadPdf = async (invoiceId) => {
    setDownloading(invoiceId);
    try {
      const { url } = await orgService.pcGetInvoicePdfUrl(orgSlug, workspaceId, invoiceId);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (err) {
      alert(err.response?.data?.detail || 'Falha ao obter PDF.');
    } finally {
      setDownloading(null);
    }
  };

  // Loading state
  if (statusQ.isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }

  // Not configured
  if (!statusQ.data?.configured) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
          <Store size={28} className="text-blue-500" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Partner Center não configurado
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
            Configure as credenciais do Microsoft Partner Center (CSP) para listar e importar clientes automaticamente.
          </p>
        </div>
        <a
          href="/security/automation"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
        >
          <ShieldCheck size={15} /> Ir para Segurança &gt; Partner Center
        </a>
      </div>
    );
  }

  // Token invalid
  if (statusQ.data?.configured && !statusQ.data?.token_valid) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Token inválido</p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">{statusQ.data.error}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Atualize as credenciais em <strong>Segurança &gt; Partner Center</strong>.
          </p>
        </div>
      </div>
    );
  }

  const customers = customersQ.data?.customers || [];
  const syncedCount = customers.filter((c) => c.synced).length;

  const filteredCustomers = pcSearch.trim()
    ? customers.filter((c) =>
        c.name?.toLowerCase().includes(pcSearch.toLowerCase()) ||
        c.domain?.toLowerCase().includes(pcSearch.toLowerCase()) ||
        c.tenant_id?.toLowerCase().includes(pcSearch.toLowerCase())
      )
    : customers;

  const pcTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / PC_PER_PAGE));
  const safePage = Math.min(pcPage, pcTotalPages);
  const paginatedCustomers = filteredCustomers.slice((safePage - 1) * PC_PER_PAGE, safePage * PC_PER_PAGE);

  const handlePcSearch = (val) => { setPcSearch(val); setPcPage(1); setSelected(new Set()); };

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    const unsynced = paginatedCustomers.filter((c) => !c.synced).map((c) => c.id);
    if (unsynced.every((id) => selected.has(id))) {
      setSelected((prev) => { const next = new Set(prev); unsynced.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); unsynced.forEach((id) => next.add(id)); return next; });
    }
  };

  return (
    <div className="space-y-4">
      {gdapCustomer && (
        <CustomerDetailDrawer
          customer={gdapCustomer}
          workspaceId={workspaceId}
          orgSlug={orgSlug}
          onClose={() => setGdapCustomer(null)}
        />
      )}
      {selectedInvoice && (
        <InvoiceDrawer
          invoice={selectedInvoice}
          orgSlug={orgSlug}
          workspaceId={workspaceId}
          onClose={() => setSelectedInvoice(null)}
        />
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 shadow-sm">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {customersQ.isLoading ? '...' : customersQ.data?.total ?? 0}
          </p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">Clientes CSP</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">no Partner Center</p>
        </div>
        <div className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 shadow-sm">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{syncedCount}</p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">Importados</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">como orgs parceiras</p>
        </div>
        <div className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tenant Partner</p>
          <p className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
            {statusQ.data?.partner_tenant_id}
          </p>
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mt-1">
            <Check size={11} /> Conectado
          </span>
        </div>
      </div>

      {/* Sub-abas: Clientes / Faturas */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
        {[
          { key: 'clientes', label: 'Clientes', Icon: Building2 },
          { key: 'faturas',  label: 'Faturas',  Icon: Receipt },
        ].map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setPcSubTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              pcSubTab === key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {pcSubTab === 'clientes' && <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={pcSearch}
            onChange={(e) => handlePcSearch(e.target.value)}
            placeholder="Buscar por nome, domínio ou tenant ID…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {selected.size > 0
            ? `${selected.size} selecionado(s)`
            : `${filteredCustomers.length}${pcSearch ? ` de ${customers.length}` : ''} cliente(s)`}
        </p>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => customersQ.refetch()}
            disabled={customersQ.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCcw size={12} className={customersQ.isFetching ? 'animate-spin' : ''} />
            Atualizar
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {syncMut.isPending ? <RefreshCcw size={12} className="animate-spin" /> : <Link2 size={12} />}
              Importar {selected.size} selecionado(s)
            </button>
          )}
        </div>
      </div>

      {syncMut.isSuccess && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2.5 text-sm text-green-700 dark:text-green-400">
          {syncMut.data?.message}
          {syncMut.data?.errors?.length > 0 && (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              ({syncMut.data.errors.length} erro(s))
            </span>
          )}
        </div>
      )}

      {/* Customer table */}
      {customersQ.isLoading ? (
        <div className="flex justify-center py-10"><LoadingSpinner /></div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <Store size={40} className="mb-3 opacity-20" />
          <p className="text-sm">Nenhum cliente encontrado no Partner Center</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <Search size={32} className="mb-3 opacity-20" />
          <p className="text-sm">Nenhum cliente corresponde a "{pcSearch}"</p>
          <button onClick={() => handlePcSearch('')} className="mt-2 text-xs text-blue-500 hover:underline">Limpar busca</button>
        </div>
      ) : (
        <div className="card rounded-2xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={paginatedCustomers.filter((c) => !c.synced).length > 0 &&
                             paginatedCustomers.filter((c) => !c.synced).every((c) => selected.has(c.id))}
                    onChange={toggleAll}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                </th>
                {['Cliente', 'Domínio', 'Tenant ID', 'País', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3">
                    {c.synced ? (
                      <Check size={14} className="text-green-500" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setGdapCustomer(c)} className="text-left group">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{c.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{c.id}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{c.domain || '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-400 dark:text-gray-500">
                    {c.tenant_id ? `${c.tenant_id.slice(0, 8)}…` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{c.country || '—'}</td>
                  <td className="px-4 py-3">
                    {c.synced ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                        <Check size={10} /> Importado
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">Não importado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {!c.synced && (
                        <button
                          onClick={() => importMut.mutate(c)}
                          disabled={importMut.isPending}
                          className="text-xs font-medium text-primary-dark dark:text-primary-light hover:underline disabled:opacity-50"
                        >
                          Importar
                        </button>
                      )}
                      <button
                        onClick={() => setGdapCustomer(c)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        title="Ver detalhes do cliente"
                      >
                        <Activity size={11} /> Detalhes
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pcTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Mostrando {((safePage - 1) * PC_PER_PAGE) + 1}–{Math.min(safePage * PC_PER_PAGE, filteredCustomers.length)} de {filteredCustomers.length} cliente(s)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPcPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                  {safePage} de {pcTotalPages}
                </span>
                <button
                  onClick={() => setPcPage((p) => Math.min(pcTotalPages, p + 1))}
                  disabled={safePage >= pcTotalPages}
                  className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>}

      {/* ── Faturas tab ─────────────────────────────────────────────────── */}
      {pcSubTab === 'faturas' && (
        <div className="space-y-4">
          {/* Stats faturas */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 shadow-sm flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <FileText size={16} className="text-blue-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{invoicesQ.isLoading ? '...' : invStats.count}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Faturas no período</p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 shadow-sm flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <DollarSign size={16} className="text-green-500" />
              </div>
              <div>
                {Object.entries(invStats.totals).length === 0
                  ? <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{invoicesQ.isLoading ? '...' : '—'}</p>
                  : Object.entries(invStats.totals).map(([cur, sum]) => <p key={cur} className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtInvCurrency(sum, cur)}</p>)
                }
                <p className="text-xs text-gray-500 dark:text-gray-400">Valor total</p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 shadow-sm flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <Clock size={16} className="text-amber-500" />
              </div>
              <div>
                {Object.entries(invStats.dueTotals).length === 0
                  ? <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{invoicesQ.isLoading ? '...' : '—'}</p>
                  : Object.entries(invStats.dueTotals).map(([cur, sum]) => <p key={cur} className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtInvCurrency(sum, cur)}</p>)
                }
                <p className="text-xs text-gray-500 dark:text-gray-400">Em aberto</p>
              </div>
            </div>
          </div>

          {/* Search faturas */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={invSearch} onChange={(e) => setInvSearch(e.target.value)}
              placeholder="Buscar por ID ou status…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Table faturas */}
          {invoicesQ.isLoading ? (
            <div className="flex justify-center py-12"><LoadingSpinner /></div>
          ) : invoicesQ.isError ? (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
              <AlertCircle size={20} className="text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-600 dark:text-red-400">{invoicesQ.error?.response?.data?.detail || 'Erro ao carregar faturas'}</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-12 text-center">
              <Receipt size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma fatura encontrada.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fatura</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Período</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Vencimento</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-gray-900 dark:text-gray-100">{inv.id}</p>
                        <p className="text-xs text-gray-400">{inv.document_type || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 hidden md:table-cell">
                        {fmtInvDate(inv.billing_period_start)}<span className="mx-1 text-gray-400">→</span>{fmtInvDate(inv.billing_period_end)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 hidden md:table-cell">{fmtInvDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100">{fmtInvCurrency(inv.total_amount, inv.currency_code)}</td>
                      <td className="px-4 py-3"><InvStatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => setSelectedInvoice(inv)}
                            className="p-1.5 rounded text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Ver detalhes">
                            <ExternalLink size={14} />
                          </button>
                          <button onClick={() => downloadPdf(inv.id)} disabled={downloading === inv.id}
                            className="p-1.5 rounded text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 transition-colors" title="Baixar PDF">
                            {downloading === inv.id ? <RefreshCcw size={14} className="animate-spin" /> : <Download size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Pagination ──────────────────────────────────────────────────────────── */

const Pagination = ({ pagination, onPageChange }) => {
  if (!pagination || pagination.total_pages <= 1) return null;
  const { page, total_pages, total } = pagination;
  return (
    <div className="flex items-center justify-between py-2">
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {total} organização{total !== 1 ? 'ões' : ''}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">
          {page} de {total_pages}
        </span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= total_pages}
          className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

/* ── Batch Action Bar ────────────────────────────────────────────────────── */

const BatchActionBar = ({ selectedCount, onSuspend, onActivate, onCancel, isPending }) => {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg shadow-2xl px-5 py-3">
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
        {selectedCount} selecionada{selectedCount > 1 ? 's' : ''}
      </span>
      <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
      <button onClick={onSuspend} disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors">
        <PowerOff size={13} /> Suspender
      </button>
      <button onClick={onActivate} disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 disabled:opacity-50 transition-colors">
        <Power size={13} /> Reativar
      </button>
      <button onClick={onCancel}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
        <X size={13} /> Cancelar
      </button>
    </div>
  );
};

/* ── Main Page ───────────────────────────────────────────────────────────── */

const ManagedOrgsPage = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { currentOrg, currentWorkspace, switchOrg, refreshOrgs } = useOrgWorkspace();

  const [activeView, setActiveView] = useState('orgs');
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [editTarget, setEditTarget]     = useState(null);
  const [notesTarget, setNotesTarget]   = useState(null);
  const [brandingOrg, setBrandingOrg]   = useState(null);
  const [inviteTarget, setInviteTarget] = useState(null);
  const [reportMonths, setReportMonths] = useState(6);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Pagination & search
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy]   = useState('recent');

  // Batch mode
  const [batchMode, setBatchMode]     = useState(false);
  const [selectedOrgs, setSelectedOrgs] = useState(new Set());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on sort change
  useEffect(() => { setPage(1); }, [sortBy]);

  const orgsQ = useQuery({
    queryKey: ['managed-orgs', currentOrg?.slug, page, debouncedSearch, sortBy],
    queryFn: () => orgService.listManagedOrgs(currentOrg.slug, { page, search: debouncedSearch, sortBy }),
    enabled: Boolean(currentOrg?.slug),
    retry: false,
    refetchInterval: 60_000,
  });

  const summaryQ = useQuery({
    queryKey: ['managed-orgs-summary', currentOrg?.slug],
    queryFn: () => orgService.getManagedOrgsSummary(currentOrg.slug),
    enabled: Boolean(currentOrg?.slug),
    retry: false,
    refetchInterval: 60_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['managed-orgs'] });
    qc.invalidateQueries({ queryKey: ['managed-orgs-summary'] });
  };

  const createMut = useMutation({
    mutationFn: (name) => orgService.createManagedOrg(currentOrg.slug, name),
    onSuccess: async (data) => {
      await refreshOrgs();
      invalidateAll();
      setShowAddModal(false);
      await switchOrg(data.slug);
      navigate('/');
    },
  });

  const removeMut = useMutation({
    mutationFn: (partnerSlug) => orgService.removeManagedOrg(currentOrg.slug, partnerSlug),
    onSuccess: () => { invalidateAll(); setRemoveTarget(null); },
  });

  const renameMut = useMutation({
    mutationFn: ({ partnerSlug, name }) => orgService.updateManagedOrg(partnerSlug, { name }),
    onSuccess: () => { invalidateAll(); setEditTarget(null); },
  });

  const notesMut = useMutation({
    mutationFn: ({ partnerSlug, notes }) => orgService.updatePartnerNotes(partnerSlug, notes),
    onSuccess: () => { invalidateAll(); setNotesTarget(null); },
  });

  const brandingMut = useMutation({
    mutationFn: async ({ slug, data }) => data === null ? orgService.resetBranding(slug) : orgService.updateBranding(slug, data),
    onSuccess: () => { setBrandingOrg(null); invalidateAll(); },
  });

  const batchSuspendMut = useMutation({
    mutationFn: (slugs) => orgService.batchSuspendPartners(currentOrg.slug, slugs),
    onSuccess: () => { invalidateAll(); setSelectedOrgs(new Set()); setBatchMode(false); },
  });

  const batchActivateMut = useMutation({
    mutationFn: (slugs) => orgService.batchActivatePartners(currentOrg.slug, slugs),
    onSuccess: () => { invalidateAll(); setSelectedOrgs(new Set()); setBatchMode(false); },
  });

  const managedOrgs = orgsQ.data?.managed_orgs || [];
  const pagination = orgsQ.data?.pagination;
  const summary = summaryQ.data;

  const toggleSelect = useCallback((slug) => {
    setSelectedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const selectAll = () => setSelectedOrgs(new Set(managedOrgs.map(o => o.slug)));
  const deselectAll = () => setSelectedOrgs(new Set());

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedOrgs(new Set());
  };

  const handleDownloadReport = async (months) => {
    setGeneratingReport(true);
    try {
      const blob = await orgService.getExecutiveReport(currentOrg.slug, months);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-parceiros-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
    } finally {
      setGeneratingReport(false);
    }
  };

  if (orgsQ.isError) {
    return (
      <Layout>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
            Acesso negado. Esta funcionalidade requer plano Enterprise.
          </div>
        </div>
      </Layout>
    );
  }

  const handleAccessPartner = async (orgSlug) => {
    await switchOrg(orgSlug);
    navigate('/');
  };

  const handleAccessM365 = async (orgSlug) => {
    await switchOrg(orgSlug);
    navigate('/m365');
  };

  const lastUpdated = orgsQ.dataUpdatedAt;
  const timeAgo = lastUpdated ? formatRelativeTime(lastUpdated) : null;

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <Building2 size={22} className="text-primary-light" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Organizações Gerenciadas</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Gerencie organizações parceiras vinculadas à sua conta Enterprise
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-refresh indicator */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              {orgsQ.isFetching && <RefreshCw size={12} className="animate-spin" />}
              {timeAgo && !orgsQ.isFetching && <span>Atualizado {timeAgo}</span>}
              <button onClick={() => orgsQ.refetch()} title="Atualizar agora"
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>
            {/* Report download */}
            <div className="flex items-center gap-1.5">
              <select
                value={reportMonths}
                onChange={(e) => setReportMonths(Number(e.target.value))}
                className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={3}>3 meses</option>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
              </select>
              <button
                onClick={() => handleDownloadReport(reportMonths)}
                disabled={generatingReport}
                title="Gerar Relatório Executivo PDF"
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {generatingReport
                  ? <RefreshCw size={13} className="animate-spin" />
                  : <FileDown size={13} />
                }
                {generatingReport ? 'Gerando...' : 'PDF'}
              </button>
            </div>
            {activeView === 'orgs' && (
              <button onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors">
                <Plus size={16} /> Adicionar Parceira
              </button>
            )}
          </div>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'orgs', label: 'Organizações Parceiras', icon: Building2 },
            { id: 'costs', label: 'Custos Consolidados', icon: TrendingUp },
            { id: 'm365', label: 'Tenants M365', icon: Grid3x3 },
            { id: 'partner_center', label: 'Partner Center', icon: Store },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveView(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeView === id
                  ? 'border-primary text-primary-dark dark:text-primary-light'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Summary bar */}
        {activeView === 'orgs' && summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Organizações', value: summary.total_partners, sub: 'orgs parceiras ativas' },
              { label: 'Workspaces', value: summary.total_workspaces, sub: 'em todas as parceiras' },
              { label: 'Contas cloud', value: summary.total_cloud_accounts, sub: 'em todas as parceiras' },
              { label: 'Membros', value: summary.total_members, sub: 'em todas as parceiras' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 shadow-sm">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">{label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        )}


        {/* Orgs grid */}
        {activeView === 'orgs' && (
          orgsQ.isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : managedOrgs.length === 0 && !debouncedSearch ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
              <Building2 size={48} className="mb-4 opacity-20" />
              <p className="text-base font-medium">Nenhuma organização parceira ainda</p>
              <p className="text-sm mt-1 mb-4">Adicione parceiros para gerenciar suas infraestruturas centralizadamente</p>
              <button onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors">
                <Plus size={15} /> Adicionar primeira parceira
              </button>
            </div>
          ) : (
            <>
              {/* Search + Sort + Batch toggle */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-48">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome ou slug…"
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpDown size={13} className="text-gray-400" />
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                    className="text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="recent">Mais recente</option>
                    <option value="name">Nome A-Z</option>
                  </select>
                </div>
                <button onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    batchMode
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}>
                  <CheckSquare size={13} /> {batchMode ? 'Selecionando' : 'Selecionar'}
                </button>
              </div>

              {/* Batch select all */}
              {batchMode && managedOrgs.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <button onClick={selectedOrgs.size === managedOrgs.length ? deselectAll : selectAll}
                    className="text-primary hover:underline font-medium">
                    {selectedOrgs.size === managedOrgs.length ? 'Limpar seleção' : 'Selecionar todos'}
                  </button>
                  {selectedOrgs.size > 0 && <span>{selectedOrgs.size} selecionada{selectedOrgs.size > 1 ? 's' : ''}</span>}
                </div>
              )}

              {/* Cards grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {managedOrgs.map((org) => {
                  return (
                    <PartnerCard
                      key={org.id}
                      org={org}
                      onAccess={async (o) => handleAccessPartner(o.slug)}
                      onRemove={setRemoveTarget}
                      onEdit={setEditTarget}
                      onNotes={setNotesTarget}
                      onBranding={(o) => setBrandingOrg(o)}
                      onInvite={setInviteTarget}
                      batchMode={batchMode}
                      isSelected={selectedOrgs.has(org.slug)}
                      onToggleSelect={toggleSelect}
                    />
                  );
                })}
              </div>

              {/* No results for search */}
              {managedOrgs.length === 0 && debouncedSearch && (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  <Search size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum resultado para "{debouncedSearch}"</p>
                </div>
              )}

              {/* Pagination */}
              <Pagination pagination={pagination} onPageChange={setPage} />
            </>
          )
        )}

        {/* Consolidated Costs tab */}
        {activeView === 'costs' && (
          <CostsTab orgSlug={currentOrg?.slug} />
        )}

        {/* M365 tenants tab */}
        {activeView === 'm365' && (
          <M365TenantsTab orgSlug={currentOrg?.slug} onAccess={handleAccessM365} />
        )}

        {/* Partner Center tab */}
        {activeView === 'partner_center' && (
          <PartnerCenterTab orgSlug={currentOrg?.slug} workspaceId={currentWorkspace?.id} />
        )}
      </div>

      {/* Batch action bar */}
      <BatchActionBar
        selectedCount={selectedOrgs.size}
        onSuspend={() => { if (confirm(`Suspender ${selectedOrgs.size} organização(ões)?`)) batchSuspendMut.mutate([...selectedOrgs]); }}
        onActivate={() => { if (confirm(`Reativar ${selectedOrgs.size} organização(ões)?`)) batchActivateMut.mutate([...selectedOrgs]); }}
        onCancel={exitBatchMode}
        isPending={batchSuspendMut.isPending || batchActivateMut.isPending}
      />

      {/* Modals */}
      {showAddModal && (
        <AddPartnerModal onClose={() => setShowAddModal(false)} onSave={(name) => createMut.mutate(name)} saving={createMut.isPending} />
      )}
      {removeTarget && (
        <RemoveConfirmModal org={removeTarget} onClose={() => setRemoveTarget(null)} onConfirm={() => removeMut.mutate(removeTarget.slug)} removing={removeMut.isPending} />
      )}
      {editTarget && (
        <EditPartnerModal org={editTarget} onClose={() => setEditTarget(null)} onSave={(name) => renameMut.mutate({ partnerSlug: editTarget.slug, name })} saving={renameMut.isPending} />
      )}
      {notesTarget && (
        <NotesModal org={notesTarget} onClose={() => setNotesTarget(null)} onSave={(notes) => notesMut.mutate({ partnerSlug: notesTarget.slug, notes })} saving={notesMut.isPending} />
      )}
      {brandingOrg && (
        <BrandingPartnerModal org={brandingOrg} onClose={() => setBrandingOrg(null)} onSave={(data) => brandingMut.mutate({ slug: brandingOrg.slug, data })} saving={brandingMut.isPending} />
      )}
      {inviteTarget && (
        <InviteOwnerModal org={inviteTarget} masterSlug={currentOrg?.slug} onClose={() => setInviteTarget(null)} />
      )}
    </Layout>
  );
};

export default ManagedOrgsPage;
