import { useState } from 'react';
import { Plus, Trash2, AlertCircle, Check } from 'lucide-react';
import { useAddOns } from '../../hooks/useAddOns';

const AddOnsPanel = ({ orgSlug, currentPlan, currentMembers, currentWorkspaces, maxMembers, maxWorkspaces }) => {
  const { addOns, addWorkspace, addWorkspaceLoading, addUser, addUserLoading, removeAddOn, removeAddOnLoading } = useAddOns(orgSlug);
  const [wsQuantity, setWsQuantity] = useState(1);
  const [userQuantity, setUserQuantity] = useState(1);
  const [message, setMessage] = useState(null);

  const workspaceAddOns = addOns.filter(a => a.addon_type === 'workspace') || [];
  const userAddOns = addOns.filter(a => a.addon_type === 'user') || [];

  const totalAddOnWorkspaces = workspaceAddOns.reduce((sum, a) => sum + a.quantity, 0);
  const totalAddOnUsers = userAddOns.reduce((sum, a) => sum + a.quantity, 0);

  const ADDON_PRICES = {
    workspace: 6000,    // R$ 60 em centavos
    user: 15900,        // R$ 159 em centavos
  };

  const monthlyAddOnCost = (totalAddOnWorkspaces * ADDON_PRICES.workspace + totalAddOnUsers * ADDON_PRICES.user) / 100;

  const handleAddWorkspace = (e) => {
    e.preventDefault();
    if (wsQuantity < 1) return;
    addWorkspace(wsQuantity, {
      onSuccess: () => {
        setMessage({ type: 'success', text: `${wsQuantity} workspace(s) adicionado(s)!` });
        setWsQuantity(1);
        setTimeout(() => setMessage(null), 4000);
      },
      onError: (err) => {
        setMessage({ type: 'error', text: err.response?.data?.detail || 'Erro ao adicionar workspace' });
      },
    });
  };

  const handleAddUser = (e) => {
    e.preventDefault();
    if (userQuantity < 1) return;
    addUser(userQuantity, {
      onSuccess: () => {
        setMessage({ type: 'success', text: `${userQuantity} usuário(s) adicionado(s)!` });
        setUserQuantity(1);
        setTimeout(() => setMessage(null), 4000);
      },
      onError: (err) => {
        setMessage({ type: 'error', text: err.response?.data?.detail || 'Erro ao adicionar usuário' });
      },
    });
  };

  const handleRemoveAddOn = (addOnId) => {
    if (!confirm('Remover este add-on?')) return;
    removeAddOn(addOnId, {
      onSuccess: () => {
        setMessage({ type: 'success', text: 'Add-on removido!' });
        setTimeout(() => setMessage(null), 4000);
      },
      onError: (err) => {
        setMessage({ type: 'error', text: err.response?.data?.detail || 'Erro ao remover' });
      },
    });
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add-ons</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Aumente workspaces e usuários conforme necessário</p>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        }`}>
          {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Resumo de uso */}
      <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Workspaces</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {currentWorkspaces} / {maxWorkspaces + totalAddOnWorkspaces}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">+{totalAddOnWorkspaces} add-on(s)</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Usuários</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {currentMembers} / {maxMembers + totalAddOnUsers}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">+{totalAddOnUsers} add-on(s)</p>
        </div>
      </div>

      {/* Custo mensal de add-ons */}
      {monthlyAddOnCost > 0 && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 mb-6">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-semibold">Custo mensal de add-ons: R$ {monthlyAddOnCost.toFixed(2)}</span>
            <br />
            <span className="text-xs">Workspaces: R$ 60/mês • Usuários: R$ 159/mês</span>
          </p>
        </div>
      )}

      {/* Adicionar Workspaces */}
      <form onSubmit={handleAddWorkspace} className="mb-6 p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Adicionar Workspaces (R$ 60/mês)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            max="100"
            value={wsQuantity}
            onChange={(e) => setWsQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="input flex-1 text-gray-900 dark:text-gray-100"
            placeholder="Quantidade"
          />
          <button
            type="submit"
            disabled={addWorkspaceLoading}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {addWorkspaceLoading ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </form>

      {/* Adicionar Usuários */}
      <form onSubmit={handleAddUser} className="mb-6 p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Adicionar Usuários (R$ 159/mês)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            max="100"
            value={userQuantity}
            onChange={(e) => setUserQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="input flex-1 text-gray-900 dark:text-gray-100"
            placeholder="Quantidade"
          />
          <button
            type="submit"
            disabled={addUserLoading}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {addUserLoading ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </form>

      {/* Lista de add-ons ativos */}
      {addOns.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Add-ons ativos</h3>
          <div className="space-y-2">
            {addOns.map((addon) => (
              <div key={addon.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {addon.quantity} {addon.addon_type === 'workspace' ? 'Workspace(s)' : 'Usuário(s)'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    R$ {(addon.monthly_price_cents / 100).toFixed(2)}/mês
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveAddOn(addon.id)}
                  disabled={removeAddOnLoading}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Remover add-on"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AddOnsPanel;
