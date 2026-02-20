import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import CreateVPCForm from '../../components/create/CreateVPCForm';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import awsService from '../../services/awsservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';

const defaultForm = { name: '', cidr_block: '10.0.0.0/16', enable_dns_support: true, enable_dns_hostnames: true, tenancy: 'default', subnets: [], tags: {}, tags_list: [] };

const AwsVPC = () => {
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
    queryKey: ['aws-vpc'],
    queryFn: () => awsService.listVPCs(),
    retry: false,
  });

  const { mutate: createVPC, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => awsService.createVPC(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); refetch(); }, 1500); } }
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await awsService.deleteVPC(deleteTarget.vpc_id);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir VPC');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <Layout><LoadingSpinner text="Carregando VPCs..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar VPCs'}</span>
        </div>
      </Layout>
    );
  }

  const vpcs = (data?.vpcs || []).filter(v =>
    !q || v.vpc_id?.toLowerCase().includes(q) || v.name?.toLowerCase().includes(q) || v.cidr?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">VPC — Redes Virtuais</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Região: {data?.region || 'N/A'} · {vpcs.length} VPC(s){q && ` · filtrado por "${q}"`}
          </p>
        </div>
        <PermissionGate permission="resources.create">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Criar VPC
          </button>
        </PermissionGate>
      </div>

      <div className="card overflow-x-auto">
        {vpcs.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhuma VPC encontrada</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['VPC ID', 'Nome', 'CIDR', 'Estado', 'Padrão', 'Subnets', 'Ações'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {vpcs.map(v => (
                <tr key={v.vpc_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setDetailTarget(v)}>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{v.vpc_id}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.name || '—'}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.cidr || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={v.state === 'available' ? 'badge-success' : 'badge-warning'}>{v.state || '—'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {v.is_default ? <span className="badge-gray">Padrão</span> : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.subnets_count ?? 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <PermissionGate permission="resources.delete">
                      <button
                        onClick={() => setDeleteTarget(v)}
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
        onSubmit={() => createVPC(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid ?? true; }}
        title="Criar VPC"
        isLoading={creating}
        error={createError}
        success={createSuccess}
        templateBar={<TemplateBar provider="aws" resourceType="vpc" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}
      >
        <CreateVPCForm ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Excluir VPC"
        description="A VPC deve estar vazia (sem subnets, IGW ou ENIs) para ser excluída. Esta ação é permanente."
        confirmText={deleteTarget?.name || deleteTarget?.vpc_id}
        isLoading={isDeleting}
        error={deleteError}
      />
      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name || detailTarget?.vpc_id}
        subtitle="VPC"
        statusText={detailTarget?.state}
        statusColor={detailTarget?.state === 'available' ? 'green' : 'yellow'}
        queryKey={['aws-vpc-detail', detailTarget?.vpc_id]}
        queryFn={detailTarget ? () => awsService.getVPCDetail(detailTarget.vpc_id) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'VPC ID', value: detailTarget?.vpc_id, mono: true },
            { label: 'CIDR', value: detailTarget?.cidr, mono: true },
            { label: 'Estado', value: detailTarget?.state },
            { label: 'Padrão', value: detailTarget?.is_default ? 'Sim' : 'Não' },
            { label: 'Tenancy', value: detail?.tenancy },
          ]},
          { title: 'DNS', fields: [
            { label: 'DNS Support', value: detail?.enable_dns_support != null ? (detail.enable_dns_support ? 'Ativado' : 'Desativado') : undefined },
            { label: 'DNS Hostnames', value: detail?.enable_dns_hostnames != null ? (detail.enable_dns_hostnames ? 'Ativado' : 'Desativado') : undefined },
          ]},
          { title: 'Rede', fields: [
            { label: 'Internet Gateway', value: detail?.igw_id || '—', mono: true },
            { label: 'Subnets', value: detail?.subnets?.length != null ? String(detail.subnets.length) : String(detailTarget?.subnets_count ?? '—') },
          ]},
        ]}
        tags={(detail) => detail?.tags}
      />
    </Layout>
  );
};

export default AwsVPC;
