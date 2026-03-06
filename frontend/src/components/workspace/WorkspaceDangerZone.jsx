import { RoleGate } from '../common/PermissionGate';

const WorkspaceDangerZone = ({ onDelete }) => (
  <RoleGate allowed={['owner', 'admin']}>
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-red-200 dark:border-red-900/50 p-6">
      <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Zona de Perigo</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Excluir este workspace removerá todas as contas cloud e dados associados permanentemente.
      </p>
      <button
        onClick={onDelete}
        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
      >
        Excluir Workspace
      </button>
    </div>
  </RoleGate>
);

export default WorkspaceDangerZone;
