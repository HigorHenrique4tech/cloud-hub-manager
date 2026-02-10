import { useState } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import Layout from '../components/layout/layout';

const Settings = () => {
  const [settings, setSettings] = useState({
    awsRegion: 'us-east-1',
    awsAccessKey: '',
    awsSecretKey: '',
    azureSubscriptionId: '',
    azureClientId: '',
    azureClientSecret: '',
    refreshInterval: 300,
    notificationsEnabled: true,
    darkMode: false
  });

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = () => {
    try {
      // Save to localStorage
      localStorage.setItem('cloudHubSettings', JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('Erro ao salvar configurações');
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurações</h1>
        <p className="text-gray-600">Gerencie as configurações do Cloud Hub Manager</p>
      </div>

      {saved && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 text-sm">✓ Configurações salvas com sucesso!</p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* AWS Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Amazon Web Services</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Região
              </label>
              <select
                name="awsRegion"
                value={settings.awsRegion}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              >
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="eu-west-1">EU (Ireland)</option>
                <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Access Key ID
              </label>
              <input
                type="password"
                name="awsAccessKey"
                value={settings.awsAccessKey}
                onChange={handleChange}
                placeholder="Deixe em branco para usar credenciais do sistema"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Secret Access Key
              </label>
              <input
                type="password"
                name="awsSecretKey"
                value={settings.awsSecretKey}
                onChange={handleChange}
                placeholder="Deixe em branco para usar credenciais do sistema"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Azure Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Microsoft Azure</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subscription ID
              </label>
              <input
                type="text"
                name="azureSubscriptionId"
                value={settings.azureSubscriptionId}
                onChange={handleChange}
                placeholder="Deixe em branco para usar credenciais do sistema"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client ID
              </label>
              <input
                type="password"
                name="azureClientId"
                value={settings.azureClientId}
                onChange={handleChange}
                placeholder="Deixe em branco para usar credenciais do sistema"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Secret
              </label>
              <input
                type="password"
                name="azureClientSecret"
                value={settings.azureClientSecret}
                onChange={handleChange}
                placeholder="Deixe em branco para usar credenciais do sistema"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* General Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Configurações Gerais</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Intervalo de Atualização (segundos)
              </label>
              <input
                type="number"
                name="refreshInterval"
                value={settings.refreshInterval}
                onChange={handleChange}
                min="30"
                max="3600"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              />
              <p className="text-xs text-gray-500 mt-1">Tempo para atualizar dados automaticamente</p>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="notifications"
                name="notificationsEnabled"
                checked={settings.notificationsEnabled}
                onChange={handleChange}
                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
              />
              <label htmlFor="notifications" className="text-sm font-medium text-gray-700 cursor-pointer">
                Ativar Notificações
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="darkMode"
                name="darkMode"
                checked={settings.darkMode}
                onChange={handleChange}
                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
              />
              <label htmlFor="darkMode" className="text-sm font-medium text-gray-700 cursor-pointer">
                Modo Escuro
              </label>
            </div>
          </div>
        </div>

        {/* Security Note */}
        <div className="card bg-yellow-50 border border-yellow-200">
          <div className="flex mb-4">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0" />
            <h2 className="text-xl font-semibold text-yellow-900">Segurança</h2>
          </div>

          <p className="text-sm text-yellow-800">
            <strong>Importante:</strong> Nunca compartilhe suas credenciais de AWS ou Azure. 
            Recomenda-se usar credenciais do sistema operacional ou IAM roles quando possível.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-yellow-800">
            <li>• Use credenciais com permissões limitadas (princípio de menor privilégio)</li>
            <li>• Mantenha as chaves de acesso seguras e priorizadas</li>
            <li>• Revise regularmente as permissões de suas contas</li>
            <li>• Use autenticação multi-fator (MFA) nas suas contas cloud</li>
          </ul>
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSave}
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-primary hover:bg-primary-dark transition-colors"
        >
          <Save className="w-5 h-5 mr-2" />
          Salvar Configurações
        </button>
      </div>
    </Layout>
  );
};

export default Settings;
