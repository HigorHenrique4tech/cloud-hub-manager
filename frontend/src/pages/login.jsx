import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/* ── Animated cloud network SVG ─────────────────────────────────── */
const CloudAnimation = () => (
  <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none">
    <svg
      viewBox="0 0 480 480"
      className="w-80 h-80 lg:w-96 lg:h-96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <style>{`
          @keyframes float1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
          @keyframes float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(8px)} }
          @keyframes float3 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
          @keyframes spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes pulse-dash {
            0%   { stroke-dashoffset: 200; opacity: 0.2; }
            50%  { opacity: 0.7; }
            100% { stroke-dashoffset: 0;   opacity: 0.2; }
          }
          .n1 { animation: float1 4s ease-in-out infinite; transform-origin: 240px 240px; }
          .n2 { animation: float2 5s ease-in-out infinite 0.8s; transform-origin: 100px 160px; }
          .n3 { animation: float3 4.5s ease-in-out infinite 1.4s; transform-origin: 380px 150px; }
          .n4 { animation: float1 6s ease-in-out infinite 0.3s; transform-origin: 120px 350px; }
          .n5 { animation: float2 4.2s ease-in-out infinite 1s; transform-origin: 370px 340px; }
          .n6 { animation: float3 5.5s ease-in-out infinite 0.5s; transform-origin: 240px 100px; }
          .ring { animation: spin-slow 12s linear infinite; transform-origin: 240px 240px; }
          .line { stroke-dasharray: 200; animation: pulse-dash 3s linear infinite; }
          .line2 { stroke-dasharray: 200; animation: pulse-dash 3.5s linear infinite 0.7s; }
          .line3 { stroke-dasharray: 200; animation: pulse-dash 4s linear infinite 1.3s; }
          .line4 { stroke-dasharray: 200; animation: pulse-dash 3.2s linear infinite 0.4s; }
          .line5 { stroke-dasharray: 200; animation: pulse-dash 3.8s linear infinite 1.8s; }
        `}</style>
      </defs>

      {/* Connection lines */}
      <line className="line"  x1="240" y1="240" x2="100" y2="160" stroke="#3b82f6" strokeWidth="1.5" />
      <line className="line2" x1="240" y1="240" x2="380" y2="150" stroke="#60a5fa" strokeWidth="1.5" />
      <line className="line3" x1="240" y1="240" x2="120" y2="350" stroke="#3b82f6" strokeWidth="1.5" />
      <line className="line4" x1="240" y1="240" x2="370" y2="340" stroke="#60a5fa" strokeWidth="1.5" />
      <line className="line5" x1="240" y1="240" x2="240" y2="100" stroke="#818cf8" strokeWidth="1.5" />
      <line className="line"  x1="100" y1="160" x2="240" y2="100" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.5" />
      <line className="line2" x1="380" y1="150" x2="240" y2="100" stroke="#60a5fa" strokeWidth="1" strokeOpacity="0.5" />

      {/* Rotating ring around center */}
      <circle className="ring" cx="240" cy="240" r="52" fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="8 6" strokeOpacity="0.5" />

      {/* Center hub node */}
      <g className="n1">
        <circle cx="240" cy="240" r="36" fill="url(#nodeGlow)" />
        <circle cx="240" cy="240" r="24" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="2" filter="url(#glow)" />
        {/* Cloud Hub icon */}
        <text x="240" y="245" textAnchor="middle" dominantBaseline="middle" fontSize="18" fill="#60a5fa">⬡</text>
      </g>

      {/* AWS node */}
      <g className="n2">
        <circle cx="100" cy="160" r="22" fill="#1a1a2e" stroke="#f97316" strokeWidth="2" filter="url(#glow)" />
        <text x="100" y="165" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="bold" fill="#f97316">AWS</text>
      </g>

      {/* Azure node */}
      <g className="n3">
        <circle cx="380" cy="150" r="22" fill="#1a1a2e" stroke="#0ea5e9" strokeWidth="2" filter="url(#glow)" />
        <text x="380" y="155" textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="bold" fill="#0ea5e9">Azure</text>
      </g>

      {/* Small nodes */}
      <g className="n4">
        <circle cx="120" cy="350" r="14" fill="#1a1a2e" stroke="#6366f1" strokeWidth="1.5" />
        <circle cx="120" cy="350" r="5" fill="#6366f1" />
      </g>

      <g className="n5">
        <circle cx="370" cy="340" r="14" fill="#1a1a2e" stroke="#6366f1" strokeWidth="1.5" />
        <circle cx="370" cy="340" r="5" fill="#6366f1" />
      </g>

      <g className="n6">
        <circle cx="240" cy="100" r="14" fill="#1a1a2e" stroke="#818cf8" strokeWidth="1.5" />
        <circle cx="240" cy="100" r="5" fill="#818cf8" />
      </g>
    </svg>

    <p className="mt-6 text-center text-slate-400 text-sm max-w-xs leading-relaxed px-4">
      Gerencie sua infraestrutura multi-cloud em um só lugar
    </p>

    <div className="mt-4 flex gap-4 text-xs text-slate-500">
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> AWS</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> Azure</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" /> Multi-cloud</span>
    </div>
  </div>
);

const inputClass =
  'w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg text-gray-900 font-medium placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent';

/* ── Login page ──────────────────────────────────────────────────── */
const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel – form */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 bg-white lg:max-w-md xl:max-w-lg">
        {/* Logo */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-lg">C</div>
            <span className="text-2xl font-bold text-gray-900">Cloud Hub</span>
          </div>
          <p className="text-gray-500 text-sm">Gerenciamento multi-cloud centralizado</p>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Bem-vindo de volta</h1>
        <p className="text-gray-500 mb-8">Entre com suas credenciais para continuar</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Não tem uma conta?{' '}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Criar conta
          </Link>
        </p>
      </div>

      {/* Right panel – animation */}
      <div
        className="hidden lg:flex flex-1 items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)' }}
      >
        <CloudAnimation />
      </div>
    </div>
  );
};

export default Login;
