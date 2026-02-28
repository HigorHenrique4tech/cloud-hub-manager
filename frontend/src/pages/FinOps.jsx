import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from 'recharts';
import { Zap, TrendingDown, History, Wallet, AlertTriangle, Plus, Trash2, X, Clock, CheckCircle, XCircle, Mail, RefreshCw, Pencil, Bell, FileDown, Printer } from 'lucide-react';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import EmptyState from '../components/common/emptystate';
import PermissionGate from '../components/common/PermissionGate';
import PlanGate from '../components/common/PlanGate';
import WasteSummary from '../components/finops/WasteSummary';
import RecommendationCard from '../components/finops/RecommendationCard';
import ActionTimeline from '../components/finops/ActionTimeline';
import finopsService from '../services/finopsService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';

const TABS = [
  { id: 'recommendations', label: 'Recomendações', icon: TrendingDown },
  { id: 'budgets',         label: 'Orçamentos',     icon: Wallet },
  { id: 'reports',         label: 'Relatórios',     icon: Mail },
  { id: 'anomalies',       label: 'Anomalias',      icon: Bell },
  { id: 'actions',         label: 'Histórico',      icon: History },
];

const FILTER_STATUS   = ['pending', 'applied', 'dismissed'];
const FILTER_PROVIDER = ['aws', 'azure', 'gcp'];

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── Budget Modal ─────────────────────────────────────────────────────────── */

const BudgetModal = ({ onClose, onSave, saving }) => {
  const [form, setForm] = useState({ name: '', provider: 'all', amount: '', period: 'monthly', alert_threshold: 80 });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    onSave({ ...form, amount: parseFloat(form.amount), alert_threshold: form.alert_threshold / 100 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">Novo Orçamento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: AWS Production Q1"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => set('provider', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">Todos</option>
                <option value="aws">AWS</option>
                <option value="azure">Azure</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Período</label>
              <select
                value={form.period}
                onChange={(e) => set('period', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <option value="monthly">Mensal</option>
                <option value="quarterly">Trimestral</option>
                <option value="annual">Anual</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Valor (USD)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="1000.00"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Alerta em {form.alert_threshold}% do orçamento
            </label>
            <input
              type="range"
              min="50"
              max="100"
              step="5"
              value={form.alert_threshold}
              onChange={(e) => set('alert_threshold', parseInt(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors">
              {saving ? 'Salvando…' : 'Criar Orçamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ── Scan Schedule Modal ──────────────────────────────────────────────────── */

const TIMEZONES = [
  'America/Sao_Paulo', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/London',
  'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore',
  'Australia/Sydney', 'UTC',
];

const SCHED_TYPES = [
  { value: 'daily',    label: 'Diário' },
  { value: 'weekdays', label: 'Seg–Sex' },
  { value: 'weekends', label: 'Sáb–Dom' },
];

const ScanScheduleModal = ({ onClose, existing, onSave, onDelete, saving, deleting }) => {
  const [form, setForm] = useState({
    is_enabled:    existing?.is_enabled    ?? true,
    schedule_type: existing?.schedule_type ?? 'daily',
    schedule_time: existing?.schedule_time ?? '02:00',
    timezone:      existing?.timezone      ?? 'America/Sao_Paulo',
    provider:      existing?.provider      ?? 'all',
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">Análise Automática</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Ativar análise automática</span>
            <button
              onClick={() => set('is_enabled', !form.is_enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_enabled ? 'bg-indigo-600' : 'bg-slate-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Frequência</label>
            <div className="flex gap-2">
              {SCHED_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => set('schedule_type', value)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                    form.schedule_type === value
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Time + Timezone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Horário</label>
              <input
                type="time"
                value={form.schedule_time}
                onChange={(e) => set('schedule_time', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Fuso horário</label>
              <select
                value={form.timezone}
                onChange={(e) => set('timezone', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => set('provider', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">Todos</option>
              <option value="aws">AWS</option>
              <option value="azure">Azure</option>
              <option value="gcp">GCP</option>
            </select>
          </div>

          {/* Last run info */}
          {existing && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 space-y-1 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Último scan</span>
                <span className="flex items-center gap-1">
                  {existing.last_run_status === 'success' && <CheckCircle size={11} className="text-green-400" />}
                  {existing.last_run_status === 'failed' && <XCircle size={11} className="text-red-400" />}
                  {fmtDate(existing.last_run_at)}
                </span>
              </div>
              {existing.next_run_at && (
                <div className="flex items-center justify-between text-slate-400">
                  <span>Próxima execução</span>
                  <span>{fmtDate(existing.next_run_at)}</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            {existing ? (
              <button
                onClick={onDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Removendo…' : 'Remover agendamento'}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => onSave(form)}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Report Schedule Modal ────────────────────────────────────────────────── */

const WEEK_DAYS = [
  { value: 0, label: 'Segunda-feira' },
  { value: 1, label: 'Terça-feira' },
  { value: 2, label: 'Quarta-feira' },
  { value: 3, label: 'Quinta-feira' },
  { value: 4, label: 'Sexta-feira' },
  { value: 5, label: 'Sábado' },
  { value: 6, label: 'Domingo' },
];

const REPORT_TIMEZONES = [
  'America/Sao_Paulo', 'America/New_York', 'America/Chicago',
  'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'UTC',
];

const ReportScheduleModal = ({ onClose, existing, onSave, onDelete, saving, deleting }) => {
  const [form, setForm] = useState({
    name:            existing?.name             ?? 'Relatório Semanal',
    schedule_type:   existing?.schedule_type    ?? 'weekly',
    send_day:        existing?.send_day         ?? 1,
    send_time:       existing?.send_time        ?? '08:00',
    timezone:        existing?.timezone         ?? 'America/Sao_Paulo',
    recipients:      existing?.recipients       ?? [],
    include_costs:   existing?.include_costs    ?? true,
    include_budgets: existing?.include_budgets  ?? true,
    include_finops:  existing?.include_finops   ?? true,
    is_enabled:      existing?.is_enabled       ?? true,
  });
  const [emailInput, setEmailInput] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const addEmail = () => {
    const e = emailInput.trim().toLowerCase();
    if (!e || form.recipients.includes(e)) { setEmailInput(''); return; }
    set('recipients', [...form.recipients, e]);
    setEmailInput('');
  };

  const removeEmail = (e) => set('recipients', form.recipients.filter((r) => r !== e));

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">Relatório Automático</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Ativar relatório automático</span>
            <button
              onClick={() => set('is_enabled', !form.is_enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_enabled ? 'bg-indigo-600' : 'bg-slate-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Frequência</label>
            <div className="flex gap-2">
              {[{ value: 'weekly', label: 'Semanal' }, { value: 'monthly', label: 'Mensal' }].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => { set('schedule_type', value); set('send_day', value === 'weekly' ? 1 : 1); }}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                    form.schedule_type === value
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Day + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {form.schedule_type === 'weekly' ? 'Dia da semana' : 'Dia do mês'}
              </label>
              {form.schedule_type === 'weekly' ? (
                <select
                  value={form.send_day}
                  onChange={(e) => set('send_day', parseInt(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                >
                  {WEEK_DAYS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              ) : (
                <input
                  type="number" min="1" max="28"
                  value={form.send_day}
                  onChange={(e) => set('send_day', parseInt(e.target.value) || 1)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Horário</label>
              <input
                type="time"
                value={form.send_time}
                onChange={(e) => set('send_time', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Fuso horário</label>
            <select
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              {REPORT_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Destinatários</label>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                placeholder="email@exemplo.com"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={addEmail}
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                Adicionar
              </button>
            </div>
            {form.recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.recipients.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1 rounded-full bg-indigo-600/20 border border-indigo-500/30 px-2 py-0.5 text-xs text-indigo-300">
                    {e}
                    <button onClick={() => removeEmail(e)} className="text-indigo-400 hover:text-white"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sections */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Seções do relatório</label>
            <div className="space-y-2">
              {[
                { key: 'include_costs',   label: 'Custos por provedor' },
                { key: 'include_budgets', label: 'Status dos orçamentos' },
                { key: 'include_finops',  label: 'Recomendações FinOps' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={() => set(key, !form[key])}
                    className="rounded border-slate-600 bg-slate-700 text-indigo-600"
                  />
                  <span className="text-sm text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Last run info */}
          {existing && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 space-y-1 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Último envio</span>
                <span className="flex items-center gap-1">
                  {existing.last_run_status === 'success' && <CheckCircle size={11} className="text-green-400" />}
                  {existing.last_run_status === 'error' && <XCircle size={11} className="text-red-400" />}
                  {fmtDate(existing.last_run_at)}
                </span>
              </div>
              {existing.next_run_at && (
                <div className="flex items-center justify-between text-slate-400">
                  <span>Próximo envio</span>
                  <span>{fmtDate(existing.next_run_at)}</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            {existing ? (
              <button
                onClick={onDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Removendo…' : 'Remover agendamento'}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => onSave(form)}
                disabled={saving || !form.recipients.length}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Main Page ────────────────────────────────────────────────────────────── */

const FinOps = () => {
  const qc = useQueryClient();
  const { currentOrg } = useOrgWorkspace();
  const planTier = (currentOrg?.plan_tier || 'free').toLowerCase();

  const [activeTab, setActiveTab]       = useState('recommendations');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterProvider, setFilterProvider] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [recsPage, setRecsPage]         = useState(1);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showScanScheduleModal, setShowScanScheduleModal] = useState(false);
  const [showReportScheduleModal, setShowReportScheduleModal] = useState(false);
  const [applyingId, setApplyingId]   = useState(null);
  const [dismissingId, setDismissingId] = useState(null);
  const [rollbackId, setRollbackId]   = useState(null);
  const [scanJobId, setScanJobId]     = useState(null);
  const [scanJobStatus, setScanJobStatus] = useState(null); // null | {status,new_findings,results,error}

  /* ── Scan job polling ── */
  useEffect(() => {
    if (!scanJobId) return;
    if (scanJobStatus?.status === 'done' || scanJobStatus?.status === 'error') return;

    const interval = setInterval(async () => {
      try {
        const status = await finopsService.getScanStatus(scanJobId);
        setScanJobStatus(status);
        if (status.status === 'done') {
          qc.invalidateQueries({ queryKey: ['finops-recs'] });
          qc.invalidateQueries({ queryKey: ['finops-summary'] });
          clearInterval(interval);
        } else if (status.status === 'error') {
          clearInterval(interval);
        }
      } catch (e) {
        clearInterval(interval);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [scanJobId, scanJobStatus?.status]);

  /* ── Queries ── */

  const summaryQ = useQuery({
    queryKey: ['finops-summary'],
    queryFn: finopsService.getSummary,
    refetchInterval: 60_000,
  });

  // Reset to page 1 when filters change
  useEffect(() => { setRecsPage(1); }, [filterStatus, filterProvider, filterSeverity]);

  const recsQ = useQuery({
    queryKey: ['finops-recs', filterStatus, filterProvider, filterSeverity, recsPage],
    queryFn: () => finopsService.getRecommendations({
      status:    filterStatus   || undefined,
      provider:  filterProvider || undefined,
      severity:  filterSeverity || undefined,
      page:      recsPage,
      page_size: 20,
    }),
    enabled: activeTab === 'recommendations',
  });

  const actionsQ = useQuery({
    queryKey: ['finops-actions'],
    queryFn: finopsService.getActions,
    enabled: activeTab === 'actions',
  });

  const isPro = ['pro', 'enterprise'].includes(planTier);

  const budgetsQ = useQuery({
    queryKey: ['finops-budgets'],
    queryFn: finopsService.getBudgets,
    enabled: activeTab === 'budgets' && isPro,
  });

  const anomaliesQ = useQuery({
    queryKey: ['finops-anomalies'],
    queryFn: finopsService.getAnomalies,
    enabled: isPro && activeTab === 'anomalies',
  });

  const costTrendQ = useQuery({
    queryKey: ['finops-cost-trend', 30],
    queryFn:  () => finopsService.getCostTrend(30),
    enabled:  isPro,
    staleTime: 60 * 60 * 1000, // 1h — matches backend cache
  });

  const scanScheduleQ = useQuery({
    queryKey: ['finops-scan-schedule'],
    queryFn: finopsService.getScanSchedule,
    retry: false,
    enabled: isPro,
  });

  const reportScheduleQ = useQuery({
    queryKey: ['finops-report-schedule'],
    queryFn: finopsService.getReportSchedule,
    retry: false,
    enabled: isPro,
  });

  /* ── Mutations ── */

  const scanMut = useMutation({
    mutationFn: () => finopsService.triggerScan(),
    onSuccess: (data) => {
      if (data?.job_id) {
        setScanJobId(data.job_id);
        setScanJobStatus({ status: 'queued' });
      }
    },
  });

  const applyMut = useMutation({
    mutationFn: finopsService.applyRecommendation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      qc.invalidateQueries({ queryKey: ['finops-actions'] });
      setApplyingId(null);
    },
    onError: () => setApplyingId(null),
  });

  const dismissMut = useMutation({
    mutationFn: finopsService.dismissRecommendation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      setDismissingId(null);
    },
    onError: () => setDismissingId(null),
  });

  const rollbackMut = useMutation({
    mutationFn: finopsService.rollbackAction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-actions'] });
      qc.invalidateQueries({ queryKey: ['finops-recs'] });
      qc.invalidateQueries({ queryKey: ['finops-summary'] });
      setRollbackId(null);
    },
    onError: () => setRollbackId(null),
  });

  const createBudgetMut = useMutation({
    mutationFn: finopsService.createBudget,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-budgets'] });
      setShowBudgetModal(false);
    },
  });

  const deleteBudgetMut = useMutation({
    mutationFn: finopsService.deleteBudget,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-budgets'] }),
  });

  const upsertScanScheduleMut = useMutation({
    mutationFn: finopsService.upsertScanSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-scan-schedule'] });
      setShowScanScheduleModal(false);
    },
  });

  const deleteScanScheduleMut = useMutation({
    mutationFn: finopsService.deleteScanSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-scan-schedule'] });
      setShowScanScheduleModal(false);
    },
  });

  const evaluateBudgetsMut = useMutation({
    mutationFn: finopsService.evaluateBudgets,
    onSuccess: (data) => {
      qc.setQueryData(['finops-budgets'], data);
    },
  });

  const upsertReportScheduleMut = useMutation({
    mutationFn: finopsService.upsertReportSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-report-schedule'] });
      setShowReportScheduleModal(false);
    },
  });

  const deleteReportScheduleMut = useMutation({
    mutationFn: finopsService.deleteReportSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finops-report-schedule'] });
      setShowReportScheduleModal(false);
    },
  });

  const acknowledgeAnomalyMut = useMutation({
    mutationFn: finopsService.acknowledgeAnomaly,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops-anomalies'] }),
  });

  // Evaluate budgets when user opens the budgets tab
  useEffect(() => {
    if (activeTab === 'budgets' && isPro) {
      evaluateBudgetsMut.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* ── Handlers ── */

  const handleApply = (id) => {
    setApplyingId(id);
    applyMut.mutate(id);
  };

  const handleDismiss = (id) => {
    setDismissingId(id);
    dismissMut.mutate(id);
  };

  const handleRollback = (id) => {
    setRollbackId(id);
    rollbackMut.mutate(id);
  };

  const handleExportCSV = async () => {
    try {
      await finopsService.exportRecommendationsCSV({
        status:   filterStatus   || undefined,
        provider: filterProvider || undefined,
        severity: filterSeverity || undefined,
      });
    } catch {
      // silently ignore — browser will show download error if any
    }
  };

  const handlePrintPDF = () => {
    const items = recsQ.data?.items ?? [];
    const rows = items
      .map((r) => `
        <tr>
          <td>${r.provider?.toUpperCase() ?? ''}</td>
          <td>${r.resource_name || r.resource_id}</td>
          <td>${r.resource_type}</td>
          <td>${r.recommendation_type}</td>
          <td>${r.severity}</td>
          <td>$${Number(r.estimated_saving_monthly ?? 0).toFixed(2)}</td>
          <td>${r.status}</td>
        </tr>`)
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>FinOps — Recomendações</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
        h1 { font-size: 16px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; }
        tr:nth-child(even) { background: #fafafa; }
      </style></head><body>
      <h1>FinOps — Recomendações (${new Date().toLocaleDateString('pt-BR')})</h1>
      <table>
        <thead><tr>
          <th>Provider</th><th>Recurso</th><th>Tipo</th>
          <th>Recomendação</th><th>Severidade</th><th>Economia/mês</th><th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  /* ── Render ── */

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/20">
              <Zap size={22} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">FinOps</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">Detecte desperdício e aplique economias reais na sua infraestrutura</p>
            </div>
          </div>
          <PlanGate minPlan="pro" feature="Análise Automática">
            <button
              onClick={() => setShowScanScheduleModal(true)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                scanScheduleQ.data?.is_enabled
                  ? 'border-indigo-500/50 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20'
                  : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              <Clock size={15} />
              {scanScheduleQ.data?.is_enabled
                ? `Agendado · ${scanScheduleQ.data.schedule_time}`
                : 'Agendar Análise'}
            </button>
          </PlanGate>
        </div>

        {/* Hero summary */}
        <PermissionGate permission="finops.view">
          {summaryQ.isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : (
            <WasteSummary
              summary={summaryQ.data}
              onScan={() => { setScanJobId(null); setScanJobStatus(null); scanMut.mutate(); }}
              scanning={scanMut.isPending || ['queued', 'running'].includes(scanJobStatus?.status)}
            />
          )}
        </PermissionGate>

        {/* Cost trend chart */}
        {isPro && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                Tendência de Custo — últimos 30 dias
              </h3>
              {costTrendQ.isLoading && (
                <span className="text-xs text-gray-400 dark:text-slate-500 animate-pulse">Carregando…</span>
              )}
            </div>
            {costTrendQ.isLoading ? (
              <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800" />
            ) : costTrendQ.isError ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
                Dados de custo indisponíveis
              </div>
            ) : (() => {
              const labels = costTrendQ.data?.labels ?? [];
              const aws    = costTrendQ.data?.aws   ?? [];
              const azure  = costTrendQ.data?.azure ?? [];
              const gcp    = costTrendQ.data?.gcp   ?? [];
              const hasAws   = aws.some(v => v > 0);
              const hasAzure = azure.some(v => v > 0);
              const hasGcp   = gcp.some(v => v > 0);

              if (!hasAws && !hasAzure && !hasGcp) {
                return (
                  <div className="h-40 flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
                    Nenhum dado de custo disponível. Configure uma conta cloud e execute um scan.
                  </div>
                );
              }

              const chartData = labels.map((label, i) => ({
                date:  label.slice(5),
                AWS:   aws[i]   || 0,
                Azure: azure[i] || 0,
                GCP:   gcp[i]   || 0,
              }));

              return (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="awsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}   />
                      </linearGradient>
                      <linearGradient id="azureGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                      </linearGradient>
                      <linearGradient id="gcpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="rgba(148,163,184,0.4)" />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `$${v}`}
                      stroke="rgba(148,163,184,0.4)"
                      width={45}
                    />
                    <RTooltip
                      formatter={(v, name) => [`$${Number(v).toFixed(2)}`, name]}
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    {hasAws   && <Area type="monotone" dataKey="AWS"   stroke="#f97316" fill="url(#awsGrad)"   strokeWidth={2} dot={false} />}
                    {hasAzure && <Area type="monotone" dataKey="Azure" stroke="#3b82f6" fill="url(#azureGrad)" strokeWidth={2} dot={false} />}
                    {hasGcp   && <Area type="monotone" dataKey="GCP"   stroke="#22c55e" fill="url(#gcpGrad)"   strokeWidth={2} dot={false} />}
                  </AreaChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        )}

        {/* Scan result toast */}
        {scanJobStatus?.status === 'queued' && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/60 px-4 py-2.5 text-sm text-slate-300">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            Scan na fila, aguardando início...
          </div>
        )}
        {scanJobStatus?.status === 'running' && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-700/40 bg-blue-900/20 px-4 py-2.5 text-sm text-blue-300">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            Escaneando recursos cloud... isso pode levar até 1 minuto.
          </div>
        )}
        {scanJobStatus?.status === 'done' && (
          <div className="flex items-center gap-2 rounded-lg border border-green-700/40 bg-green-900/20 px-4 py-2.5 text-sm text-green-300">
            <Zap size={14} />
            Scan concluído: <strong>{scanJobStatus.new_findings}</strong> novos desperdícios detectados.
          </div>
        )}
        {(scanMut.isError || scanJobStatus?.status === 'error') && (
          <div className="flex items-center gap-2 rounded-lg border border-red-700/40 bg-red-900/20 px-4 py-2.5 text-sm text-red-300">
            <AlertTriangle size={14} />
            {scanJobStatus?.error || 'Erro ao escanear. Verifique as credenciais da conta cloud.'}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-slate-700">
          <nav className="flex gap-1 -mb-px">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-indigo-500 text-indigo-500 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:border-gray-300 dark:hover:border-slate-600'
                }`}
              >
                <Icon size={15} />
                {label}
                {id === 'anomalies' && (anomaliesQ.data?.items?.filter((a) => a.status === 'open').length > 0) && (
                  <span className="ml-1 rounded-full bg-amber-600/30 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                    {anomaliesQ.data.items.filter((a) => a.status === 'open').length}
                  </span>
                )}
                {id === 'recommendations' && recsQ.data?.total > 0 && (
                  <span className="ml-1 rounded-full bg-indigo-600/30 px-1.5 py-0.5 text-xs font-semibold text-indigo-300">
                    {recsQ.data.items.filter((r) => r.status === 'pending').length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Recommendations Tab ── */}
        {activeTab === 'recommendations' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                <button
                  onClick={() => setFilterStatus('')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${!filterStatus ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                >
                  Todas
                </button>
                {FILTER_STATUS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
                    className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors border-l border-gray-200 dark:border-slate-700 ${filterStatus === s ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                  >
                    {s === 'pending' ? 'Pendente' : s === 'applied' ? 'Aplicada' : 'Ignorada'}
                  </button>
                ))}
              </div>

              <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                {FILTER_PROVIDER.map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilterProvider(p === filterProvider ? '' : p)}
                    className={`px-3 py-1.5 text-xs font-medium uppercase transition-colors ${p !== FILTER_PROVIDER[0] ? 'border-l border-gray-200 dark:border-slate-700' : ''} ${filterProvider === p ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                {['high', 'medium', 'low'].map((sev, i) => (
                  <button
                    key={sev}
                    onClick={() => setFilterSeverity(sev === filterSeverity ? '' : sev)}
                    className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${i > 0 ? 'border-l border-gray-200 dark:border-slate-700' : ''} ${filterSeverity === sev ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                  >
                    {sev === 'high' ? 'Alta' : sev === 'medium' ? 'Média' : 'Baixa'}
                  </button>
                ))}
              </div>

              {/* Export buttons */}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={handleExportCSV}
                  title="Exportar CSV"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <FileDown size={13} />
                  CSV
                </button>
                <button
                  onClick={handlePrintPDF}
                  title="Imprimir / Salvar como PDF"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Printer size={13} />
                  PDF
                </button>
              </div>
            </div>

            {/* List */}
            {recsQ.isLoading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : recsQ.isError ? (
              <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
                Erro ao carregar recomendações. Verifique as permissões.
              </div>
            ) : recsQ.data?.total === 0 ? (
              <EmptyState
                icon={TrendingDown}
                title="Nenhuma recomendação encontrada"
                description='Clique em "Escanear Agora" para detectar desperdícios'
              />
            ) : (
              <div className="space-y-3">
                {(recsQ.data?.items ?? []).map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    rec={rec}
                    onApply={handleApply}
                    onDismiss={handleDismiss}
                    applyLoading={applyingId === rec.id}
                    dismissLoading={dismissingId === rec.id}
                    planTier={planTier}
                  />
                ))}
                {/* Pagination */}
                {recsQ.data?.pages > 1 && (
                  <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200 dark:border-slate-700">
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      {recsQ.data.total} recomendações · Página {recsQ.data.page} de {recsQ.data.pages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={recsPage === 1}
                        onClick={() => setRecsPage(p => p - 1)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                      >
                        Anterior
                      </button>
                      <button
                        disabled={recsPage >= recsQ.data.pages}
                        onClick={() => setRecsPage(p => p + 1)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                      >
                        Próximo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Budgets Tab ── */}
        {activeTab === 'budgets' && (
          <div className="space-y-4">
            <PlanGate minPlan="pro" feature="Orçamentos">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
                  {evaluateBudgetsMut.isPending && (
                    <span className="flex items-center gap-1">
                      <RefreshCw size={11} className="animate-spin" />
                      Atualizando gastos…
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <PermissionGate permission="finops.budget">
                    <button
                      onClick={() => evaluateBudgetsMut.mutate()}
                      disabled={evaluateBudgetsMut.isPending}
                      title="Atualizar gastos agora"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw size={14} className={evaluateBudgetsMut.isPending ? 'animate-spin' : ''} />
                      Atualizar
                    </button>
                    <button
                      onClick={() => setShowBudgetModal(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                    >
                      <Plus size={16} />
                      Novo Orçamento
                    </button>
                  </PermissionGate>
                </div>
              </div>

              {budgetsQ.isLoading ? (
                <div className="flex justify-center py-12"><LoadingSpinner /></div>
              ) : budgetsQ.isError ? (
                <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
                  Erro ao carregar orçamentos.
                </div>
              ) : (budgetsQ.data ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-slate-500">
                  <Wallet size={40} className="mb-3 opacity-20" />
                  <p className="text-base font-medium">Nenhum orçamento criado</p>
                  <p className="text-sm mt-1">Defina limites de custo para receber alertas automáticos</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(budgetsQ.data ?? []).map((budget) => {
                    const pct = Math.min((budget.pct ?? 0) * 100, 100);
                    const barColor = pct >= budget.alert_threshold * 100
                      ? 'bg-red-500'
                      : pct >= (budget.alert_threshold * 100 * 0.75)
                        ? 'bg-yellow-500'
                        : 'bg-green-500';

                    const PERIOD_LABEL = { monthly: 'Mensal', quarterly: 'Trimestral', annual: 'Anual' };
                    return (
                      <div key={budget.id} className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800/60 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{budget.name}</p>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                              {budget.provider === 'all' ? 'Todos' : budget.provider.toUpperCase()} · {PERIOD_LABEL[budget.period]}
                            </p>
                          </div>
                          <PermissionGate permission="finops.budget">
                            <button
                              onClick={() => deleteBudgetMut.mutate(budget.id)}
                              className="text-gray-300 dark:text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </PermissionGate>
                        </div>

                        <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-slate-100">{fmtUSD(budget.amount)}</p>

                        <div className="mt-3 space-y-1">
                          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700">
                            <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
                            <span>Alerta em {Math.round(budget.alert_threshold * 100)}%</span>
                            <span>{pct.toFixed(1)}%</span>
                          </div>
                          {budget.last_spend != null && (
                            <p className="text-xs text-gray-500 dark:text-slate-500">
                              Gasto atual: <strong className="text-gray-700 dark:text-slate-300">{fmtUSD(budget.last_spend)}</strong>
                              {' '}/{' '}{fmtUSD(budget.amount)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </PlanGate>
          </div>
        )}

        {/* ── Reports Tab ── */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <PlanGate minPlan="pro" feature="Relatórios Automáticos">
              {reportScheduleQ.isLoading ? (
                <div className="flex justify-center py-12"><LoadingSpinner /></div>
              ) : (
                <div className="max-w-xl">
                  {reportScheduleQ.data?.schedule ? (
                    /* Existing schedule card */
                    <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800/60 p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/20">
                            <Mail size={18} className="text-indigo-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                              {reportScheduleQ.data.schedule.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">
                              {reportScheduleQ.data.schedule.schedule_type === 'weekly'
                                ? `Semanal · ${WEEK_DAYS.find((d) => d.value === reportScheduleQ.data.schedule.send_day)?.label ?? ''}`
                                : `Mensal · Dia ${reportScheduleQ.data.schedule.send_day}`
                              }
                              {' '}às {reportScheduleQ.data.schedule.send_time} · {reportScheduleQ.data.schedule.timezone}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${reportScheduleQ.data.schedule.is_enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                            {reportScheduleQ.data.schedule.is_enabled ? 'Ativo' : 'Inativo'}
                          </span>
                          <PermissionGate permission="finops.budget">
                            <button
                              onClick={() => setShowReportScheduleModal(true)}
                              className="text-gray-400 hover:text-indigo-400 transition-colors"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                          </PermissionGate>
                        </div>
                      </div>

                      {/* Recipients */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Destinatários</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(reportScheduleQ.data.schedule.recipients ?? []).map((e) => (
                            <span key={e} className="rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-xs text-gray-600 dark:text-slate-300">{e}</span>
                          ))}
                        </div>
                      </div>

                      {/* Sections */}
                      <div className="flex gap-3 flex-wrap">
                        {[
                          { key: 'include_costs',   label: 'Custos' },
                          { key: 'include_budgets', label: 'Orçamentos' },
                          { key: 'include_finops',  label: 'FinOps' },
                        ].map(({ key, label }) => (
                          <span key={key} className={`inline-flex items-center gap-1 text-xs ${reportScheduleQ.data.schedule[key] ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-slate-500 line-through'}`}>
                            <CheckCircle size={11} />
                            {label}
                          </span>
                        ))}
                      </div>

                      {/* Last run */}
                      {reportScheduleQ.data.schedule.last_run_at && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
                          {reportScheduleQ.data.schedule.last_run_status === 'success'
                            ? <CheckCircle size={11} className="text-green-400" />
                            : <XCircle size={11} className="text-red-400" />}
                          Último envio: {new Date(reportScheduleQ.data.schedule.last_run_at).toLocaleString('pt-BR')}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Empty state */
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-slate-500">
                      <Mail size={40} className="mb-3 opacity-20" />
                      <p className="text-base font-medium">Nenhum relatório agendado</p>
                      <p className="text-sm mt-1 mb-4">Configure o envio automático de resumos por email</p>
                      <PermissionGate permission="finops.budget">
                        <button
                          onClick={() => setShowReportScheduleModal(true)}
                          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                        >
                          <Plus size={16} />
                          Configurar Relatório
                        </button>
                      </PermissionGate>
                    </div>
                  )}
                </div>
              )}
            </PlanGate>
          </div>
        )}

        {/* ── Anomalies Tab ── */}
        {activeTab === 'anomalies' && (
          <div className="space-y-4">
            <PlanGate minPlan="pro" feature="Detecção de Anomalias">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Picos de custo detectados automaticamente por análise estatística (3σ acima da baseline).
                  </p>
                </div>
              </div>

              {anomaliesQ.isLoading ? (
                <div className="flex justify-center py-12"><LoadingSpinner /></div>
              ) : anomaliesQ.isError ? (
                <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
                  Erro ao carregar anomalias. Verifique as permissões.
                </div>
              ) : (anomaliesQ.data?.items ?? []).length === 0 ? (
                <EmptyState
                  icon={Bell}
                  title="Nenhuma anomalia detectada"
                  description="As anomalias são detectadas automaticamente durante o scan de custos"
                />
              ) : (
                <div className="space-y-3">
                  {(anomaliesQ.data?.items ?? []).map((anomaly) => {
                    const devPct = anomaly.deviation_pct ?? 0;
                    const isOpen = anomaly.status === 'open';
                    return (
                      <div
                        key={anomaly.id}
                        className={`rounded-xl border p-4 transition-colors ${
                          isOpen
                            ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-900/10'
                            : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800/40 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${isOpen ? 'bg-amber-500/20' : 'bg-gray-100 dark:bg-slate-700'}`}>
                              <AlertTriangle size={16} className={isOpen ? 'text-amber-400' : 'text-gray-400 dark:text-slate-500'} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                  {anomaly.service_name}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
                                  anomaly.provider === 'aws'   ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                  anomaly.provider === 'azure' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                }`}>
                                  {anomaly.provider}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isOpen ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                  {isOpen ? 'Aberta' : 'Reconhecida'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                Detectada em {anomaly.detected_date ? new Date(anomaly.detected_date).toLocaleDateString('pt-BR') : '—'}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-4 text-xs">
                                <span className="text-gray-500 dark:text-slate-400">
                                  Baseline: <strong className="text-gray-700 dark:text-slate-300">{fmtUSD(anomaly.baseline_cost)}/dia</strong>
                                </span>
                                <span className="text-gray-500 dark:text-slate-400">
                                  Observado: <strong className={devPct >= 100 ? 'text-red-400' : 'text-amber-400'}>{fmtUSD(anomaly.actual_cost)}/dia</strong>
                                </span>
                                <span className={`font-semibold ${devPct >= 200 ? 'text-red-400' : devPct >= 100 ? 'text-amber-400' : 'text-yellow-400'}`}>
                                  +{devPct.toFixed(0)}% acima do normal
                                </span>
                              </div>
                            </div>
                          </div>

                          {isOpen && (
                            <PermissionGate permission="finops.recommend">
                              <button
                                onClick={() => acknowledgeAnomalyMut.mutate(anomaly.id)}
                                disabled={acknowledgeAnomalyMut.isPending}
                                className="flex-shrink-0 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                              >
                                Reconhecer
                              </button>
                            </PermissionGate>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </PlanGate>
          </div>
        )}

        {/* ── Actions Tab ── */}
        {activeTab === 'actions' && (
          <div className="space-y-3">
            {actionsQ.isLoading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : (
              <ActionTimeline
                actions={actionsQ.data?.items || []}
                onRollback={handleRollback}
                rollbackLoading={rollbackId}
                planTier={planTier}
              />
            )}
          </div>
        )}

        {/* Budget modal */}
        {showBudgetModal && (
          <BudgetModal
            onClose={() => setShowBudgetModal(false)}
            onSave={(payload) => createBudgetMut.mutate(payload)}
            saving={createBudgetMut.isPending}
          />
        )}

        {/* Scan schedule modal */}
        {showScanScheduleModal && (
          <ScanScheduleModal
            onClose={() => setShowScanScheduleModal(false)}
            existing={scanScheduleQ.data ?? null}
            onSave={(payload) => upsertScanScheduleMut.mutate(payload)}
            onDelete={() => deleteScanScheduleMut.mutate()}
            saving={upsertScanScheduleMut.isPending}
            deleting={deleteScanScheduleMut.isPending}
          />
        )}

        {/* Report schedule modal */}
        {showReportScheduleModal && (
          <ReportScheduleModal
            onClose={() => setShowReportScheduleModal(false)}
            existing={reportScheduleQ.data?.schedule ?? null}
            onSave={(payload) => upsertReportScheduleMut.mutate(payload)}
            onDelete={() => deleteReportScheduleMut.mutate()}
            saving={upsertReportScheduleMut.isPending}
            deleting={deleteReportScheduleMut.isPending}
          />
        )}
      </div>
    </Layout>
  );
};

export default FinOps;
