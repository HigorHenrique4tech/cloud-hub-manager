import { useState, useEffect, useRef } from 'react';
import { RefreshCw, HardDrive, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import SkeletonTable from '../../components/common/SkeletonTable';
import EmptyState from '../../components/common/emptystate';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import CreateAzureStorageForm from '../../components/create/CreateAzureStorageForm';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import azureService from '../../services/azureservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';

const defaultForm = { name: '', resource_group: '', location: '', sku: 'Standard_LRS', kind: 'StorageV2', access_tier: 'Hot', enable_https_only: true, allow_blob_public_access: false, min_tls_version: 'TLS1_2', tags: {}, tags_list: [] };

const AzureStorage = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noCredentials, setNoCredentials] = useState(false);
  const [accounts, setAccounts] = useState([]);
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
      const data = await azureService.listStorageAccounts();
      setAccounts(data.storage_accounts || []);
    } catch (err) {
      if (err.response?.status === 400) setNoCredentials(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const { mutate: createStorage, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => azureService.createStorageAccount(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); fetchData(true); }, 1500); } }
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await azureService.deleteStorageAccount(deleteTarget.resource_group, deleteTarget.name);
      setDeleteTarget(null);
      fetchData(true);
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir Storage Account');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = loading ? [] : query
    ? accounts.filter(a =>
        a.name?.toLowerCase().includes(query) ||
        a.resource_group?.toLowerCase().includes(query) ||
        a.location?.toLowerCase().includes(query)
      )
    : accounts;

  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">Storage Accounts</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {loading ? 'Carregando...' : `${filtered.length} de ${accounts.length} conta(s)${query ? ` para "${query}"` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate permission="resources.create">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar Storage Account
            </button>
          </PermissionGate>
          <button onClick={() => fetchData(true)} disabled={refreshing}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {loading ? (
          <SkeletonTable columns={6} rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title="Nenhuma Storage Account"
            description="Crie sua primeira conta de armazenamento para guardar dados na Azure."
            action={
              <PermissionGate permission="resources.create">
                <button
                  onClick={() => setModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
                >
                  <Plus className="w-4 h-4" /> Criar Storage Account
                </button>
              </PermissionGate>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {['Nome', 'Grupo de Recursos', 'Localização', 'Replicação', 'Tipo', 'Status', 'Ações'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setDetailTarget(a)}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-sky-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{a.resource_group}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{a.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{a.sku || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{a.kind || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        a.provisioning_state === 'Succeeded'
                          ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-100'
                      }`}>{a.provisioning_state || '—'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <PermissionGate permission="resources.delete">
                        <button
                          onClick={() => setDeleteTarget(a)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateResourceModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); reset(); setForm(defaultForm); }}
        onSubmit={() => createStorage(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid ?? true; }}
        title="Criar Storage Account"
        isLoading={creating}
        error={createError}
        success={createSuccess}
        templateBar={<TemplateBar provider="azure" resourceType="storage" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}
      >
        <CreateAzureStorageForm ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Excluir Storage Account"
        description="A Storage Account e todo o seu conteúdo serão excluídos permanentemente."
        confirmText={deleteTarget?.name}
        isLoading={isDeleting}
        error={deleteError}
      />
      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name}
        subtitle="Storage Account"
        statusText={detailTarget?.provisioning_state}
        statusColor={detailTarget?.provisioning_state === 'Succeeded' ? 'green' : 'yellow'}
        queryKey={['azure-storage-detail', detailTarget?.resource_group, detailTarget?.name]}
        queryFn={detailTarget ? () => azureService.getStorageAccountDetail(detailTarget.resource_group, detailTarget.name) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'Nome', value: detailTarget?.name },
            { label: 'Resource Group', value: detailTarget?.resource_group },
            { label: 'Localização', value: detailTarget?.location },
            { label: 'Replicação', value: detailTarget?.sku || detail?.sku },
            { label: 'Tipo', value: detailTarget?.kind || detail?.kind },
            { label: 'Access Tier', value: detail?.access_tier },
            { label: 'Criado em', value: detail?.creation_time ? new Date(detail.creation_time).toLocaleDateString('pt-BR') : undefined },
          ]},
          { title: 'Segurança', fields: [
            { label: 'HTTPS Only', value: detail?.https_only != null ? (detail.https_only ? 'Sim' : 'Não') : undefined },
            { label: 'TLS Mínimo', value: detail?.min_tls_version },
            { label: 'Blob Público', value: detail?.allow_blob_public_access != null ? (detail.allow_blob_public_access ? 'Permitido' : 'Bloqueado') : undefined },
          ]},
          { title: 'Endpoints', fields: [
            { label: 'Blob', value: detail?.endpoints?.blob, mono: true },
            { label: 'File', value: detail?.endpoints?.file, mono: true },
            { label: 'Queue', value: detail?.endpoints?.queue, mono: true },
            { label: 'Table', value: detail?.endpoints?.table, mono: true },
          ]},
        ]}
        tags={(detail) => detail?.tags}
      />
    </Layout>
  );
};

export default AzureStorage;
