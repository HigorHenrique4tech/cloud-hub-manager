import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, HardDrive, BarChart2, Search, ChevronRight, X, FileText, Folder, RefreshCw, ExternalLink, Cloud } from 'lucide-react';
import Layout from '../../components/layout/layout';
import m365Service from '../../services/m365Service';
import { useEscapeKey } from '../../hooks/useEscapeKey';

// ─ Helpers ─────────────────────────────────────────────────────────────────
const fmtBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, b = bytes;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(1)} ${units[i]}`;
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
const thCls = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider';
const tdCls = 'px-4 py-3 text-sm text-gray-700 dark:text-gray-300';

const TABS = [
  { id: 'overview',  label: 'Visão Geral',  icon: BarChart2 },
  { id: 'sites',     label: 'Sites',        icon: Globe },
  { id: 'libraries', label: 'Bibliotecas',  icon: HardDrive },
  { id: 'onedrive',  label: 'OneDrive',     icon: Cloud },
];

// ─ Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRow({ cols = 4 }) {
  return (
    <tr>{Array.from({ length: cols }).map((_, i) => (
      <td key={i} className={tdCls}><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
    ))}</tr>
  );
}

// ─ Site Detail Drawer ────────────────────────────────────────────────────────
function SiteDrawer({ site, onClose, onBrowse }) {
  useEscapeKey(!!site, onClose);

  const drivesQ = useQuery({
    queryKey: ['m365-sp-drives', site?.id],
    queryFn: () => m365Service.getSiteDrives(site.id),
    enabled: !!site,
    retry: false,
  });

  if (!site) return null;
  const drives = drivesQ.data?.drives || [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-500" />
            <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate max-w-xs">{site.display_name || site.name}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Info */}
          <div className="space-y-2 text-sm">
            {site.web_url && (
              <a href={site.web_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline text-xs">
                <ExternalLink className="w-3 h-3" /> Abrir no SharePoint
              </a>
            )}
            {site.description && <p className="text-gray-500 dark:text-gray-400 text-xs">{site.description}</p>}
            <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>Criado: {fmtDate(site.created_at)}</span>
              <span>Modificado: {fmtDate(site.last_modified)}</span>
            </div>
          </div>

          {/* Libraries */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Bibliotecas de Documentos</p>
            {drivesQ.isLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}</div>
            ) : drives.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhuma biblioteca encontrada.</p>
            ) : (
              <div className="space-y-2">
                {drives.map(d => (
                  <button
                    key={d.id}
                    onClick={() => onBrowse(d)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{d.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{fmtBytes(d.quota_used)} usados</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─ Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ onSelectSite }) {
  const sitesQ = useQuery({ queryKey: ['m365-sp-sites'], queryFn: () => m365Service.getSites(), retry: false, staleTime: 120_000 });
  const [visibleCount, setVisibleCount] = useState(20);

  const sites = sitesQ.data?.sites || [];
  const total = sitesQ.data?.total || 0;

  // Sort by last modified descending for "recently active" list
  const sorted = useMemo(() =>
    [...sites].sort((a, b) => new Date(b.last_modified || 0) - new Date(a.last_modified || 0)),
  [sites]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total de Sites', value: total || '—', color: 'text-blue-500' },
          { label: 'Sites Ativos (modificados)', value: sites.filter(s => s.last_modified).length || '—', color: 'text-green-500' },
          { label: 'Criados recentemente', value: sites.filter(s => {
            if (!s.created_at) return false;
            return (Date.now() - new Date(s.created_at)) < 30 * 86400 * 1000;
          }).length || '—', color: 'text-purple-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Sites list sorted by last modified */}
      <div className="card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Sites Recentemente Modificados</p>
        </div>
        {sitesQ.isLoading ? (
          <div className="p-4 space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}</div>
        ) : sorted.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">Nenhum site encontrado. Verifique a permissão <code>Sites.Read.All</code>.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {sorted.slice(0, visibleCount).map((s) => (
              <button
                key={s.id}
                onClick={() => onSelectSite(s)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {s.display_name || s.name}
                  </span>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                    Modificado: {fmtDate(s.last_modified)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            ))}
            {sorted.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(v => v + 20)}
                className="w-full py-3 text-sm text-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                Carregar mais ({sorted.length - visibleCount} restantes)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─ Sites Tab ─────────────────────────────────────────────────────────────────
function SitesTab({ onSelectSite }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const sitesQ = useQuery({
    queryKey: ['m365-sp-sites', query],
    queryFn: () => m365Service.getSites(query || undefined),
    staleTime: 120_000,
    retry: false,
  });

  const sites = sitesQ.data?.sites || [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Buscar sites..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setQuery(search)}
          />
        </div>
        <button onClick={() => setQuery(search)} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">Buscar</button>
        {query && <button onClick={() => { setQuery(''); setSearch(''); }} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Limpar</button>}
      </div>

      <div className="card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className={thCls}>Nome do Site</th>
              <th className={thCls}>URL</th>
              <th className={thCls}>Criado em</th>
              <th className={thCls}>Última Modificação</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sitesQ.isLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              : sites.length === 0
              ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum site encontrado. Verifique a permissão <code>Sites.Read.All</code>.</td></tr>
              : sites.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => onSelectSite(s)}>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">{s.display_name || s.name}</span>
                    </div>
                  </td>
                  <td className={`${tdCls} max-w-xs`}>
                    <a href={s.web_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs truncate block" onClick={e => e.stopPropagation()}>{s.web_url}</a>
                  </td>
                  <td className={tdCls}>{fmtDate(s.created_at)}</td>
                  <td className={tdCls}>{fmtDate(s.last_modified)}</td>
                  <td className={tdCls}><ChevronRight className="w-4 h-4 text-gray-400" /></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─ Libraries Tab ─────────────────────────────────────────────────────────────
function LibrariesTab() {
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedDriveId, setSelectedDriveId] = useState('');

  const sitesQ = useQuery({ queryKey: ['m365-sp-sites'], queryFn: () => m365Service.getSites(), staleTime: 120_000, retry: false });
  const drivesQ = useQuery({
    queryKey: ['m365-sp-drives', selectedSiteId],
    queryFn: () => m365Service.getSiteDrives(selectedSiteId),
    enabled: !!selectedSiteId,
    staleTime: 60_000,
    retry: false,
  });
  const itemsQ = useQuery({
    queryKey: ['m365-sp-items', selectedDriveId],
    queryFn: () => m365Service.getDriveItems(selectedDriveId),
    enabled: !!selectedDriveId,
    staleTime: 30_000,
    retry: false,
  });

  const sites = sitesQ.data?.sites || [];
  const drives = drivesQ.data?.drives || [];
  const items = itemsQ.data?.items || [];

  const getFileIcon = (item) => item.is_folder ? Folder : FileText;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Site</label>
          <select
            className={inputCls}
            value={selectedSiteId}
            onChange={e => { setSelectedSiteId(e.target.value); setSelectedDriveId(''); }}
          >
            <option value="">Selecione um site...</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.display_name || s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Biblioteca</label>
          <select
            className={inputCls}
            value={selectedDriveId}
            onChange={e => setSelectedDriveId(e.target.value)}
            disabled={!selectedSiteId || drivesQ.isLoading}
          >
            <option value="">Selecione uma biblioteca...</option>
            {drives.map(d => <option key={d.id} value={d.id}>{d.name} ({fmtBytes(d.quota_used)})</option>)}
          </select>
        </div>
      </div>

      {selectedDriveId && (
        <div className="card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={thCls}>Nome</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>Tamanho</th>
                <th className={thCls}>Última Modificação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {itemsQ.isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
                : items.length === 0
                ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Pasta vazia.</td></tr>
                : items.map(item => {
                  const Icon = getFileIcon(item);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className={tdCls}>
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 flex-shrink-0 ${item.is_folder ? 'text-yellow-500' : 'text-blue-400'}`} />
                          <a href={item.web_url} target="_blank" rel="noreferrer" className="hover:text-blue-500 hover:underline">{item.name}</a>
                        </div>
                      </td>
                      <td className={tdCls}>{item.is_folder ? 'Pasta' : (item.mime_type?.split('/')[1]?.toUpperCase() || 'Arquivo')}</td>
                      <td className={tdCls}>{item.is_folder ? `${item.child_count} itens` : fmtBytes(item.size)}</td>
                      <td className={tdCls}>{fmtDate(item.last_modified)}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      )}

      {!selectedDriveId && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <HardDrive className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">Selecione um site e uma biblioteca para ver os arquivos</p>
        </div>
      )}
    </div>
  );
}

// ─ OneDrive Tab ──────────────────────────────────────────────────────────────
function OneDriveTab() {
  const usageQ = useQuery({
    queryKey: ['m365-onedrive-usage'],
    queryFn: m365Service.getOneDriveUsage,
    staleTime: 300_000,
    retry: false,
  });

  const rows = usageQ.data?.usage || [];

  const totals = rows.reduce((acc, r) => ({
    users: acc.users + 1,
    storage: acc.storage + (r.storage_used_bytes || 0),
    active: acc.active + (r.last_activity ? 1 : 0),
  }), { users: 0, storage: 0, active: 0 });

  const barColor = (pct) => {
    if (pct > 90) return 'bg-red-500';
    if (pct > 70) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total de Usuários', value: totals.users.toLocaleString(), color: 'text-blue-500' },
          { label: 'Storage Total Usado', value: fmtBytes(totals.storage), color: 'text-purple-500' },
          { label: 'Ativos (D30)', value: totals.active.toLocaleString(), color: 'text-green-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className={thCls}>Usuário</th>
              <th className={thCls}>Storage Usado</th>
              <th className={thCls}>Alocado</th>
              <th className={thCls}>Uso %</th>
              <th className={thCls}>Última Atividade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {usageQ.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  {usageQ.isError
                    ? 'Sem dados de OneDrive. Verifique a permissão Reports.Read.All.'
                    : 'Nenhum dado encontrado.'}
                </td>
              </tr>
            ) : rows.map((r, idx) => {
              const pct = r.storage_allocated_bytes
                ? Math.round((r.storage_used_bytes / r.storage_allocated_bytes) * 100)
                : 0;
              return (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className={tdCls}>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{r.display_name || '—'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.upn || ''}</p>
                    </div>
                  </td>
                  <td className={tdCls}>{fmtBytes(r.storage_used_bytes)}</td>
                  <td className={tdCls}>{fmtBytes(r.storage_allocated_bytes)}</td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor(pct)} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-xs w-8 text-right">{pct}%</span>
                    </div>
                  </td>
                  <td className={tdCls}>{fmtDate(r.last_activity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─ Main Page ─────────────────────────────────────────────────────────────────
export default function SharePoint() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedSite, setSelectedSite] = useState(null);
  const [browseDrive, setBrowseDrive] = useState(null);

  const handleBrowse = (drive) => {
    setBrowseDrive(drive);
    setSelectedSite(null);
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-blue-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SharePoint</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie sites e bibliotecas de documentos</p>
            </div>
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
        {activeTab === 'overview'   && <OverviewTab onSelectSite={setSelectedSite} />}
        {activeTab === 'sites'      && <SitesTab onSelectSite={setSelectedSite} />}
        {activeTab === 'libraries'  && <LibrariesTab />}
        {activeTab === 'onedrive'   && <OneDriveTab />}
      </div>

      {/* Site Drawer */}
      {selectedSite && (
        <SiteDrawer
          site={selectedSite}
          onClose={() => setSelectedSite(null)}
          onBrowse={handleBrowse}
        />
      )}
    </Layout>
  );
}
