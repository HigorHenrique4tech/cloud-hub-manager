import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, LogIn, FolderOpen, Search, RefreshCw } from 'lucide-react';
import Layout from '../../components/layout/layout';
import m365Service from '../../services/m365Service';

// ─ Helpers ──────────────────────────────────────────────────────────────────
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const thCls = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider';
const tdCls = 'px-4 py-3 text-sm text-gray-700 dark:text-gray-300';

const TABS = [
  { id: 'signins',   label: 'Sign-ins',            icon: LogIn },
  { id: 'directory', label: 'Auditoria de Diretório', icon: FolderOpen },
];

// ─ Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRow({ cols }) {
  return (
    <tr>{Array.from({ length: cols }).map((_, i) => (
      <td key={i} className={tdCls}>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </td>
    ))}</tr>
  );
}

// ─ Sign-ins Tab ──────────────────────────────────────────────────────────────
function SignInsTab() {
  const [upn, setUpn]       = useState('');
  const [status, setStatus] = useState('all');
  const [enabled, setEnabled] = useState(false);
  const [params, setParams]   = useState({ limit: 50 });

  const q = useQuery({
    queryKey: ['m365-signins', params],
    queryFn: () => m365Service.getSignIns(params),
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  const doSearch = () => {
    setParams({ limit: 50, ...(upn ? { upn } : {}), ...(status !== 'all' ? { status } : {}) });
    setEnabled(true);
  };

  const rows = q.data?.sign_ins || [];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">UPN / E-mail</label>
          <input
            type="text"
            value={upn}
            onChange={(e) => setUpn(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="usuario@empresa.com"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos</option>
            <option value="success">Sucesso</option>
            <option value="failure">Falha</option>
          </select>
        </div>
        <button
          onClick={doSearch}
          disabled={q.isFetching}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {q.isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      {/* Table */}
      {enabled && (
        <div className="card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={thCls}>Usuário</th>
                <th className={thCls}>Aplicativo</th>
                <th className={thCls}>IP / Localização</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {q.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    {q.isError
                      ? 'Erro ao carregar sign-ins. Verifique a permissão AuditLog.Read.All.'
                      : 'Nenhum resultado encontrado.'}
                  </td>
                </tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className={tdCls}>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.user_display_name || '—'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.upn || ''}</p>
                    </div>
                  </td>
                  <td className={tdCls}>{r.app_display_name || '—'}</td>
                  <td className={tdCls}>
                    <div>
                      <p>{r.ip_address || '—'}</p>
                      {(r.city || r.country) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {[r.city, r.country].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className={tdCls}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      r.status_code === 0
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {r.status_code === 0 ? 'Sucesso' : `Falha (${r.status_code})`}
                    </span>
                    {r.status_reason && r.status_code !== 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{r.status_reason}</p>
                    )}
                  </td>
                  <td className={tdCls}>{fmtDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.data?.total > rows.length && (
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Mostrando {rows.length} de {q.data.total} registros. Refine os filtros para resultados mais específicos.
              </p>
            </div>
          )}
        </div>
      )}

      {!enabled && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <LogIn className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">Use os filtros acima e clique em Buscar para carregar os sign-ins</p>
          <p className="text-xs mt-1">Requer permissão <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">AuditLog.Read.All</code></p>
        </div>
      )}
    </div>
  );
}

// ─ Directory Audits Tab ───────────────────────────────────────────────────────
const DIR_CATEGORIES = [
  { value: 'all',               label: 'Todas as categorias' },
  { value: 'UserManagement',    label: 'Gestão de Usuários' },
  { value: 'GroupManagement',   label: 'Gestão de Grupos' },
  { value: 'Authentication',    label: 'Autenticação' },
  { value: 'Policy',            label: 'Política' },
  { value: 'RoleManagement',    label: 'Gestão de Funções' },
  { value: 'ApplicationManagement', label: 'Aplicativos' },
];

const RESULT_COLORS = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failure: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const CAT_COLORS = {
  UserManagement:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  GroupManagement:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Authentication:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Policy:            'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  RoleManagement:    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  ApplicationManagement: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
};

function DirectoryAuditsTab() {
  const [category, setCategory] = useState('all');
  const [enabled, setEnabled]   = useState(false);
  const [params, setParams]     = useState({ limit: 50 });

  const q = useQuery({
    queryKey: ['m365-dir-audits', params],
    queryFn: () => m365Service.getDirectoryAudits(params),
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  const doSearch = () => {
    setParams({ limit: 50, ...(category !== 'all' ? { category } : {}) });
    setEnabled(true);
  };

  const rows = q.data?.audits || [];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Categoria</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {DIR_CATEGORIES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={doSearch}
          disabled={q.isFetching}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {q.isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      {/* Table */}
      {enabled && (
        <div className="card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
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
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    {q.isError
                      ? 'Erro ao carregar auditoria. Verifique a permissão AuditLog.Read.All.'
                      : 'Nenhum resultado encontrado.'}
                  </td>
                </tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className={tdCls}>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{r.activity_display_name || '—'}</p>
                  </td>
                  <td className={tdCls}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CAT_COLORS[r.category] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {r.category || '—'}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RESULT_COLORS[r.result?.toLowerCase()] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {r.result || '—'}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <div>
                      <p className="text-gray-900 dark:text-gray-100">{r.initiated_by_display_name || '—'}</p>
                      {r.initiated_by_upn && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{r.initiated_by_upn}</p>
                      )}
                    </div>
                  </td>
                  <td className={tdCls}>{r.target_display_name || '—'}</td>
                  <td className={tdCls}>{fmtDateTime(r.activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.data?.total > rows.length && (
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Mostrando {rows.length} de {q.data.total} registros.
              </p>
            </div>
          )}
        </div>
      )}

      {!enabled && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <FolderOpen className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">Selecione uma categoria e clique em Buscar</p>
          <p className="text-xs mt-1">Requer permissão <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">AuditLog.Read.All</code></p>
        </div>
      )}
    </div>
  );
}

// ─ Main Page ─────────────────────────────────────────────────────────────────
export default function Audit() {
  const [activeTab, setActiveTab] = useState('signins');

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-blue-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Auditoria M365</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Monitore sign-ins e alterações no diretório</p>
          </div>
        </div>

        {/* Tabs */}
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

        {/* Content */}
        {activeTab === 'signins'   && <SignInsTab />}
        {activeTab === 'directory' && <DirectoryAuditsTab />}
      </div>
    </Layout>
  );
}
