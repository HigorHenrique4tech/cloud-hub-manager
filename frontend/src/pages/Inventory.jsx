import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch, Download, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import Layout from '../components/layout/layout';
import SkeletonTable from '../components/common/SkeletonTable';
import EmptyState from '../components/common/emptystate';
import inventoryService from '../services/inventoryService';

const PROVIDER_COLORS = {
  aws:   { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  azure: { bg: 'bg-sky-100 dark:bg-sky-900/30',       text: 'text-sky-700 dark:text-sky-400'       },
  gcp:   { bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-400'   },
};

const RESOURCE_TYPE_LABELS = {
  ec2: 'EC2', s3: 'S3', rds: 'RDS', lambda: 'Lambda',
  vm: 'Virtual Machine', storage: 'Storage', database: 'Database', appservice: 'App Service',
  compute: 'Compute', bucket: 'Bucket', sql: 'Cloud SQL', function: 'Function',
};

const PROVIDER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'aws', label: 'AWS' },
  { value: 'azure', label: 'Azure' },
  { value: 'gcp', label: 'GCP' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'ec2', label: 'EC2' }, { value: 's3', label: 'S3' }, { value: 'rds', label: 'RDS' }, { value: 'lambda', label: 'Lambda' },
  { value: 'virtualmachines', label: 'VM (Azure)' }, { value: 'storageaccounts', label: 'Storage (Azure)' },
  { value: 'servers', label: 'SQL Server (Azure)' }, { value: 'sites', label: 'App Service (Azure)' },
  { value: 'compute', label: 'Compute (GCP)' }, { value: 'bucket', label: 'Bucket (GCP)' }, { value: 'sql', label: 'Cloud SQL' }, { value: 'function', label: 'Function' },
];

const ProviderBadge = ({ provider }) => {
  const meta = PROVIDER_COLORS[provider] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium uppercase ${meta.bg} ${meta.text}`}>
      {provider}
    </span>
  );
};

const PAGE_SIZE = 50;

const Inventory = () => {
  const [provider, setProvider] = useState('all');
  const [resourceType, setResourceType] = useState('all');
  const [page, setPage] = useState(1);

  const [forceRefresh, setForceRefresh] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['inventory', provider, resourceType, page, forceRefresh],
    queryFn: () => inventoryService.getInventory({
      provider, resource_type: resourceType, page, page_size: PAGE_SIZE,
      ...(forceRefresh ? { refresh: true } : {}),
    }),
    staleTime: 5 * 60 * 1000,
    keepPreviousData: true,
  });

  const handleRefresh = () => {
    setForceRefresh(true);
    // Reset flag after query fires so subsequent navigations use cache
    setTimeout(() => setForceRefresh(false), 500);
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const handleFilterChange = (setter) => (val) => {
    setter(val);
    setPage(1);
  };

  const handleExport = async () => {
    try {
      const blob = await inventoryService.exportInventory({ provider, resource_type: resourceType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <PackageSearch size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Inventário de Recursos</h1>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {isLoading ? 'Carregando...' : `${total} recurso${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <button
              onClick={handleExport}
              disabled={isLoading || total === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              <Download size={13} />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={provider}
            onChange={(e) => handleFilterChange(setProvider)(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
          >
            {PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={resourceType}
            onChange={(e) => handleFilterChange(setResourceType)(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
          >
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <SkeletonTable columns={7} rows={10} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Nenhum recurso encontrado"
              description="Adicione credenciais de nuvem no workspace ou ajuste os filtros."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Provider</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Grupo de Recurso</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Região</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Spec</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3"><ProviderBadge provider={item.provider} /></td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-slate-400">
                        {RESOURCE_TYPE_LABELS[item.resource_type] || item.resource_type}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate max-w-[200px]">{item.name}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500 font-mono truncate max-w-[200px]" title={item.resource_id}>{item.resource_id}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                        {item.resource_group || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${item.status === 'running' || item.status === 'available' || item.status === 'active' || item.status === 'succeeded' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-slate-400'}`}>
                          {item.status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">{item.region || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">{item.cost_hint || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Página {page} de {pages} · {total} recursos
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isFetching}
                className="p-1.5 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages || isFetching}
                className="p-1.5 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Inventory;
