import { useState, useEffect } from 'react';
import { Plus, Trash2, AlertCircle, LogOut } from 'lucide-react';
import Layout from '../components/layout/layout';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';
import { useNavigate } from 'react-router-dom';

/* ── Credential form ─────────────────────────────────────────────── */
const CredentialForm = ({ provider, onSave, onCancel }) => {
  const isAws = provider === 'aws';
  const [label, setLabel] = useState('default');
  const [fields, setFields] = useState(
    isAws
      ? { access_key_id: '', secret_access_key: '', region: 'us-east-1' }
      : { subscription_id: '', tenant_id: '', client_id: '', client_secret: '' }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) =>
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await authService.addCredential(provider, label, fields);
      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao salvar credencial');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary"
        />
      </div>

      {isAws ? (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Access Key ID</label>
            <input type="password" name="access_key_id" value={fields.access_key_id} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Secret Access Key</label>
            <input type="password" name="secret_access_key" value={fields.secret_access_key} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Região</label>
            <select name="region" value={fields.region} onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary">
              <option value="us-east-1">US East (N. Virginia)</option>
              <option value="us-west-2">US West (Oregon)</option>
              <option value="eu-west-1">EU (Ireland)</option>
              <option value="sa-east-1">South America (São Paulo)</option>
              <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
            </select>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subscription ID</label>
            <input type="text" name="subscription_id" value={fields.subscription_id} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tenant ID</label>
            <input type="password" name="tenant_id" value={fields.tenant_id} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
            <input type="password" name="client_id" value={fields.client_id} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
            <input type="password" name="client_secret" value={fields.client_secret} onChange={handleChange} required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary" />
          </div>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-60">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </form>
  );
};

/* ── Credential card ─────────────────────────────────────────────── */
const CredentialCard = ({ provider, title, credentials, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const filtered = credentials.filter((c) => c.provider === provider);

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await authService.deleteCredential(id);
      onRefresh();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nenhuma credencial salva. Usando configurações do sistema (.env).</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((cred) => (
            <li key={cred.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <span className="text-sm font-medium text-gray-800">{cred.label}</span>
                <span className="ml-2 text-xs text-gray-400">
                  adicionada {new Date(cred.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <button
                onClick={() => handleDelete(cred.id)}
                disabled={deleting === cred.id}
                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <CredentialForm
          provider={provider}
          onSave={() => { setShowForm(false); onRefresh(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
};

/* ── Settings page ───────────────────────────────────────────────── */
const Settings = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState([]);
  const [loadingCreds, setLoadingCreds] = useState(true);

  const fetchCredentials = async () => {
    try {
      setLoadingCreds(true);
      const data = await authService.listCredentials();
      setCredentials(data);
    } catch (err) {
      console.error('Failed to load credentials', err);
    } finally {
      setLoadingCreds(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurações</h1>
          <p className="text-gray-600">Gerencie as configurações do Cloud Hub Manager</p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>

      {/* User info */}
      <div className="card mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Perfil</h2>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div>
            <p className="font-medium text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Cloud credentials */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {loadingCreds ? (
          <div className="col-span-2 text-center py-8">
            <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : (
          <>
            <CredentialCard
              provider="aws"
              title="Amazon Web Services"
              credentials={credentials}
              onRefresh={fetchCredentials}
            />
            <CredentialCard
              provider="azure"
              title="Microsoft Azure"
              credentials={credentials}
              onRefresh={fetchCredentials}
            />
          </>
        )}
      </div>

      {/* Security note */}
      <div className="card bg-yellow-50 border border-yellow-200">
        <div className="flex mb-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0" />
          <h2 className="text-xl font-semibold text-yellow-900">Segurança</h2>
        </div>
        <p className="text-sm text-yellow-800">
          <strong>Importante:</strong> Suas credenciais são armazenadas de forma criptografada no banco de dados.
          Nunca compartilhe suas chaves de acesso.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-yellow-800">
          <li>• Use credenciais com permissões limitadas (princípio de menor privilégio)</li>
          <li>• Revise regularmente as permissões de suas contas</li>
          <li>• Use autenticação multi-fator (MFA) nas suas contas cloud</li>
          <li>• Prefira IAM roles e Service Principals com escopo mínimo</li>
        </ul>
      </div>
    </Layout>
  );
};

export default Settings;
