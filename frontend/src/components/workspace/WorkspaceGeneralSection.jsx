import { Plus, ArrowUpRight } from 'lucide-react';
import { RoleGate } from '../common/PermissionGate';

const WorkspaceGeneralSection = ({
  currentWorkspace, wsName, setWsName, wsUpdateMutation,
  newWsName, setNewWsName, createWsMutation, navigate,
}) => (
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
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
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
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          />
          <button
            onClick={() => newWsName && createWsMutation.mutate()}
            disabled={!newWsName || createWsMutation.isPending}
            className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Criar
          </button>
        </div>
        {createWsMutation.isError && (
          createWsMutation.error?.response?.data?.detail?.includes('Limite') ? (
            <div className="flex items-center justify-between p-4 mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">{createWsMutation.error.response.data.detail}</p>
              <button
                onClick={() => navigate('/select-plan')}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 flex-shrink-0 ml-4"
              >
                Fazer upgrade <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-red-500 mt-2">{createWsMutation.error?.response?.data?.detail || 'Erro ao criar workspace'}</p>
          )
        )}
      </div>
    </div>
  </RoleGate>
);

export default WorkspaceGeneralSection;
