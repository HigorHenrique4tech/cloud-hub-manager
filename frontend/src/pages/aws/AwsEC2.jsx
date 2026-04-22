import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../../contexts/ToastContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Plus, Server, Search, X } from 'lucide-react';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import SkeletonTable from '../../components/common/SkeletonTable';
import EmptyState from '../../components/common/emptystate';
import EC2Table from '../../components/resources/ec2table';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import BatchActionBar from '../../components/common/BatchActionBar';
import BatchDeleteModal from '../../components/common/BatchDeleteModal';
import CostEstimatePanel from '../../components/common/CostEstimatePanel';
import CreateEC2Form from '../../components/create/CreateEC2Form';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import awsService from '../../services/awsservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';
import VMBackupSection from '../../components/backup/VMBackupSection';

const defaultForm = { instance_type: 't3.micro', associate_public_ip: false, volumes: [], security_group_ids: [], tags: {}, tags_list: [] };

const AwsEC2 = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();
  const [searchValue, setSearchValue] = useState(q);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [stopTarget, setStopTarget] = useState(null);
  const [pendingOps, setPendingOps] = useState(new Map());
  const formRef = useRef();

  // Batch state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchErrors, setBatchErrors] = useState([]);
  const [detailTarget, setDetailTarget] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['aws-ec2'],
    queryFn: () => awsService.listEC2Instances(),
    retry: false,
    refetchInterval: pendingOps.size > 0 ? 5000 : false,
  });

  const { mutate: createInstance, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => awsService.createEC2Instance(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); refetch(); }, 1500); } }
  );

  const addPending = (id, op) => setPendingOps(m => new Map(m).set(id, op));
  const removePending = (id) => setPendingOps(m => { const n = new Map(m); n.delete(id); return n; });

  const handleStart = async (instanceId, name) => {
    addPending(instanceId, 'starting');
    try {
      await awsService.startEC2Instance(instanceId);
      toast.success(`Instância "${name || instanceId}" iniciada com sucesso.`);
      refetch();
    } catch (err) {
      toast.error(`Erro ao iniciar "${name || instanceId}": ${err.response?.data?.detail || err.message}`);
    } finally {
      removePending(instanceId);
    }
  };

  const handleStop = (instance) => setStopTarget(instance);

  const confirmStop = async () => {
    if (!stopTarget) return;
    const { instance_id: id, name } = stopTarget;
    addPending(id, 'stopping');
    setStopTarget(null);
    try {
      await awsService.stopEC2Instance(id);
      toast.success(`Instância "${name || id}" parada com sucesso.`);
      refetch();
    } catch (err) {
      toast.error(`Erro ao parar "${name || id}": ${err.response?.data?.detail || err.message}`);
    } finally {
      removePending(id);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await awsService.deleteEC2Instance(deleteTarget.instance_id);
      toast.success(`Instância "${deleteTarget.name || deleteTarget.instance_id}" terminada.`);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir instância');
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

  // Batch runner — sequential with error collection
  const runBatch = async (targets, actionFn, idFn, nameFn) => {
    setBatchLoading(true);
    setBatchProgress({ done: 0, total: targets.length });
    const errors = [];
    for (const item of targets) {
      try { await actionFn(item); }
      catch (e) { errors.push({ id: idFn(item), name: nameFn(item), error: e.response?.data?.detail || e.message }); }
      setBatchProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setBatchErrors(errors);
    setBatchLoading(false);
    setSelectedIds(new Set());
    refetch();
  };

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar EC2'}</span>
        </div>
      </Layout>
    );
  }

  const instances = isLoading ? [] : (data?.instances || []).filter(i =>
    !q || i.name?.toLowerCase().includes(q) || i.instance_id?.toLowerCase().includes(q) || i.instance_type?.toLowerCase().includes(q)
  );

  const selectedInstances = instances.filter(i => selectedIds.has(i.instance_id));
  const canBatchStart = selectedInstances.some(i => i.state === 'stopped');
  const canBatchStop = selectedInstances.some(i => i.state === 'running');

  const handleBatchStart = () => runBatch(
    selectedInstances.filter(i => i.state === 'stopped'),
    (i) => awsService.startEC2Instance(i.instance_id),
    (i) => i.instance_id,
    (i) => i.name || i.instance_id
  );
  const handleBatchStop = () => runBatch(
    selectedInstances.filter(i => i.state === 'running'),
    (i) => awsService.stopEC2Instance(i.instance_id),
    (i) => i.instance_id,
    (i) => i.name || i.instance_id
  );
  const handleBatchDelete = async () => {
    await runBatch(
      selectedInstances,
      (i) => awsService.deleteEC2Instance(i.instance_id),
      (i) => i.instance_id,
      (i) => i.name || i.instance_id
    );
    setBatchDeleteOpen(false);
  };

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">EC2 — Instâncias</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isLoading ? 'Carregando...' : `Região: ${data?.region || 'N/A'} · ${instances.length} instância(s)${q ? ` · filtrado por "${q}"` : ''}`}
          </p>
        </div>
        <PermissionGate permission="resources.create">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Criar Instância
          </button>
        </PermissionGate>
      </div>

      {/* Search bar */}
      {!isLoading && instances.length > 0 && (
        <div className="mb-6 relative w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                navigate(searchValue ? `?q=${encodeURIComponent(searchValue)}` : '');
              }
              if (e.key === 'Escape') {
                setSearchValue('');
                navigate('');
              }
            }}
            placeholder="Buscar por nome, ID ou tipo..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {searchValue && (
            <button
              onClick={() => {
                setSearchValue('');
                navigate('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <SkeletonTable columns={8} rows={5} hasCheckbox />
        ) : instances.length === 0 ? (
          <EmptyState
            icon={Server}
            title="Nenhuma instância EC2"
            description="Crie sua primeira instância para começar a gerenciar sua infraestrutura AWS."
            action={
              <PermissionGate permission="resources.create">
                <button
                  onClick={() => setModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
                >
                  <Plus className="w-4 h-4" /> Criar Instância
                </button>
              </PermissionGate>
            }
          />
        ) : (
          <EC2Table
            instances={instances}
            onStart={(id, name) => handleStart(id, name)}
            onStop={(id, instance) => handleStop(instance)}
            onDelete={(instance) => setDeleteTarget(instance)}
            onRowClick={setDetailTarget}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            pendingOps={pendingOps}
          />
        )}
      </div>

      <CreateResourceModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); reset(); setForm(defaultForm); }}
        onSubmit={() => createInstance(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid === true; }}
        title="Criar Instância EC2"
        isLoading={creating}
        error={createError}
        success={createSuccess}
        estimate={<CostEstimatePanel type="ec2" form={form} />}
        templateBar={<TemplateBar provider="aws" resourceType="ec2" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}
      >
        <CreateEC2Form ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal
        isOpen={!!stopTarget}
        onClose={() => setStopTarget(null)}
        onConfirm={confirmStop}
        title="Parar Instância EC2"
        description={`Tem certeza que deseja parar a instância "${stopTarget?.name || stopTarget?.instance_id}"?`}
        confirmLabel="Parar"
        variant="warning"
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Terminar Instância EC2"
        description="A instância será terminada permanentemente. Dados em volumes não persistidos serão perdidos."
        confirmText={deleteTarget?.name || deleteTarget?.instance_id}
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
        resources={selectedInstances.map(i => ({ id: i.instance_id, name: i.name || i.instance_id }))}
        isLoading={batchLoading}
        errors={batchErrors}
      />
      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name || detailTarget?.instance_id}
        subtitle="EC2 Instance"
        statusText={detailTarget?.state}
        statusColor={detailTarget?.state === 'running' ? 'green' : detailTarget?.state === 'stopped' ? 'red' : 'yellow'}
        queryKey={['aws-ec2-detail', detailTarget?.instance_id]}
        queryFn={detailTarget ? () => awsService.getEC2InstanceDetail(detailTarget.instance_id) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'Instance ID', value: detailTarget?.instance_id, mono: true },
            { label: 'Tipo', value: detailTarget?.instance_type },
            { label: 'AMI', value: detail?.ami_id, mono: true },
            { label: 'Arquitetura', value: detail?.architecture },
            { label: 'Virtualização', value: detail?.virtualization_type },
            { label: 'Monitoramento', value: detail?.monitoring_state },
          ]},
          { title: 'Rede', fields: [
            { label: 'IP Público', value: detailTarget?.public_ip || '—' },
            { label: 'VPC', value: detail?.vpc_id, mono: true },
            { label: 'Subnet', value: detail?.subnet_id, mono: true },
            { label: 'Grupos de Segurança', value: detail?.security_groups?.map(sg => sg.name).join(', ') },
          ]},
          { title: 'Armazenamento', fields: [
            { label: 'Root Device', value: detail?.root_device_type },
            { label: 'Root Device Name', value: detail?.root_device_name, mono: true },
            { label: 'Volumes EBS', value: detail?.volumes?.length != null ? String(detail.volumes.length) : undefined },
          ]},
          { title: 'Identidade', fields: [
            { label: 'Key Pair', value: detail?.key_name || '—' },
            { label: 'IAM Profile', value: detail?.iam_instance_profile || '—' },
            { label: 'Zona', value: detailTarget?.availability_zone },
          ]},
        ]}
        tags={(detail) => detail?.tags}
        extraContent={detailTarget && (
          <VMBackupSection
            provider="aws"
            instanceId={detailTarget.instance_id}
          />
        )}
      />
    </Layout>
  );
};

export default AwsEC2;
