import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, LogIn, FolderOpen, Search, RefreshCw,
  ChevronDown, ChevronRight, Download, AlertTriangle,
  CheckCircle, XCircle, Monitor, Globe, User,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import m365Service from '../../services/m365Service';

// ─ Helpers ───────────────────────────────────────────────────────────────────
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const thCls = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider';
const tdCls = 'px-4 py-3 text-sm text-gray-700 dark:text-gray-300';
const inputCls = 'px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

const TABS = [
  { id: 'signins',   label: 'Sign-ins',              icon: LogIn },
  { id: 'directory', label: 'Auditoria de Diretório', icon: FolderOpen },
];

const PERIOD_OPTIONS = [
  { label: 'Hoje',   days: 1 },
  { label: '7 dias', days: 7 },
  { label: '30 dias',days: 30 },
  { label: 'Todos',  days: null },
];

const CAT_COLORS = {
  UserManagement:        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  GroupManagement:       'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Authentication:        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Policy:                'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  RoleManagement:        'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  ApplicationManagement: 'bg-primary-50 text-primary-dark dark:bg-indigo-900/30 dark:text-primary-light',
};

const DIR_CATEGORIES = [
  { value: 'all',                   label: 'Todas as categorias' },
  { value: 'UserManagement',        label: 'Gestão de Usuários' },
  { value: 'GroupManagement',       label: 'Gestão de Grupos' },
  { value: 'Authentication',        label: 'Autenticação' },
  { value: 'Policy',                label: 'Política' },
  { value: 'RoleManagement',        label: 'Gestão de Funções' },
  { value: 'ApplicationManagement', label: 'Aplicativos' },
];

// ─ Stats Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color = 'gray', icon: Icon }) {
  const bg = {
    gray:  'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40',
    red:   'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40',
    blue:  'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40',
  };
  const ic = { gray: 'text-gray-400', green: 'text-green-500', red: 'text-red-500', blue: 'text-blue-500' };
  return (
    <div className={`rounded-xl border p-4 ${bg[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value ?? '—'}</p>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mt-0.5">{label}</p>
        </div>
        {Icon && <Icon size={18} className={ic[color]} />}
      </div>
    </div>
  );
}

// ─ Period Pills ───────────────────────────────────────────────────────────────
function PeriodPills({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {PERIOD_OPTIONS.map(({ label, days }) => (
        <button
          key={label}
          onClick={() => onChange(days)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            value === days
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─ Skeleton Row ───────────────────────────────────────────────────────────────
function SkeletonRow({ cols }) {
  return (
    <tr>{Array.from({ length: cols }).map((_, i) => (
      <td key={i} className={tdCls}>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </td>
    ))}</tr>
  );
}

// ─ CSV Export ─────────────────────────────────────────────────────────────────
function exportCsv(rows, columns, filename) {
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(r =>
    columns.map(c => `"${String(c.fn(r) ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─ Sign-ins Tab ───────────────────────────────────────────────────────────────
function SignInsTab() {
  const [upn, setUpn]       = useState('');
  const [status, setStatus] = useState('all');
  const [days, setDays]     = useState(7);
  const [params, setParams] = useState({ limit: 100, days: 7 });

  const q = useQuery({
    queryKey: ['m365-signins', params],
    queryFn: () => m365Service.getSignIns(params),
    staleTime: 120_000,
    retry: false,
  });

  const doSearch = () => setParams({
    limit: 100,
    ...(upn ? { upn } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(days != null ? { days } : {}),
  });

  const rows = q.data?.sign_ins || [];

  const stats = useMemo(() => ({
    total: rows.length,
    failures: rows.filter(r => r.status_code !== 0).length,
    uniqueUsers: new Set(rows.map(r => r.upn).filter(Boolean)).size,
    uniqueIps:   new Set(rows.map(r => r.ip_address).filter(Boolean)).size,
  }), [rows]);

  const CSV_COLS = [
    { label: 'Usuário',    fn: r => r.user_display_name },
    { label: 'UPN',        fn: r => r.upn },
    { label: 'Aplicativo', fn: r => r.app_display_name },
    { label: 'IP',         fn: r => r.ip_address },
    { label: 'Cidade',     fn: r => r.city },
    { label: 'País',       fn: r => r.country },
    { label: 'Status',     fn: r => r.status_code === 0 ? 'Sucesso' : `Falha (${r.status_code})` },
    { label: 'OS',         fn: r => r.device_os },
    { label: 'Browser',    fn: r => r.browser },
    { label: 'Data/Hora',  fn: r => r.created_at },
  ];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">UPN / E-mail</label>
          <input
            type="text" value={upn} onChange={(e) => setUpn(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="usuario@empresa.com" className={`w-full ${inputCls}`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="all">Todos</option>
            <option value="success">Sucesso</option>
            <option value="failure">Falha</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Período</label>
          <PeriodPills value={days} onChange={setDays} />
        </div>
        <button
          onClick={doSearch} disabled={q.isFetching}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {q.isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
        {rows.length > 0 && (
          <button
            onClick={() => exportCsv(rows, CSV_COLS, 'signins.csv')}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Download size={14} /> Exportar CSV
          </button>
        )}
      </div>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total"           value={stats.total}       color="gray"  icon={LogIn} />
          <StatCard label="Falhas"          value={stats.failures}    color={stats.failures > 0 ? 'red' : 'green'} icon={stats.failures > 0 ? XCircle : CheckCircle} />
          <StatCard label="Usuários únicos" value={stats.uniqueUsers} color="blue"  icon={User} />
          <StatCard label="IPs únicos"      value={stats.uniqueIps}   color="gray"  icon={Globe} />
        </div>
      )}

      {/* Table */}
      <div className="card rounded-xl overflow-hidden">
        {q.isError ? (
          <div className="flex items-center gap-2 p-6 text-sm text-red-500">
            <AlertTriangle size={16} />
            Erro ao carregar sign-ins. Verifique a permissão
            <code className="bg-red-50 dark:bg-red-900/20 px-1 rounded ml-1">AuditLog.Read.All</code>.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={thCls}>Usuário</th>
                <th className={thCls}>Aplicativo</th>
                <th className={thCls}>IP / Localização</th>
                <th className={thCls}>Dispositivo</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {q.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    {q.data?.error === 'permission_denied'
                      ? 'Sem permissão. Verifique AuditLog.Read.All (Application) + licença Entra ID P1/P2.'
                      : 'Nenhum resultado. Ajuste os filtros e clique em Buscar.'}
                  </td>
                </tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className={tdCls}>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{r.user_display_name || '—'}</p>
                    <p className="text-xs text-gray-400">{r.upn || ''}</p>
                  </td>
                  <td className={tdCls}>{r.app_display_name || '—'}</td>
                  <td className={tdCls}>
                    <p>{r.ip_address || '—'}</p>
                    {(r.city || r.country) && (
                      <p className="text-xs text-gray-400">{[r.city, r.country].filter(Boolean).join(', ')}</p>
                    )}
                  </td>
                  <td className={tdCls}>
                    {r.device_os ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Monitor size={11} /> {r.device_os}
                      </span>
                    ) : '—'}
                    {r.browser && <p className="text-xs text-gray-400 mt-0.5">{r.browser}</p>}
                  </td>
                  <td className={tdCls}>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      r.status_code === 0
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {r.status_code === 0
                        ? <><CheckCircle size={10} /> Sucesso</>
                        : <><XCircle size={10} /> Falha ({r.status_code})</>}
                    </span>
                    {r.status_reason && r.status_code !== 0 && (
                      <p className="text-xs text-gray-400 mt-0.5 max-w-[160px] truncate" title={r.status_reason}>
                        {r.status_reason}
                      </p>
                    )}
                  </td>
                  <td className={tdCls}>{fmtDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {q.data?.total > rows.length && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
            Mostrando {rows.length} de {q.data.total} registros. Refine os filtros para mais resultados.
          </div>
        )}
      </div>
    </div>
  );
}

// ─ Directory Audits Tab ───────────────────────────────────────────────────────
function DirectoryAuditsTab() {
  const [category, setCategory] = useState('all');
  const [days, setDays]         = useState(7);
  const [params, setParams]     = useState({ limit: 100, days: 7 });
  const [expanded, setExpanded] = useState(null);

  const q = useQuery({
    queryKey: ['m365-dir-audits', params],
    queryFn: () => m365Service.getDirectoryAudits(params),
    staleTime: 120_000,
    retry: false,
  });

  const doSearch = () => setParams({
    limit: 100,
    ...(category !== 'all' ? { category } : {}),
    ...(days != null ? { days } : {}),
  });

  const rows = q.data?.audits || [];

  const stats = useMemo(() => ({
    total:      rows.length,
    failures:   rows.filter(r => r.result?.toLowerCase() === 'failure').length,
    categories: new Set(rows.map(r => r.category).filter(Boolean)).size,
    actors:     new Set(rows.map(r => r.initiated_by_upn).filter(Boolean)).size,
  }), [rows]);

  const CSV_COLS = [
    { label: 'Atividade',    fn: r => r.activity_display_name },
    { label: 'Categoria',    fn: r => r.category },
    { label: 'Resultado',    fn: r => r.result },
    { label: 'Iniciado por', fn: r => r.initiated_by_upn || r.initiated_by_display_name },
    { label: 'Alvo',         fn: r => r.target_display_name },
    { label: 'Data/Hora',    fn: r => r.activity_at },
  ];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Categoria</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {DIR_CATEGORIES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Período</label>
          <PeriodPills value={days} onChange={setDays} />
        </div>
        <button
          onClick={doSearch} disabled={q.isFetching}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {q.isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
        {rows.length > 0 && (
          <button
            onClick={() => exportCsv(rows, CSV_COLS, 'auditoria-diretorio.csv')}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Download size={14} /> Exportar CSV
          </button>
        )}
      </div>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total"         value={stats.total}      color="gray"  icon={FolderOpen} />
          <StatCard label="Falhas"        value={stats.failures}   color={stats.failures > 0 ? 'red' : 'green'} icon={stats.failures > 0 ? XCircle : CheckCircle} />
          <StatCard label="Categorias"    value={stats.categories} color="blue"  icon={BookOpen} />
          <StatCard label="Atores únicos" value={stats.actors}     color="gray"  icon={User} />
        </div>
      )}

      {/* Table */}
      <div className="card rounded-xl overflow-hidden">
        {q.isError ? (
          <div className="flex items-center gap-2 p-6 text-sm text-red-500">
            <AlertTriangle size={16} />
            Erro ao carregar auditoria. Verifique a permissão
            <code className="bg-red-50 dark:bg-red-900/20 px-1 rounded ml-1">AuditLog.Read.All</code>.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="w-8 px-3 py-3" />
                <th className={thCls}>Atividade</th>
                <th className={thCls}>Categoria</th>
                <th className={thCls}>Resultado</th>
                <th className={thCls}>Iniciado por</th>
                <th className={thCls}>Alvo</th>
                <th className={thCls}>Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {q.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    Nenhum resultado. Ajuste os filtros e clique em Buscar.
                  </td>
                </tr>
              ) : rows.map((r) => (
                <>
                  <tr
                    key={r.id}
                    onClick={() => r.modified_properties?.length && setExpanded(p => p === r.id ? null : r.id)}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${r.modified_properties?.length ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-3 py-3 text-gray-400">
                      {r.modified_properties?.length > 0
                        ? expanded === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                        : null}
                    </td>
                    <td className={tdCls}>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.activity_display_name || '—'}</p>
                      {r.result_reason && <p className="text-xs text-gray-400 mt-0.5">{r.result_reason}</p>}
                    </td>
                    <td className={tdCls}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CAT_COLORS[r.category] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {r.category || '—'}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        r.result?.toLowerCase() === 'success'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : r.result?.toLowerCase() === 'failure'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {r.result?.toLowerCase() === 'success' && <CheckCircle size={10} />}
                        {r.result?.toLowerCase() === 'failure' && <XCircle size={10} />}
                        {r.result || '—'}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <p className="text-gray-900 dark:text-gray-100">{r.initiated_by_display_name || '—'}</p>
                      {r.initiated_by_upn && <p className="text-xs text-gray-400">{r.initiated_by_upn}</p>}
                    </td>
                    <td className={tdCls}>{r.target_display_name || '—'}</td>
                    <td className={tdCls}>{fmtDateTime(r.activity_at)}</td>
                  </tr>

                  {/* Expanded — modified properties */}
                  {expanded === r.id && r.modified_properties?.length > 0 && (
                    <tr key={`${r.id}-exp`} className="bg-blue-50/50 dark:bg-blue-900/10">
                      <td colSpan={7} className="px-6 py-3">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                          Propriedades modificadas
                        </p>
                        <div className="space-y-1.5">
                          {r.modified_properties.map((mp, i) => (
                            <div key={i} className="grid grid-cols-[200px_1fr_1fr] gap-3 text-xs">
                              <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{mp.name}</span>
                              <span className="text-red-600 dark:text-red-400 truncate">
                                {mp.old
                                  ? <><span className="text-gray-400 mr-1">antes:</span>{mp.old}</>
                                  : <span className="text-gray-400 italic">vazio</span>}
                              </span>
                              <span className="text-green-600 dark:text-green-400 truncate">
                                {mp.new
                                  ? <><span className="text-gray-400 mr-1">depois:</span>{mp.new}</>
                                  : <span className="text-gray-400 italic">vazio</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
        {q.data?.total > rows.length && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
            Mostrando {rows.length} de {q.data.total} registros.
          </div>
        )}
      </div>
    </div>
  );
}

// ─ Main Page ──────────────────────────────────────────────────────────────────
export default function Audit() {
  const [activeTab, setActiveTab] = useState('signins');

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-blue-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Auditoria M365</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Monitore sign-ins e alterações no diretório</p>
          </div>
        </div>

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'signins'   && <SignInsTab />}
        {activeTab === 'directory' && <DirectoryAuditsTab />}
      </div>
    </Layout>
  );
}
