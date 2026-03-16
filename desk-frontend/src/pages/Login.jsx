import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const HUB_URL = 'https://hub.cloudatlas.app.br';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Email ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <LifeBuoy className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">CloudAtlas Desk</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Portal de Suporte</p>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              E-mail
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                         px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Senha
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                         px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold
                       hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Entrar
          </button>
        </form>

        <div className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500">ou</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>
          <a
            href={`${HUB_URL}/login?redirect=desk`}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200
                       hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Entrar com SSO (Google / Microsoft / GitHub)
          </a>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-5">
          Acesse o hub em{' '}
          <a href={HUB_URL} className="text-primary hover:underline">
            hub.cloudatlas.app.br
          </a>
        </p>
      </div>
    </div>
  );
}
