import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import CreateLambdaForm from '../../components/create/CreateLambdaForm';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import awsService from '../../services/awsservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';

const defaultForm = { function_name: '', runtime: 'python3.11', handler: 'handler.lambda_handler', role_arn: '', code_source: 'zip', description: '', memory_size: 128, timeout: 30, environment_variables: [], tags: {}, tags_list: [] };

const AwsLambda = () => {
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
    queryKey: ['aws-lambda'],
    queryFn: () => awsService.listLambdaFunctions(),
    retry: false,
  });

  const { mutate: createFunction, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => awsService.createLambdaFunction(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); refetch(); }, 1500); } }
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await awsService.deleteLambdaFunction(deleteTarget.name);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir função Lambda');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <Layout><LoadingSpinner text="Carregando funções Lambda..." /></Layout>;

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar Lambda'}</span>
        </div>
      </Layout>
    );
  }

  const fns = (data?.functions || []).filter(f =>
    !q || f.name?.toLowerCase().includes(q) || f.runtime?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Lambda — Funções</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Região: {data?.region || 'N/A'} · {fns.length} função(ões){q && ` · filtrado por "${q}"`}
          </p>
        </div>
        <PermissionGate permission="resources.create">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Criar Função
          </button>
        </PermissionGate>
      </div>

      <div className="card overflow-x-auto">
        {fns.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhuma função Lambda encontrada</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['Nome', 'Runtime', 'Handler', 'Memória (MB)', 'Timeout (s)', 'Código (KB)', 'Última modificação', 'Ações'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {fns.map(f => (
                <tr key={f.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setDetailTarget(f)}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{f.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="badge-gray text-xs">{f.runtime || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono text-xs whitespace-nowrap">{f.handler || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{f.memory_mb ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{f.timeout_sec ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {f.code_size_bytes ? Math.round(f.code_size_bytes / 1024) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {f.last_modified ? new Date(f.last_modified).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <PermissionGate permission="resources.delete">
                      <button
                        onClick={() => setDeleteTarget(f)}
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
        onSubmit={() => createFunction(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid ?? true; }}
        title="Criar Função Lambda"
        isLoading={creating}
        error={createError}
        success={createSuccess}
        templateBar={<TemplateBar provider="aws" resourceType="lambda" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}
      >
        <CreateLambdaForm ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Excluir Função Lambda"
        description="A função e todo o seu histórico serão excluídos permanentemente."
        confirmText={deleteTarget?.name}
        isLoading={isDeleting}
        error={deleteError}
      />
      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name}
        subtitle="Lambda Function"
        queryKey={['aws-lambda-detail', detailTarget?.name]}
        queryFn={detailTarget ? () => awsService.getLambdaFunctionDetail(detailTarget.name) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'Nome', value: detailTarget?.name },
            { label: 'Runtime', value: detailTarget?.runtime },
            { label: 'Handler', value: detailTarget?.handler, mono: true },
            { label: 'Memória (MB)', value: String(detailTarget?.memory_mb ?? '—') },
            { label: 'Timeout (s)', value: String(detailTarget?.timeout_sec ?? '—') },
            { label: 'Código (KB)', value: detailTarget?.code_size_bytes ? String(Math.round(detailTarget.code_size_bytes / 1024)) : undefined },
          ]},
          { title: 'Configuração', fields: [
            { label: 'Descrição', value: detail?.description || '—' },
            { label: 'Role ARN', value: detail?.role_arn, mono: true },
            { label: 'Tracing', value: detail?.tracing_mode },
            { label: 'Package Type', value: detail?.package_type },
            { label: 'Architectures', value: detail?.architectures?.join(', ') },
            { label: 'Estado', value: detail?.state },
          ]},
          { title: 'Variáveis de Ambiente', fields: detail?.env_var_keys?.length > 0
            ? detail.env_var_keys.map(k => ({ label: k, value: '(oculto)' }))
            : [{ label: '—', value: 'Nenhuma variável configurada' }]
          },
          { title: 'Rede', fields: [
            { label: 'VPC', value: detail?.vpc_id, mono: true },
            { label: 'Subnets', value: detail?.vpc_subnets_count != null ? String(detail.vpc_subnets_count) : undefined },
            { label: 'Security Groups', value: detail?.vpc_sgs_count != null ? String(detail.vpc_sgs_count) : undefined },
          ]},
        ]}
      />
    </Layout>
  );
};

export default AwsLambda;
