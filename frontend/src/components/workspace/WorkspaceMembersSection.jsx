import { Users, RotateCcw } from 'lucide-react';
import { RoleGate } from '../common/PermissionGate';

const ROLE_OPTIONS = [
  { value: '', label: 'Herdar da org' },
  { value: 'admin', label: 'Admin' },
  { value: 'operator', label: 'Operador' },
  { value: 'viewer', label: 'Visualizador' },
  { value: 'billing', label: 'Faturamento' },
];

const WorkspaceMembersSection = ({ wsMembers, membersLoading, overrideMutation }) => (
  <RoleGate allowed={['owner', 'admin']}>
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        Membros do Workspace
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Sobrescreva o role de um membro apenas neste workspace. Por padrão, o role da organização é herdado.
      </p>

      {membersLoading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : wsMembers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Nenhum membro encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {['Nome', 'Email', 'Role Org', 'Override', 'Ações'].map((h) => (
                  <th key={h} className="text-left py-2 px-2 font-medium text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wsMembers.map((m) => (
                <tr key={m.user_id} className="border-b border-gray-100 dark:border-gray-700/50">
                  <td className="py-2.5 px-2 text-gray-800 dark:text-gray-200 font-medium">{m.name}</td>
                  <td className="py-2.5 px-2 text-gray-500 dark:text-gray-400">{m.email}</td>
                  <td className="py-2.5 px-2">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">
                      {m.org_role}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <select
                      value={m.role_override || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        overrideMutation.mutate({ userId: m.user_id, roleOverride: val });
                      }}
                      className="px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.value === '' ? `Herdar (${m.org_role})` : opt.label}
                        </option>
                      ))}
                    </select>
                    {m.role_override && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        Override
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {m.role_override && (
                      <button
                        onClick={() => overrideMutation.mutate({ userId: m.user_id, roleOverride: null })}
                        className="p-1 rounded text-gray-400 hover:text-primary transition-colors"
                        title="Resetar para role da org"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </RoleGate>
);

export default WorkspaceMembersSection;
