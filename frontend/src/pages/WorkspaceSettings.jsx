import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Trash2, TestTube2, CheckCircle2, XCircle } from 'lucide-react';
import Header from '../components/layout/header';
import Sidebar from '../components/layout/sidebar';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import { RoleGate } from '../components/common/PermissionGate';
import orgService from '../services/orgService';

const WorkspaceSettings = () => {
  const { currentOrg, currentWorkspace, refreshWorkspaces } = useOrgWorkspace();
  const qc = useQueryClient();
  const slug = currentOrg?.slug;
  const wsId = currentWorkspace?.id;

  // Cloud Accounts
  const { data: accountsData, isLoading } = useQuery({
    queryKey: ['cloud-accounts', slug, wsId],
    queryFn: () => orgService.listAccounts(slug, wsId),
    enabled: !!slug && !!wsId,
  });
  const accounts = accountsData?.accounts || [];

  // Add account form
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState('aws');
  const [label, setLabel] = useState('');
  const [formData, setFormData] = useState({});
  const [testResult, setTestResult] = useState(null);

  const createMutation = useMutation({
    mutationFn: () => orgService.createAccount(slug, wsId, {
      provider,
      label: label || 'default',
      data: formData,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-accounts', slug, wsId] });
      setShowForm(false);
      setLabel('');
      setFormData({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId) => orgService.deleteAccount(slug, wsId, accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cloud-accounts', slug, wsId] }),
  });

  const testMutation = useMutation({
    mutationFn: (accountId) => orgService.testAccount(slug, wsId, accountId),
  });

  // Workspace name update
  const [wsName, setWsName] = useState('');
  const wsUpdateMutation = useMutation({
    mutationFn: (name) => orgService.updateWorkspace(slug, wsId, { name }),
    onSuccess: () => refreshWorkspaces(),
  });

  // New workspace
  const [newWsName, setNewWsName] = useState('');
  const createWsMutation = useMutation({
    mutationFn: () => orgService.createWorkspace(slug, { name: newWsName }),
    onSuccess: () => {
      refreshWorkspaces();
      setNewWsName('');
    },
  });

  if (!currentOrg || !currentWorkspace) return null;

  const awsFields = ['access_key_id', 'secret_access_key', 'region'];
  const azureFields = ['subscription_id', 'tenant_id', 'client_id', 'client_secret'];
  const fields = provider === 'aws' ? awsFields : azureFields;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 space-y-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Configurações do Workspace
          </h1>

          {/* Workspace Info */}
          <RoleGate allowed={['owner', 'admin']}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Workspace Atual</h2>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                  <input
                    type="text"
                    defaultValue={currentWorkspace.name}
                    onChange={(e) => setWsName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                </div>
                <button
                  onClick={() => wsName && wsUpdateMutation.mutate(wsName)}
                  disabled={wsUpdateMutation.isPending}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>

              {/* Create new workspace */}
              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Criar Novo Workspace</h3>
                <div className="flex items-end gap-3">
                  <input
                    type="text"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="Ex: Production, Staging, Dev"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                  <button
                    onClick={() => newWsName && createWsMutation.mutate()}
                    disabled={!newWsName || createWsMutation.isPending}
                    className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> Criar
                  </button>
                </div>
              </div>
            </div>
          </RoleGate>

          {/* Cloud Accounts */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Contas Cloud ({accounts.length})
              </h2>
              <RoleGate allowed={['owner', 'admin']}>
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4" /> Adicionar
                </button>
              </RoleGate>
            </div>

            {/* Add Account Form */}
            {showForm && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg space-y-3">
                <div className="flex gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Provider</label>
                    <select
                      value={provider}
                      onChange={(e) => { setProvider(e.target.value); setFormData({}); }}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="aws">AWS</option>
                      <option value="azure">Azure</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Label</label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Ex: prod-account"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                </div>
                {fields.map((field) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{field}</label>
                    <input
                      type={field.includes('secret') || field.includes('key') ? 'password' : 'text'}
                      value={formData[field] || ''}
                      onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    Salvar Conta
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
                {createMutation.isError && (
                  <p className="text-sm text-red-500">{createMutation.error?.response?.data?.detail || 'Erro ao criar conta'}</p>
                )}
              </div>
            )}

            {/* Accounts List */}
            {isLoading ? (
              <p className="text-sm text-gray-500">Carregando...</p>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                Nenhuma conta cloud configurada neste workspace.
              </p>
            ) : (
              <div className="space-y-3">
                {accounts.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                        acc.provider === 'aws'
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {acc.provider}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{acc.label}</p>
                        {acc.account_id && (
                          <p className="text-xs text-gray-400">{acc.account_id}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            const r = await testMutation.mutateAsync(acc.id);
                            setTestResult({ id: acc.id, success: r.success });
                          } catch {
                            setTestResult({ id: acc.id, success: false });
                          }
                        }}
                        className="p-1.5 rounded text-gray-400 hover:text-primary transition-colors"
                        title="Testar conexão"
                      >
                        {testResult?.id === acc.id ? (
                          testResult.success
                            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                            : <XCircle className="w-4 h-4 text-red-500" />
                        ) : (
                          <TestTube2 className="w-4 h-4" />
                        )}
                      </button>
                      <RoleGate allowed={['owner', 'admin']}>
                        <button
                          onClick={() => deleteMutation.mutate(acc.id)}
                          className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="Remover conta"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </RoleGate>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default WorkspaceSettings;
