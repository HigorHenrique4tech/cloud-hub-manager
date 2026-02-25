import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Globe, Play, Square, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import SkeletonTable from '../../components/common/SkeletonTable';
import EmptyState from '../../components/common/emptystate';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import BatchActionBar from '../../components/common/BatchActionBar';
import BatchDeleteModal from '../../components/common/BatchDeleteModal';
import CostEstimatePanel from '../../components/common/CostEstimatePanel';
import CreateAzureAppServiceForm from '../../components/create/CreateAzureAppServiceForm';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import azureService from '../../services/azureservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';

const defaultForm = { name: '', resource_group: '', location: '', runtime: 'PYTHON|3.11', plan_name: '', plan_sku: 'B1', always_on: false, tags: {}, tags_list: [] };

const AzureAppServices = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noCredentials, setNoCredentials] = useState(false);
  const [error, setError] = useState(null);
  const [apps, setApps] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const formRef = useRef();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').toLowerCase();

  // Batch state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchErrors, setBatchErrors] = useState([]);
  const [detailTarget, setDetailTarget] = useState(null);

  const fetchData = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setNoCredentials(false);
      setError(null);
      const data = await azureService.listAppServices();
      setApps(data.app_services || []);
    } catch (err) {
      if (err.response?.status === 400) setNoCredentials(true);
      else setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleStart = async (rg, name) => {
    try {
      setRefreshing(true);
      await azureService.startAppService(rg, name);
      await fetchData(true);
    } catch (err) {
      setError(`Erro ao iniciar App Service: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStop = async (rg, name) => {
    try {
      setRefreshing(true);
      await azureService.stopAppService(rg, name);
      await fetchData(true);
    } catch (err) {
      setError(`Erro ao parar App Service: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await azureService.deleteAppService(deleteTarget.resource_group, deleteTarget.name);
      setDeleteTarget(null);
      fetchData(true);
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir App Service');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const { mutate: createApp, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => azureService.createAppService(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); fetchData(true); }, 1500); } }
  );

  // Selection helpers
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = (ids) => setSelectedIds(prev =>
    ids.every(id => prev.has(id)) ? new Set() : new Set(ids)
  );

  // Batch runner
  const runBatch = async (targets, actionFn) => {
    setBatchLoading(true);
    setBatchProgress({ done: 0, total: targets.length });
    const errors = [];
    for (const item of targets) {
      try { await actionFn(item); }
      catch (e) { errors.push({ id: item.id, name: item.name, error: e.response?.data?.detail || e.message }); }
      setBatchProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setBatchErrors(errors);
    setBatchLoading(false);
    setSelectedIds(new Set());
    fetchData(true);
  };

  const filtered = loading ? [] : query
    ? apps.filter(a =>
        a.name?.toLowerCase().includes(query) ||
        a.resource_group?.toLowerCase().includes(query) ||
        a.location?.toLowerCase().includes(query)
      )
    : apps;

  const allFilteredIds = filtered.map(a => a.id);
  const hasAll = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
  const hasSome = allFilteredIds.some(id => selectedIds.has(id));

  const selectedApps = filtered.filter(a => selectedIds.has(a.id));
  const canBatchStart = selectedApps.some(a => a.state !== 'Running');
  const canBatchStop = selectedApps.some(a => a.state === 'Running');

  const handleBatchStart = () => runBatch(
    selectedApps.filter(a => a.state !== 'Running'),
    (app) => azureService.startAppService(app.resource_group, app.name)
  );
  const handleBatchStop = () => runBatch(
    selectedApps.filter(a => a.state === 'Running'),
    (app) => azureService.stopAppService(app.resource_group, app.name)
  );
  const handleBatchDelete = async () => {
    await runBatch(
      selectedApps,
      (app) => azureService.deleteAppService(app.resource_group, app.name)
    );
    setBatchDeleteOpen(false);
  };

  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">App Services</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {loading ? 'Carregando...' : `${filtered.length} de ${apps.length} app(s)${query ? ` para "${query}"` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate permission="resources.create">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar App Service
            </button>
          </PermissionGate>
          <button onClick={() => fetchData(true)} disabled={refreshing}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <SkeletonTable columns={7} rows={5} hasCheckbox />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="Nenhum App Service"
            description="Crie seu primeiro App Service para hospedar aplicações web na Azure."
            action={
              <PermissionGate permission="resources.create">
                <button
                  onClick={() => setModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
                >
                  <Plus className="w-4 h-4" /> Criar App Service
                </button>
              </PermissionGate>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      ref={el => el && (el.indeterminate = hasSome && !hasAll)}
                      checked={hasAll}
                      onChange={() => toggleAll(allFilteredIds)}
                      className="w-4 h-4 accent-primary"
                    />
                  </th>
                  {['Nome', 'Grupo de Recursos', 'Localização', 'Runtime', 'Plano', 'Status', 'Ações'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(app => (
                  <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setDetailTarget(app)}>
                    <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(app.id)}
                        onChange={() => toggleSelect(app.id)}
                        className="w-4 h-4 accent-primary"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-sky-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{app.name}</p>
                          {app.host_names?.[0] && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[180px]">{app.host_names[0]}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{app.resource_group}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{app.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{app.runtime || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{app.app_service_plan || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        app.state === 'Running'
                          ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
                          : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-100'
                      }`}>{app.state || '—'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <PermissionGate permission="resources.start_stop">
                          {app.state !== 'Running' && (
                            <button onClick={() => handleStart(app.resource_group, app.name)} disabled={refreshing}
                              className="text-success hover:text-success-dark disabled:opacity-50" title="Iniciar">
                              <Play className="w-5 h-5" />
                            </button>
                          )}
                          {app.state === 'Running' && (
                            <button onClick={() => handleStop(app.resource_group, app.name)} disabled={refreshing}
                              className="text-danger hover:text-danger-dark disabled:opacity-50" title="Parar">
                              <Square className="w-5 h-5" />
                            </button>
                          )}
                        </PermissionGate>
                        <PermissionGate permission="resources.delete">
                          <button
                            onClick={() => setDeleteTarget(app)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </PermissionGate>
                      </div>
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
        onSubmit={() => createApp(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid ?? true; }}
        title="Criar App Service"
        isLoading={creating}
        error={createError}
        success={createSuccess}
        estimate={<CostEstimatePanel type="azure-app-service" form={form} />}
        templateBar={<TemplateBar provider="azure" resourceType="app_service" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}
      >
        <CreateAzureAppServiceForm ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Excluir App Service"
        description="O App Service e seu conteúdo serão excluídos. O Plano de hospedagem não é removido automaticamente."
        confirmText={deleteTarget?.name}
        isLoading={isDeleting}
        error={deleteError}
      />

      <BatchActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onStart={handleBatchStart}
        onStop={handleBatchStop}
        onDelete={() => setBatchDeleteOpen(true)}
        canStart={canBatchStart}
        canStop={canBatchStop}
        isLoading={batchLoading}
        progress={batchProgress}
      />

      <BatchDeleteModal
        isOpen={batchDeleteOpen}
        onClose={() => { setBatchDeleteOpen(false); setBatchErrors([]); }}
        onConfirm={handleBatchDelete}
        resources={selectedApps.map(a => ({ id: a.id, name: a.name }))}
        isLoading={batchLoading}
        errors={batchErrors}
      />
      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name}
        subtitle="App Service"
        statusText={detailTarget?.state}
        statusColor={detailTarget?.state === 'Running' ? 'green' : 'red'}
        queryKey={['azure-app-detail', detailTarget?.resource_group, detailTarget?.name]}
        queryFn={detailTarget ? () => azureService.getAppServiceDetail(detailTarget.resource_group, detailTarget.name) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'Nome', value: detailTarget?.name },
            { label: 'Resource Group', value: detailTarget?.resource_group },
            { label: 'Localização', value: detailTarget?.location },
            { label: 'Runtime', value: detailTarget?.runtime || detail?.runtime },
            { label: 'Plano', value: detailTarget?.app_service_plan },
            { label: 'Estado', value: detailTarget?.state },
          ]},
          { title: 'URLs', fields: [
            { label: 'Host Padrão', value: detail?.default_host_name, mono: true },
            { label: 'IPs de Saída', value: detail?.outbound_ip_addresses },
            { label: 'Domínios Customizados', value: detail?.custom_domains?.join(', ') || '—' },
          ]},
          { title: 'Configuração', fields: [
            { label: 'Always On', value: detail?.always_on != null ? (detail.always_on ? 'Ativado' : 'Desativado') : undefined },
            { label: 'HTTPS Only', value: detail?.https_only != null ? (detail.https_only ? 'Sim' : 'Não') : undefined },
            { label: 'TLS Mínimo', value: detail?.min_tls_version },
            { label: 'FTPS State', value: detail?.ftps_state },
            { label: 'HTTP/2', value: detail?.http20_enabled != null ? (detail.http20_enabled ? 'Ativado' : 'Desativado') : undefined },
          ]},
        ]}
        tags={(detail) => detail?.tags}
      />
    </Layout>
  );
};

export default AzureAppServices;
