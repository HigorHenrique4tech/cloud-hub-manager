import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Container, RefreshCw, ChevronDown, ChevronRight, Tag, Package } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import azureService from '../../services/azureservices';

const RegistryPanel = ({ registry }) => {
  const [open, setOpen] = useState(false);
  const reposQ = useQuery({
    queryKey: ['acr-repos', registry.login_server],
    queryFn: () => azureService.listAcrRepositories(registry.login_server),
    enabled: open, retry: false,
  });
  const repos = reposQ.data?.repositories || [];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        <Container size={16} className="text-sky-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{registry.name}</p>
          <p className="text-[11px] text-gray-400 font-mono truncate">{registry.login_server}</p>
        </div>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">{registry.sku}</span>
        <span className="text-xs text-gray-400">{registry.location}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 px-4 py-3">
          {reposQ.isLoading ? (
            <div className="py-4 flex justify-center"><LoadingSpinner /></div>
          ) : reposQ.data && !reposQ.data.success ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 py-2">
              Não foi possível listar repositórios (verifique a role AcrPull/AcrPush no service principal).
            </p>
          ) : repos.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Nenhum repositório.</p>
          ) : (
            <div className="space-y-1.5">
              {repos.map((r, i) => (
                <div key={i} className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <Package size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{r.name}</p>
                    <div className="flex items-center gap-1 flex-wrap mt-0.5">
                      <Tag size={9} className="text-gray-400" />
                      {(r.tags || []).slice(0, 8).map((t) => (
                        <span key={t} className="px-1 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono">{t}</span>
                      ))}
                      {r.tag_count > 8 && <span className="text-[10px] text-gray-400">+{r.tag_count - 8}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AzureACR = () => {
  const q = useQuery({ queryKey: ['azure-acr'], queryFn: () => azureService.listAcrRegistries(), retry: false });
  if (q.error?.response?.status === 400) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;
  const registries = q.data?.registries || [];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
              <Container size={20} className="text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Container Registry</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{registries.length} registry(ies)</p>
            </div>
          </div>
          <button onClick={() => q.refetch()} disabled={q.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner text="Carregando registries..." /></div>
        ) : registries.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhum Container Registry encontrado.</p>
        ) : (
          <div className="space-y-2">
            {registries.map((r) => <RegistryPanel key={r.name} registry={r} />)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AzureACR;
