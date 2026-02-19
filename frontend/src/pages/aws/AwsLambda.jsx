import { useState } from 'react';
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

const defaultForm = { function_name: '', runtime: 'python3.11', handler: 'handler.lambda_handler', role_arn: '', code_source: 'zip', description: '', memory_size: 128, timeout: 30, environment_variables: [], tags: {}, tags_list: [] };

const AwsLambda = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
                <tr key={f.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
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
                  <td className="px-4 py-3 whitespace-nowrap">
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
        title="Criar Função Lambda"
        isLoading={creating}
        error={createError}
        success={createSuccess}
      >
        <CreateLambdaForm form={form} setForm={setForm} />
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
    </Layout>
  );
};

export default AwsLambda;
