import { Plus, ArrowUpRight, TestTube2, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { RoleGate } from '../common/PermissionGate';
import GcpJsonImporter from './GcpJsonImporter';

const AWS_FIELDS   = ['access_key_id', 'secret_access_key', 'region'];
const AZURE_FIELDS = ['subscription_id', 'tenant_id', 'client_id', 'client_secret'];
const GCP_FIELDS   = ['project_id', 'client_email', 'private_key_id', 'private_key'];

const CloudAccountsSection = ({
  accounts, isLoading,
  showForm, setShowForm,
  provider, setProvider,
  label, setLabel,
  formData, setFormData,
  testResult, setTestResult,
  createMutation, deleteMutation, testMutation,
  setAccountToDelete, navigate,
}) => {
  const fields = provider === 'aws' ? AWS_FIELDS : provider === 'gcp' ? GCP_FIELDS : AZURE_FIELDS;

  return (
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
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="aws">AWS</option>
                <option value="azure">Azure</option>
                <option value="gcp">GCP</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Label</label>
              <input
                type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: prod-account"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>
          </div>

          {provider === 'gcp' && (
            <GcpJsonImporter setFormData={setFormData} setLabel={setLabel} />
          )}

          {fields.map((field) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{field}</label>
              {field === 'private_key' ? (
                <textarea
                  rows={4}
                  value={formData[field] || ''}
                  onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs font-mono resize-y"
                />
              ) : (
                <input
                  type={field.includes('secret') || field.includes('key') ? 'password' : 'text'}
                  value={formData[field] || ''}
                  onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
              )}
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
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
              Cancelar
            </button>
          </div>

          {createMutation.isError && (
            createMutation.error?.response?.data?.detail?.includes('Limite') ? (
              <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">{createMutation.error.response.data.detail}</p>
                <button
                  onClick={() => navigate('/select-plan')}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 flex-shrink-0 ml-4"
                >
                  Fazer upgrade <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-sm text-red-500">{createMutation.error?.response?.data?.detail || 'Erro ao criar conta'}</p>
            )
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
                    : acc.provider === 'gcp'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                }`}>
                  {acc.provider}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{acc.label}</p>
                  {acc.account_id && <p className="text-xs text-gray-400">{acc.account_id}</p>}
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
                    onClick={() => setAccountToDelete({ id: acc.id, label: acc.label })}
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
  );
};

export default CloudAccountsSection;
