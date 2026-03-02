import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Plus, Monitor } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/layout';
import AzureVMTable from '../../components/resources/azurevmtable';
import ResourceCard from '../../components/resources/resourcecard';
import ErrorMessage from '../../components/common/errormessage';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import SkeletonTable from '../../components/common/SkeletonTable';
import EmptyState from '../../components/common/emptystate';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import BatchActionBar from '../../components/common/BatchActionBar';
import BatchDeleteModal from '../../components/common/BatchDeleteModal';
import CostEstimatePanel from '../../components/common/CostEstimatePanel';
import CreateAzureVMForm from '../../components/create/CreateAzureVMForm';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import azureService from '../../services/azureservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';
import VMBackupSection from '../../components/backup/VMBackupSection';

const defaultForm = { name: '', resource_group: '', location: '', vm_size: 'Standard_B1s', image_publisher: '', image_offer: '', image_sku: '', image_version: 'latest', admin_username: '', admin_password: '', create_public_ip: false, os_disk_type: 'Standard_LRS', data_disks: [], tags: {}, tags_list: [] };

const AzureVMs = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [noCredentials, setNoCredentials] = useState(false);
  const [vms, setVms] = useState([]);
  const [viewType, setViewType] = useState('table');
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

  const fetchVMs = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      setNoCredentials(false);
      const data = await azureService.listVMs();
      setVms(data.virtual_machines || []);
    } catch (err) {
      if (err.response?.status === 400) {
        setNoCredentials(true);
      } else {
        setError(err.response?.data?.detail || err.message || 'Erro ao carregar VMs');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchVMs(); }, []);

  const { mutate: createVM, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => azureService.createVM(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); fetchVMs(true); }, 1500); } }
  );

  const handleStart = async (rg, name) => {
    try {
      setRefreshing(true);
      await azureService.startVM(rg, name);
      await fetchVMs(true);
    } catch (err) {
      setError(`Erro ao iniciar VM: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStop = async (rg, name) => {
    try {
      setRefreshing(true);
      await azureService.stopVM(rg, name);
      await fetchVMs(true);
    } catch (err) {
      setError(`Erro ao parar VM: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await azureService.deleteVM(deleteTarget.resource_group, deleteTarget.name);
      setDeleteTarget(null);
      fetchVMs(true);
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir VM');
    } finally {
      setIsDeleting(false);
    }
  };

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
      catch (e) { errors.push({ id: item.vm_id, name: item.name, error: e.response?.data?.detail || e.message }); }
      setBatchProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setBatchErrors(errors);
    setBatchLoading(false);
    setSelectedIds(new Set());
    fetchVMs(true);
  };

  const filtered = loading ? [] : query
    ? vms.filter(v =>
        v.name?.toLowerCase().includes(query) ||
        v.resource_group?.toLowerCase().includes(query) ||
        v.location?.toLowerCase().includes(query)
      )
    : vms;

  const selectedVMs = filtered.filter(v => selectedIds.has(v.vm_id));
  const canBatchStart = selectedVMs.some(v => ['deallocated', 'stopped'].includes(v.power_state));
  const canBatchStop = selectedVMs.some(v => v.power_state === 'running');

  const handleBatchStart = () => runBatch(
    selectedVMs.filter(v => ['deallocated', 'stopped'].includes(v.power_state)),
    (vm) => azureService.startVM(vm.resource_group, vm.name)
  );
  const handleBatchStop = () => runBatch(
    selectedVMs.filter(v => v.power_state === 'running'),
    (vm) => azureService.stopVM(vm.resource_group, vm.name)
  );
  const handleBatchDelete = async () => {
    await runBatch(
      selectedVMs,
      (vm) => azureService.deleteVM(vm.resource_group, vm.name)
    );
    setBatchDeleteOpen(false);
  };

  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;
  if (error && vms.length === 0 && !loading) return <Layout><ErrorMessage message={error} onRetry={fetchVMs} /></Layout>;

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Azure — Virtual Machines</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {loading ? 'Carregando...' : `${filtered.length} de ${vms.length} VM(s)${query ? ` para "${query}"` : ''}`}
          </p>
        </div>
        <PermissionGate permission="resources.create">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Criar VM
          </button>
        </PermissionGate>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div className="flex space-x-2">
          <button onClick={() => setViewType('table')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${viewType === 'table' ? 'bg-primary text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600'}`}>
            Tabela
          </button>
          <button onClick={() => { setViewType('grid'); setSelectedIds(new Set()); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${viewType === 'grid' ? 'bg-primary text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600'}`}>
            Grade
          </button>
        </div>
        <button onClick={() => fetchVMs(true)} disabled={refreshing}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="card">
        {loading ? (
          <SkeletonTable columns={6} rows={5} hasCheckbox />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Monitor}
            title="Nenhuma VM Azure"
            description="Crie sua primeira Virtual Machine para começar a gerenciar sua infraestrutura Azure."
            action={
              <PermissionGate permission="resources.create">
                <button
                  onClick={() => setModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
                >
                  <Plus className="w-4 h-4" /> Criar VM
                </button>
              </PermissionGate>
            }
          />
        ) : viewType === 'table' ? (
          <AzureVMTable
            vms={filtered}
            onStart={handleStart}
            onStop={handleStop}
            onDelete={(vm) => setDeleteTarget(vm)}
            onRowClick={setDetailTarget}
            loading={refreshing}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(vm => <ResourceCard key={vm.vm_id} resource={vm} type="azure" />)}
          </div>
        )}
      </div>

      <CreateResourceModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); reset(); setForm(defaultForm); }}
        onSubmit={() => createVM(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid ?? true; }}
        title="Criar Virtual Machine"
        isLoading={creating}
        error={createError}
        success={createSuccess}
        estimate={<CostEstimatePanel type="azure-vm" form={form} />}
        templateBar={<TemplateBar provider="azure" resourceType="vm" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}
      >
        <CreateAzureVMForm ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Excluir Virtual Machine"
        description="A VM será excluída permanentemente. Discos associados não são removidos automaticamente."
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
        resources={selectedVMs.map(v => ({ id: v.vm_id, name: v.name }))}
        isLoading={batchLoading}
        errors={batchErrors}
      />
      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name}
        subtitle="Azure Virtual Machine"
        statusText={detailTarget?.power_state}
        statusColor={detailTarget?.power_state === 'running' ? 'green' : ['deallocated', 'stopped'].includes(detailTarget?.power_state) ? 'red' : 'yellow'}
        queryKey={['azure-vm-detail', detailTarget?.resource_group, detailTarget?.name]}
        queryFn={detailTarget ? () => azureService.getVMDetail(detailTarget.resource_group, detailTarget.name) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'Nome', value: detailTarget?.name },
            { label: 'Resource Group', value: detailTarget?.resource_group },
            { label: 'Localização', value: detailTarget?.location },
            { label: 'Tamanho', value: detailTarget?.vm_size },
            { label: 'Sistema Operacional', value: detailTarget?.os_type },
            { label: 'Zonas', value: detail?.zones?.join(', ') || '—' },
          ]},
          { title: 'SO e Imagem', fields: [
            { label: 'Admin Username', value: detail?.admin_username },
            { label: 'Publisher', value: detail?.image?.publisher },
            { label: 'Offer', value: detail?.image?.offer },
            { label: 'SKU', value: detail?.image?.sku },
          ]},
          { title: 'Armazenamento', fields: [
            { label: 'OS Disk', value: detail?.os_disk?.name },
            { label: 'OS Disk Tipo', value: detail?.os_disk?.type },
            { label: 'OS Disk Tamanho', value: detail?.os_disk?.size_gb != null ? `${detail.os_disk.size_gb} GB` : undefined },
            { label: 'Data Disks', value: detail?.data_disks?.length != null ? String(detail.data_disks.length) : undefined },
          ]},
          { title: 'Rede', fields: detail?.network_interfaces?.length > 0
            ? detail.network_interfaces.map((nic, i) => ({
                label: `NIC ${i + 1}`,
                value: [nic.private_ip, nic.public_ip].filter(Boolean).join(' / ') || '—'
              }))
            : [{ label: 'IPs', value: '—' }]
          },
        ]}
        tags={(detail) => detail?.tags}
        extraContent={detailTarget && (
          <VMBackupSection
            provider="azure"
            resourceGroup={detailTarget.resource_group}
            vmName={detailTarget.name}
          />
        )}
      />
    </Layout>
  );
};

export default AzureVMs;
