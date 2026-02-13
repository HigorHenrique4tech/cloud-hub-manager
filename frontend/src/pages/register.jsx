import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { User, Mail, Lock, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const inputClass =
  'w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg text-gray-900 font-medium placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent';

const Register = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('As senhas não coincidem');
      return;
    }
    if (form.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (form.password.length > 72) {
      setError('A senha deve ter no máximo 72 caracteres');
      return;
    }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/verify-email');
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel – form */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 bg-white lg:max-w-md xl:max-w-lg">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <img src="/logo.png" alt="CloudAtlas" className="w-10 h-10 object-contain" />
            <span className="text-2xl font-bold text-gray-900">CloudAtlas</span>
          </div>
          <p className="text-gray-500 text-sm">Gerenciamento multi-cloud centralizado</p>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Criar conta</h1>
        <p className="text-gray-500 mb-8">Preencha os dados para começar</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                name="name"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="Seu nome"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                name="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="seu@email.com"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                value={form.password}
                onChange={handleChange}
                placeholder="Mínimo 6 caracteres"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                name="confirm"
                required
                value={form.confirm}
                onChange={handleChange}
                placeholder="Repita a senha"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Já tem uma conta?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Entrar
          </Link>
        </p>
      </div>

      {/* Right panel */}
      <div
        className="hidden lg:flex flex-1 items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)' }}
      >
        <div className="text-center px-8">
          <img src="/logo.png" alt="CloudAtlas" className="w-24 h-24 object-contain mx-auto mb-6 drop-shadow-lg" />
          <h2 className="text-2xl font-bold text-white mb-3">CloudAtlas</h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
            Centralize a gestão da sua infraestrutura AWS e Azure em uma única plataforma segura.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 text-left">
            {['Instâncias EC2', 'VMs Azure', 'Análise de custos', 'Credenciais seguras'].map((f) => (
              <div key={f} className="flex items-center gap-2 text-slate-400 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
