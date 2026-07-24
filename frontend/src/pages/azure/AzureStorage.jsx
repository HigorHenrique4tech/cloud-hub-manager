import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, HardDrive, Plus, Trash2, FolderOpen, Key, Copy, Eye, EyeOff, Check, Package } from 'lucide-react';
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
import { useBackgroundTasks } from '../../contexts/BackgroundTasksContext';
import { useToast } from '../../contexts/ToastContext';

const defaultForm = { name: '', resource_group: '', location: '', sku: 'Standard_LRS', kind: 'StorageV2', access_tier: 'Hot', enable_https_only: true, allow_blob_public_access: false, min_tls_version: 'TLS1_2', tags: {}, tags_list: [] };

// ── Storage Drawer Extra: Containers + Keys ─────────────────────────────────
const StorageDrawerExtra = ({ detailTarget }) => {
  const { toast } = useToast();
  const rg = detailTarget?.resource_group;
  const accountName = detailTarget?.name;
  const [activeTab, setActiveTab] = useState('containers');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAccess, setNewAccess] = useState('None');
  const [creating, setCreating] = useState(false);
  const [deletingContainer, setDeletingContainer] = useState(null);
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [keysVisible, setKeysVisible] = useState({});
  const [copied, setCopied] = useState('');

  const containersQ = useQuery({
    queryKey: ['azure-storage-containers', rg, accountName],
    queryFn: () => azureService.listContainers(rg, accountName),
    enabled: !!rg && !!accountName,
    staleTime: 30_000,
  });

  const keysQ = useQuery({
    queryKey: ['azure-storage-keys', rg, accountName],
    queryFn: () => azureService.getStorageKeys(rg, accountName),
    enabled: !!rg && !!accountName && keysLoaded,
    staleTime: 60_000,
  });

  const containers = containersQ.data?.containers || [];

  const handleCreateContainer = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const result = await azureService.createContainer(rg, accountName, { container_name: newName.trim(), public_access: newAccess });
      if (result.success) {
        toast.success(`Container "${newName}" criado`);
        setShowCreateForm(false);
        setNewName('');
        setNewAccess('None');
        containersQ.refetch();
      } else {
        toast.error(result.error || 'Erro ao criar container');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar container');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteContainer = async (containerName) => {
    setDeletingContainer(containerName);
    try {
      const result = await azureService.deleteContainer(rg, accountName, containerName);
      if (result.success) {
        toast.success(`Container "${containerName}" excluído`);
        containersQ.refetch();
      } else {
        toast.error(result.error || 'Erro ao excluir container');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao excluir container');
    } finally {
      setDeletingContainer(null);
    }
  };

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  const accessLabel = (a) => ({ None: 'Privado', Blob: 'Blob', Container: 'Container' }[a] || 'Privado');

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
        {[
          { key: 'containers', label: 'Containers', Icon: Package },
          { key: 'keys', label: 'Chaves de Acesso', Icon: Key },
        ].map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === key ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Containers Tab */}
      {activeTab === 'containers' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {containersQ.isLoading ? 'Carregando...' : `${containers.length} container(s)`}
            </span>
            <PermissionGate permission="resources.create">
              <button onClick={() => setShowCreateForm(!showCreateForm)}
                className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Novo Container
              </button>
            </PermissionGate>
          </div>

          {showCreateForm && (
            <div className="p-3 mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Novo Container</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">Nome</label>
                  <input value={newName}
                    onChange={e => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="meu-container"
                    className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-sky-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">Acesso Público</label>
                  <select value={newAccess} onChange={e => setNewAccess(e.target.value)}
                    className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <option value="None">Privado</option>
                    <option value="Blob">Blob (leitura pública)</option>
                    <option value="Container">Container (listagem pública)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowCreateForm(false); setNewName(''); }}
                  className="text-xs px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Cancelar</button>
                <button onClick={handleCreateContainer} disabled={creating || !newName.trim()}
                  className="text-xs px-3 py-1.5 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50">
                  {creating ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </div>
          )}

          {containersQ.isLoading ? (
            <div className="text-center py-6 text-xs text-gray-500 dark:text-gray-400">Carregando containers...</div>
          ) : containers.length === 0 ? (
            <div className="text-center py-6">
              <FolderOpen className="w-7 h-7 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Nenhum container encontrado</p>
            </div>
          ) : (
            <div className="space-y-1">
              {containers.map(c => (
                <div key={c.name} className="group flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${!c.public_access || c.public_access === 'None' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                      {accessLabel(c.public_access)}
                    </span>
                  </div>
                  <PermissionGate permission="resources.delete">
                    <button onClick={() => handleDeleteContainer(c.name)} disabled={deletingContainer === c.name}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 disabled:opacity-50 transition-opacity shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </PermissionGate>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Keys Tab */}
      {activeTab === 'keys' && (
        <div className="space-y-3">
          {!keysLoaded ? (
            <div className="text-center py-6">
              <Key className="w-7 h-7 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 max-w-xs mx-auto">
                As chaves fornecem acesso completo à conta. Visualize com cautela.
              </p>
              <PermissionGate permission="resources.manage">
                <button onClick={() => setKeysLoaded(true)}
                  className="text-xs px-4 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700">
                  Mostrar Chaves
                </button>
              </PermissionGate>
            </div>
          ) : keysQ.isLoading ? (
            <div className="text-center py-6 text-xs text-gray-500 dark:text-gray-400">Carregando chaves...</div>
          ) : keysQ.data ? (
            <>
              {/* Connection String */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Connection String</span>
                  <button onClick={() => copyToClipboard(keysQ.data.connection_string, 'conn')}
                    className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400">
                    {copied === 'conn' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    {copied === 'conn' ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                  <code className="text-[10px] text-gray-600 dark:text-gray-400 font-mono break-all leading-relaxed">
                    {keysQ.data.connection_string}
                  </code>
                </div>
              </div>

              {/* Access Keys */}
              {(keysQ.data.keys || []).map(k => (
                <div key={k.key_name} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{k.key_name}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => copyToClipboard(k.value, k.key_name)}
                        className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400">
                        {copied === k.key_name ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                      <button onClick={() => setKeysVisible(prev => ({...prev, [k.key_name]: !prev[k.key_name]}))}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        {keysVisible[k.key_name] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <code className="text-[10px] font-mono text-gray-600 dark:text-gray-400 break-all">
                    {keysVisible[k.key_name] ? k.value : '•'.repeat(64)}
                  </code>
                </div>
              ))}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};

const AzureStorage = () => {
  const { addTask } = useBackgroundTasks();
  const { toast } = useToast();
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
    {
      onSuccess: (result) => {
        if (result?.task_id) {
          addTask({ id: result.task_id, label: result.label, status: 'queued', type: 'azure_storage_create' });
          toast.info('Storage Account em criação em background. Você será notificado quando terminar.');
          setModalOpen(false);
          reset();
          setForm(defaultForm);
        } else {
          setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); fetchData(true); }, 1500);
        }
      }
    }
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const result = await azureService.deleteStorageAccount(deleteTarget.resource_group, deleteTarget.name);
      if (result?.task_id) {
        addTask({ id: result.task_id, label: result.label, status: 'queued', type: 'azure_storage_delete' });
        toast.info(`Exclusão de "${deleteTarget.name}" em andamento em background.`);
        setAccounts(prev => prev.filter(a => a.name !== deleteTarget.name));
      } else {
        fetchData(true);
      }
      setDeleteTarget(null);
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
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid === true; }}
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
        extraContent={detailTarget && <StorageDrawerExtra detailTarget={detailTarget} />}
        tags={(detail) => detail?.tags}
      />
    </Layout>
  );
};

export default AzureStorage;
