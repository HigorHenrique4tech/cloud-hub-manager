import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Plus, ExternalLink, Trash2, X, Users, Layers, Cloud,
  AlertTriangle, Grid3x3, CheckCircle, XCircle, PlusCircle, Pencil,
  StickyNote, Search, ArrowUpDown, Ban, Palette, RefreshCw,
  ChevronLeft, ChevronRight, CheckSquare, Square, Power, PowerOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import { AwsIcon, AzureIcon, GcpIcon, M365Icon } from '../components/common/CloudProviderIcons';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import orgService from '../services/orgService';
import m365Service from '../services/m365Service';

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
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Adicionar Organização Parceira</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Nome da organização</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
              placeholder="Ex: TechCorp Solutions"
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">
              Um workspace padrão será criado automaticamente. Você será adicionado como owner.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
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

const RemoveConfirmModal = ({ org, onClose, onConfirm, removing }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertTriangle size={20} className="text-red-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Remover organização parceira?</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{org.name}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 dark:text-slate-300">
        A organização será desvinculada e seu plano será revertido para <strong>Free</strong>. Os dados internos não serão apagados.
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
        <button onClick={onConfirm} disabled={removing}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 transition-colors">
          {removing ? 'Removendo…' : 'Remover'}
        </button>
      </div>
    </div>
  </div>
);

/* ── Edit Partner Modal ──────────────────────────────────────────────────── */

const EditPartnerModal = ({ org, onClose, onSave, saving }) => {
  const [name, setName] = useState(org.name);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Editar Organização</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Nome da organização</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none" />
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500 font-mono">slug: {org.slug} (não muda)</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
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
  const [notes, setNotes] = useState(org.notes || '');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Notas internas — {org.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} rows={5}
            placeholder="Notas sobre o contrato, contato, SLA, observações internas…"
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
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
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-purple-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Personalizar Marca — {org.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Herdar marca da org principal</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Quando ativo, usa a personalização da organização master</p>
            </div>
            <button type="button" role="switch" aria-checked={inherit} onClick={() => setInherit(!inherit)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${inherit ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-600'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${inherit ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {!inherit && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Nome da Plataforma</label>
                <input value={form.platform_name} onChange={(e) => setForm({ ...form, platform_name: e.target.value })}
                  placeholder="Herdar da org principal" maxLength={100}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Cor Primária</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color_primary} onChange={(e) => setForm({ ...form, color_primary: e.target.value })}
                      className="h-9 w-12 rounded border border-gray-300 dark:border-slate-700 cursor-pointer" />
                    <input value={form.color_primary} onChange={(e) => setForm({ ...form, color_primary: e.target.value })}
                      maxLength={7} className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs font-mono text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Cor Accent</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color_accent} onChange={(e) => setForm({ ...form, color_accent: e.target.value })}
                      className="h-9 w-12 rounded border border-gray-300 dark:border-slate-700 cursor-pointer" />
                    <input value={form.color_accent} onChange={(e) => setForm({ ...form, color_accent: e.target.value })}
                      maxLength={7} className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs font-mono text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-slate-300">Powered by CloudAtlas</span>
                <button type="button" role="switch" aria-checked={form.powered_by}
                  onClick={() => setForm({ ...form, powered_by: !form.powered_by })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.powered_by ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-600'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.powered_by ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Remetente de E-mail</label>
                <input value={form.email_sender_name} onChange={(e) => setForm({ ...form, email_sender_name: e.target.value })}
                  placeholder="Herdar da org principal" maxLength={100}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none" />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-slate-700 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
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

const PartnerCard = ({ org, onAccess, onRemove, onEdit, onNotes, onBranding, isAddon, addonPricePerOrg, batchMode, isSelected, onToggleSelect }) => {
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
      className={`rounded-xl border bg-white dark:bg-slate-800/60 p-5 flex flex-col gap-3 transition-all ${
        batchMode && isSelected
          ? 'border-primary ring-2 ring-primary/30'
          : !org.is_active
          ? 'border-red-300/50 dark:border-red-800/40 opacity-70'
          : isAddon
          ? 'border-amber-400/50 dark:border-amber-500/40 hover:border-amber-400 dark:hover:border-amber-500/60'
          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
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
              : <Square size={18} className="text-gray-300 dark:text-slate-600" />
            }
          </button>
        )}

        {/* Health dot */}
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0" title={health.label}>
          {health.pulse && <span className={`absolute inset-0 rounded-full ${health.dot} animate-ping opacity-40`} />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${health.dot}`} />
        </span>

        {/* Provider icons */}
        {providers.map(p => {
          const cfg = PROVIDER_ICONS[p];
          if (!cfg) return null;
          const Icon = cfg.icon;
          return <Icon key={p} className={`w-3.5 h-3.5 ${cfg.color}`} />;
        })}

        <div className="flex-1" />

        {/* Badges */}
        {isAddon && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-300/50 dark:border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            <PlusCircle size={10} /> Add-on
          </span>
        )}
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
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${isAddon ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
            <Building2 size={18} className={isAddon ? 'text-amber-500' : 'text-primary-light'} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{org.name}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 font-mono truncate">{org.slug}</p>
          </div>
        </div>
        {!batchMode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onEdit(org)} className="p-1.5 text-gray-300 dark:text-slate-600 hover:text-indigo-500 dark:hover:text-primary-light transition-colors rounded" title="Renomear">
              <Pencil size={14} />
            </button>
            <button onClick={() => onNotes(org)} className="p-1.5 text-gray-300 dark:text-slate-600 hover:text-yellow-500 dark:hover:text-yellow-400 transition-colors rounded" title="Notas internas">
              <StickyNote size={14} />
            </button>
            <button onClick={() => onBranding(org)} title="Personalizar marca"
              className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors">
              <Palette size={15} />
            </button>
            <button onClick={() => onRemove(org)} className="p-1.5 text-gray-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-colors rounded" title="Remover parceira">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Owner info */}
      {org.owner_name && (
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-primary-light text-[10px] font-bold flex-shrink-0">
            {initials(org.owner_name)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700 dark:text-slate-300 truncate">{org.owner_name}</p>
            {org.owner_email && <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">{org.owner_email}</p>}
          </div>
        </div>
      )}

      {/* Notes preview */}
      {org.notes && (
        <p className="text-xs text-gray-500 dark:text-slate-400 italic line-clamp-2 px-1 border-l-2 border-yellow-300 dark:border-yellow-600 pl-2">
          {org.notes}
        </p>
      )}

      {/* Connection health bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
          {org.cloud_accounts_count > 0 ? (
            <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }} />
          ) : (
            <div className="h-full bg-red-400 rounded-full" style={{ width: '100%' }} />
          )}
        </div>
        <span className="text-[10px] text-gray-400 dark:text-slate-500 whitespace-nowrap">
          {org.cloud_accounts_count} conta{org.cloud_accounts_count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 dark:bg-slate-700/50 px-2 py-1.5 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-slate-100">{org.workspaces_count}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 flex items-center justify-center gap-0.5">
            <Layers size={9} /> Workspaces
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-slate-700/50 px-2 py-1.5 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-slate-100">{org.cloud_accounts_count}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 flex items-center justify-center gap-0.5">
            <Cloud size={9} /> Contas
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-slate-700/50 px-2 py-1.5 text-center">
          <p className="text-base font-bold text-gray-900 dark:text-slate-100">{org.members_count}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 flex items-center justify-center gap-0.5">
            <Users size={9} /> Membros
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400 dark:text-slate-500">
          <p>Criada em {fmtDate(org.created_at)}</p>
          {activityAgo && <p className="text-[10px]">Atividade: {activityAgo}</p>}
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
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-slate-500">
        <Grid3x3 size={48} className="mb-4 opacity-20" />
        <p className="text-base font-medium">Nenhuma organização parceira encontrada</p>
        <p className="text-sm mt-1">Adicione parceiros para visualizar seus tenants M365</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-slate-400">
        {connectedCount} de {tenants.length} workspace(s) com M365 conectado
      </p>
      <div className="card rounded-2xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
          <thead className="bg-gray-50 dark:bg-slate-800/60">
            <tr>
              {['Organização', 'Workspace', 'Tenant', 'Usuários', 'Licenças', 'Equipes', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {tenants.map((t, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3">
                  <button onClick={() => onAccess(t.org_slug)} className="text-sm font-medium text-indigo-600 dark:text-primary-light hover:underline">
                    {t.org_name}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{t.workspace_name}</td>
                <td className="px-4 py-3 text-xs text-gray-400 dark:text-slate-500 font-mono">{t.tenant_domain || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{t.overview?.total_users ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                  {t.overview ? `${t.overview.assigned_licenses} / ${t.overview.total_licenses}` : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{t.overview?.total_teams ?? '—'}</td>
                <td className="px-4 py-3">
                  {t.error ? (
                    <span className="flex items-center gap-1 text-xs text-red-500"><XCircle size={12} /> Erro</span>
                  ) : t.connected ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle size={12} /> Conectado</span>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-slate-500">Não configurado</span>
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

/* ── Pagination ──────────────────────────────────────────────────────────── */

const Pagination = ({ pagination, onPageChange }) => {
  if (!pagination || pagination.total_pages <= 1) return null;
  const { page, total_pages, total } = pagination;
  return (
    <div className="flex items-center justify-between py-2">
      <p className="text-xs text-gray-400 dark:text-slate-500">
        {total} organização{total !== 1 ? 'ões' : ''}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="p-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs text-gray-600 dark:text-slate-300 font-medium">
          {page} de {total_pages}
        </span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= total_pages}
          className="p-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg shadow-2xl px-5 py-3">
      <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">
        {selectedCount} selecionada{selectedCount > 1 ? 's' : ''}
      </span>
      <div className="w-px h-5 bg-gray-200 dark:bg-slate-700" />
      <button onClick={onSuspend} disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors">
        <PowerOff size={13} /> Suspender
      </button>
      <button onClick={onActivate} disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 disabled:opacity-50 transition-colors">
        <Power size={13} /> Reativar
      </button>
      <button onClick={onCancel}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
        <X size={13} /> Cancelar
      </button>
    </div>
  );
};

/* ── Main Page ───────────────────────────────────────────────────────────── */

const ManagedOrgsPage = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { currentOrg, switchOrg, refreshOrgs } = useOrgWorkspace();

  const [activeView, setActiveView] = useState('orgs');
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [editTarget, setEditTarget]     = useState(null);
  const [notesTarget, setNotesTarget]   = useState(null);
  const [brandingOrg, setBrandingOrg]   = useState(null);

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
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Organizações Gerenciadas</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Gerencie organizações parceiras vinculadas à sua conta Enterprise
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-refresh indicator */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
              {orgsQ.isFetching && <RefreshCw size={12} className="animate-spin" />}
              {timeAgo && !orgsQ.isFetching && <span>Atualizado {timeAgo}</span>}
              <button onClick={() => orgsQ.refetch()} title="Atualizar agora"
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                <RefreshCw size={13} />
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
        <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700">
          {[
            { id: 'orgs', label: 'Organizações Parceiras', icon: Building2 },
            { id: 'm365', label: 'Tenants M365', icon: Grid3x3 },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveView(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeView === id
                  ? 'border-primary text-indigo-600 dark:text-primary-light'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Summary bar */}
        {activeView === 'orgs' && summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Organizações', value: summary.total_partners, sub: `${summary.base_included_orgs} incluídas no plano` },
              { label: 'Workspaces', value: summary.total_workspaces, sub: 'em todas as parceiras' },
              { label: 'Contas cloud', value: summary.total_cloud_accounts, sub: 'em todas as parceiras' },
              { label: 'Membros', value: summary.total_members, sub: 'em todas as parceiras' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</p>
                <p className="text-sm font-medium text-gray-600 dark:text-slate-300 mt-0.5">{label}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add-on pricing info */}
        {activeView === 'orgs' && summary && summary.extra_orgs > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
            <strong>{summary.extra_orgs}</strong> org{summary.extra_orgs > 1 ? 's' : ''} adicional{summary.extra_orgs > 1 ? 'is' : ''} além das {summary.base_included_orgs} incluídas
            {' '}· <strong>R$ {summary.extra_cost_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</strong> em add-ons
          </div>
        )}

        {/* Orgs grid */}
        {activeView === 'orgs' && (
          orgsQ.isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : managedOrgs.length === 0 && !debouncedSearch ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-slate-500">
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
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpDown size={13} className="text-gray-400" />
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                    className="text-sm rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="recent">Mais recente</option>
                    <option value="name">Nome A-Z</option>
                  </select>
                </div>
                <button onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    batchMode
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}>
                  <CheckSquare size={13} /> {batchMode ? 'Selecionando' : 'Selecionar'}
                </button>
              </div>

              {/* Batch select all */}
              {batchMode && managedOrgs.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
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
                  const baseIncluded = summary?.base_included_orgs ?? 5;
                  const originalIdx = (orgsQ.data?.managed_orgs || []).findIndex(o => o.id === org.id);
                  const isAddon = originalIdx >= baseIncluded;
                  const addonPricePerOrg = summary?.extra_orgs > 0 ? summary.extra_cost_brl / summary.extra_orgs : null;
                  return (
                    <PartnerCard
                      key={org.id}
                      org={org}
                      onAccess={async (o) => handleAccessPartner(o.slug)}
                      onRemove={setRemoveTarget}
                      onEdit={setEditTarget}
                      onNotes={setNotesTarget}
                      onBranding={(o) => setBrandingOrg(o)}
                      isAddon={isAddon}
                      addonPricePerOrg={addonPricePerOrg}
                      batchMode={batchMode}
                      isSelected={selectedOrgs.has(org.slug)}
                      onToggleSelect={toggleSelect}
                    />
                  );
                })}
              </div>

              {/* No results for search */}
              {managedOrgs.length === 0 && debouncedSearch && (
                <div className="text-center py-12 text-gray-400 dark:text-slate-500">
                  <Search size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum resultado para "{debouncedSearch}"</p>
                </div>
              )}

              {/* Pagination */}
              <Pagination pagination={pagination} onPageChange={setPage} />
            </>
          )
        )}

        {/* M365 tenants tab */}
        {activeView === 'm365' && (
          <M365TenantsTab orgSlug={currentOrg?.slug} onAccess={handleAccessM365} />
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
    </Layout>
  );
};

export default ManagedOrgsPage;
