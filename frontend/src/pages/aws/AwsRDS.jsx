import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import CreateRDSForm from '../../components/create/CreateRDSForm';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import CostEstimatePanel from '../../components/common/CostEstimatePanel';
import awsService from '../../services/awsservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';

const defaultForm = { db_instance_identifier: '', engine: 'mysql', engine_version: '', db_instance_class: 'db.t3.micro', allocated_storage: 20, storage_type: 'gp2', db_name: '', master_username: '', master_password: '', security_group_ids: [], db_subnet_group: '', multi_az: false, publicly_accessible: false, backup_retention: 7, storage_encrypted: false, deletion_protection: false, tags: {}, tags_list: [] };

const statusClass = (s) => {
  if (s === 'available') return 'badge-success';
  if (s === 'stopped') return 'badge-danger';
  return 'badge-warning';
};

const AwsRDS = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [detailTarget, setDetailTarget] = useState(null);
  const formRef = useRef();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['aws-rds'],
    queryFn: () => awsService.listRDSInstances(),
    retry: false,
  });

  const { mutate: createInstance, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => awsService.createRDSInstance(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); refetch(); }, 1500); } }
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await awsService.deleteRDSInstance(deleteTarget.db_instance_id);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir instância RDS');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <Layout><LoadingSpinner text="Carregando instâncias RDS..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar RDS'}</span>
        </div>
      </Layout>
    );
  }

  const instances = (data?.instances || []).filter(i =>
    !q || i.db_instance_id?.toLowerCase().includes(q) || i.engine?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">RDS — Banco de Dados</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Região: {data?.region || 'N/A'} · {instances.length} instância(s){q && ` · filtrado por "${q}"`}
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

      <div className="card overflow-x-auto">
        {instances.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhuma instância RDS encontrada</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['ID', 'Engine', 'Versão', 'Classe', 'Status', 'Endpoint', 'AZ', 'Multi-AZ', 'Storage (GB)', 'Ações'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {instances.map(i => (
                <tr key={i.db_instance_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setDetailTarget(i)}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{i.db_instance_id}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{i.engine}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.engine_version || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.db_instance_class}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className={statusClass(i.status)}>{i.status}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono text-xs">{i.endpoint || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.availability_zone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.multi_az ? 'Sim' : 'Não'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{i.storage_gb ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <PermissionGate permission="resources.delete">
                      <button
                        onClick={() => setDeleteTarget(i)}
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
        )}
      </div>

      <CreateResourceModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); reset(); setForm(defaultForm); }}
        onSubmit={() => createInstance(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid ?? true; }}
        title="Criar Instância RDS"
        isLoading={creating}
        error={createError}
        success={createSuccess}
        estimate={<CostEstimatePanel type="rds" form={form} />}
        templateBar={<TemplateBar provider="aws" resourceType="rds" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}
      >
        <CreateRDSForm ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Excluir Instância RDS"
        description="A instância será excluída sem snapshot final. Todos os dados serão perdidos permanentemente."
        confirmText={deleteTarget?.db_instance_id}
        isLoading={isDeleting}
        error={deleteError}
      />
      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.db_instance_id}
        subtitle="RDS Instance"
        statusText={detailTarget?.status}
        statusColor={detailTarget?.status === 'available' ? 'green' : detailTarget?.status === 'stopped' ? 'red' : 'yellow'}
        queryKey={['aws-rds-detail', detailTarget?.db_instance_id]}
        queryFn={detailTarget ? () => awsService.getRDSInstanceDetail(detailTarget.db_instance_id) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'ID', value: detailTarget?.db_instance_id },
            { label: 'Engine', value: detailTarget?.engine },
            { label: 'Versão', value: detailTarget?.engine_version },
            { label: 'Classe', value: detailTarget?.db_instance_class },
            { label: 'Storage (GB)', value: String(detailTarget?.storage_gb ?? '—') },
          ]},
          { title: 'Configuração', fields: [
            { label: 'Parameter Group', value: detail?.parameter_group },
            { label: 'Subnet Group', value: detail?.subnet_group },
            { label: 'Retenção Backup (d)', value: detail?.backup_retention != null ? String(detail.backup_retention) : undefined },
            { label: 'Janela Backup', value: detail?.preferred_backup_window },
            { label: 'Janela Manutenção', value: detail?.preferred_maintenance_window },
          ]},
          { title: 'Rede e Segurança', fields: [
            { label: 'Endpoint', value: detailTarget?.endpoint, mono: true },
            { label: 'VPC Security Groups', value: detail?.vpc_security_groups?.join(', ') },
            { label: 'Multi-AZ', value: detailTarget?.multi_az ? 'Sim' : 'Não' },
            { label: 'Acesso Público', value: detail?.publicly_accessible ? 'Sim' : 'Não' },
            { label: 'Storage Criptografado', value: detail?.storage_encrypted ? 'Sim' : 'Não' },
          ]},
        ]}
        tags={(detail) => detail?.tags}
      />
    </Layout>
  );
};

export default AwsRDS;
