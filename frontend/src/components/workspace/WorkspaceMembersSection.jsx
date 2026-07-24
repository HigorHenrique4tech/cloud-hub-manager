import { useState } from 'react';
import { Users, Plus, Trash2, RotateCcw, X } from 'lucide-react';
import { RoleGate } from '../common/PermissionGate';

const ROLE_OPTIONS = [
  { value: '', label: 'Herdar da org' },
  { value: 'admin', label: 'Admin' },
  { value: 'operator', label: 'Operador' },
  { value: 'viewer', label: 'Visualizador' },
  { value: 'billing', label: 'Faturamento' },
];

function AddMemberModal({ available = [], onAdd, onClose, isPending }) {
  const [selectedId, setSelectedId] = useState('');
  const [roleOverride, setRoleOverride] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedId) return;
    onAdd({ userId: selectedId, roleOverride: roleOverride || null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Adicionar Membro</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Membro da organização
            </label>
            {available.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                Todos os membros da organização já estão neste workspace.
              </p>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Selecionar membro...</option>
                {available.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} ({m.email}) — {m.org_role}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Role neste workspace (opcional)
            </label>
            <select
              value={roleOverride}
              onChange={(e) => setRoleOverride(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Se não definido, herda o role da organização.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selectedId || isPending || available.length === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const WorkspaceMembersSection = ({
  wsMembers,
  availableMembers = [],
  membersLoading,
  overrideMutation,
  addMemberMutation,
  removeMemberMutation,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <RoleGate allowed={['owner', 'admin']}>
      {showAddModal && (
        <AddMemberModal
          available={availableMembers}
          onAdd={(data) => addMemberMutation.mutate(data, { onSuccess: () => setShowAddModal(false) })}
          onClose={() => setShowAddModal(false)}
          isPending={addMemberMutation.isPending}
        />
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Membros do Workspace
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Apenas membros listados aqui têm acesso a este workspace.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        </div>

        {membersLoading ? (
          <p className="text-sm text-gray-500">Carregando...</p>
        ) : wsMembers.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            Nenhum membro neste workspace. Adicione membros da organização.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  {['Nome', 'Email', 'Role Org', 'Override', ''].map((h) => (
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
                      <div className="flex items-center gap-2">
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
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            Override
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        {m.role_override && (
                          <button
                            onClick={() => overrideMutation.mutate({ userId: m.user_id, roleOverride: null })}
                            className="p-1 rounded text-gray-400 hover:text-primary transition-colors"
                            title="Resetar override"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => removeMemberMutation.mutate(m.user_id)}
                          disabled={removeMemberMutation.isPending}
                          className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Remover do workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
};

export default WorkspaceMembersSection;
