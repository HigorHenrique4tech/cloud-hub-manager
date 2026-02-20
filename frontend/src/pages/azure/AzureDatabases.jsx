import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Database, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import CreateAzureSQLForm from '../../components/create/CreateAzureSQLForm';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import CostEstimatePanel from '../../components/common/CostEstimatePanel';
import azureService from '../../services/azureservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';

const defaultForm = { server_name: '', resource_group: '', location: '', admin_login: '', admin_password: '', database_name: '', sku_name: 'GP_Gen5_2', max_size_bytes: 2147483648, collation: 'SQL_Latin1_General_CP1_CI_AS', tags: {}, tags_list: [] };

const ServerRow = ({ server, onDelete, onRowClick }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center w-full px-5 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
        <button
          onClick={() => setOpen(p => !p)}
          className="flex-1 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-sky-500 flex-shrink-0" />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary cursor-pointer" onClick={(e) => { e.stopPropagation(); onRowClick?.(server); }}>{server.name}</span>
              <span className="ml-3 text-xs text-gray-400 dark:text-gray-500 font-mono">{server.fully_qualified_domain_name}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{server.location}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{server.databases?.length || 0} DB(s)</span>
            {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </div>
        </button>
        <PermissionGate permission="resources.delete">
          <button
            onClick={() => onDelete(server)}
            className="ml-3 text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
            title="Excluir servidor"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </PermissionGate>
      </div>
      {open && server.databases?.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-5 py-3">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  {['Banco de Dados', 'Status', 'SKU'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-2 pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {server.databases.map(db => (
                  <tr key={db.name} className="hover:bg-white dark:hover:bg-gray-800/50">
                    <td className="py-2 pr-6 text-sm font-medium text-gray-900 dark:text-gray-100">{db.name}</td>
                    <td className="py-2 pr-6">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        db.status === 'Online'
                          ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>{db.status || '—'}</span>
                    </td>
                    <td className="py-2 text-sm text-gray-500 dark:text-gray-400">{db.sku || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const AzureDatabases = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noCredentials, setNoCredentials] = useState(false);
  const [servers, setServers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [detailTarget, setDetailTarget] = useState(null);
  const formRef = useRef();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').toLowerCase();

  const fetchData = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setNoCredentials(false);
      const data = await azureService.listDatabases();
      setServers(data.servers || []);
    } catch (err) {
      if (err.response?.status === 400) setNoCredentials(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const { mutate: createDB, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => azureService.createSQLDatabase(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); fetchData(true); }, 1500); } }
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await azureService.deleteSQLServer(deleteTarget.resource_group, deleteTarget.name);
      setDeleteTarget(null);
      fetchData(true);
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir servidor SQL');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = query
    ? servers.filter(s =>
        s.name?.toLowerCase().includes(query) ||
        s.resource_group?.toLowerCase().includes(query) ||
        s.location?.toLowerCase().includes(query)
      )
    : servers;

  if (loading) return <Layout><LoadingSpinner text="Carregando Bancos de Dados..." /></Layout>;
  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">Bancos de Dados</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {filtered.length} servidor(es){query && ` para "${query}"`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate permission="resources.create">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar Banco de Dados
            </button>
          </PermissionGate>
          <button onClick={() => fetchData(true)} disabled={refreshing}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Database className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Nenhum servidor de banco de dados encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => <ServerRow key={s.id} server={s} onDelete={setDeleteTarget} onRowClick={setDetailTarget} />)}
        </div>
      )}

      <CreateResourceModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); reset(); setForm(defaultForm); }}
        onSubmit={() => createDB(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid ?? true; }}
        title="Criar Banco de Dados Azure SQL"
        isLoading={creating}
        error={createError}
        success={createSuccess}
        estimate={<CostEstimatePanel type="azure-sql" form={form} />}
        templateBar={<TemplateBar provider="azure" resourceType="sql" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}
      >
        <CreateAzureSQLForm ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Excluir Servidor Azure SQL"
        description="O servidor Azure SQL e todos os databases nele serão excluídos permanentemente."
        confirmText={deleteTarget?.name}
        isLoading={isDeleting}
        error={deleteError}
      />
      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name}
        subtitle="Azure SQL Server"
        queryKey={['azure-sql-detail', detailTarget?.resource_group, detailTarget?.name]}
        queryFn={detailTarget ? () => azureService.getSQLServerDetail(detailTarget.resource_group, detailTarget.name) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'Nome', value: detailTarget?.name },
            { label: 'Resource Group', value: detailTarget?.resource_group },
            { label: 'Localização', value: detailTarget?.location },
            { label: 'FQDN', value: detail?.fqdn || detailTarget?.fully_qualified_domain_name, mono: true },
            { label: 'Estado', value: detail?.state },
            { label: 'Admin Login', value: detail?.admin_login },
          ]},
          { title: 'Segurança', fields: [
            { label: 'Versão', value: detail?.version },
            { label: 'TLS Mínimo', value: detail?.minimal_tls_version },
            { label: 'Rede Pública', value: detail?.public_network_access },
          ]},
          { title: 'Regras de Firewall', fields: detail?.firewall_rules?.length > 0
            ? detail.firewall_rules.map(r => ({ label: r.name, value: `${r.start_ip} – ${r.end_ip}`, mono: true }))
            : [{ label: '—', value: 'Nenhuma regra configurada' }]
          },
        ]}
        tags={(detail) => detail?.tags}
      />
    </Layout>
  );
};

export default AzureDatabases;
