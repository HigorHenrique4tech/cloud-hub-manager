import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, LogIn, Eye, EyeOff, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';
import OAuthButtons from '../components/auth/OAuthButtons';

/* ── Animated cloud network SVG ─────────────────────────────────── */
const CloudAnimation = () => (
  <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none p-4 lg:p-12">
    <div className="relative w-full max-w-2xl aspect-square flex items-center justify-center">
      {/* Background glow effects */}
      <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }}></div>
      <div className="absolute inset-1/4 bg-indigo-500/10 rounded-full blur-[80px]"></div>

      <svg
        viewBox="0 0 800 800"
        className="w-full h-full drop-shadow-2xl z-10"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="awsGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="azureGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gcpGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>

          <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <style>{`
            @keyframes float1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
            @keyframes float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(18px)} }
            @keyframes float3 { 0%,100%{transform:translateY(0)} 50%{transform:translateX(12px) translateY(-12px)} }
            @keyframes float4 { 0%,100%{transform:translateY(0)} 50%{transform:translateX(-12px) translateY(12px)} }
            @keyframes spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
            @keyframes spin-reverse-slow { from{transform:rotate(360deg)} to{transform:rotate(0deg)} }
            @keyframes pulse-ring { 0% { transform: scale(0.85); opacity: 0.4; } 50% { transform: scale(1.15); opacity: 0.8; } 100% { transform: scale(0.85); opacity: 0.4; } }
            @keyframes data-flow { 0% { stroke-dashoffset: 200; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }
            @keyframes data-flow-reverse { 0% { stroke-dashoffset: 0; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { stroke-dashoffset: 200; opacity: 0; } }
            
            .center-hub { animation: float1 7s ease-in-out infinite; transform-origin: 400px 400px; }
            .node-aws { animation: float2 8s ease-in-out infinite 0.5s; transform-origin: 200px 250px; }
            .node-azure { animation: float3 7.5s ease-in-out infinite 1s; transform-origin: 600px 250px; }
            .node-gcp { animation: float4 9s ease-in-out infinite 1.5s; transform-origin: 400px 650px; }
            .node-small-1 { animation: float1 6s ease-in-out infinite 0.2s; transform-origin: 150px 500px; }
            .node-small-2 { animation: float3 6.5s ease-in-out infinite 0.8s; transform-origin: 650px 500px; }
            .node-small-3 { animation: float2 7s ease-in-out infinite 1.2s; transform-origin: 400px 150px; }
            
            .orb-ring-1 { animation: spin-slow 30s linear infinite; transform-origin: 400px 400px; }
            .orb-ring-2 { animation: spin-reverse-slow 35s linear infinite; transform-origin: 400px 400px; }
            .orb-ring-3 { animation: pulse-ring 4s ease-in-out infinite; transform-origin: 400px 400px; }
            
            .connection { stroke-dasharray: 10 15; animation: data-flow 3s linear infinite; }
            .connection-reverse { stroke-dasharray: 10 15; animation: data-flow-reverse 3s linear infinite; }
            .connection-fast { stroke-dasharray: 15 20; animation: data-flow 2s linear infinite; }
          `}</style>
        </defs>

        {/* Orbit Rings Background */}
        <circle cx="400" cy="400" r="180" fill="none" stroke="#1e293b" strokeWidth="2" strokeOpacity="0.6" />
        <circle cx="400" cy="400" r="280" fill="none" stroke="#1e293b" strokeWidth="2" strokeDasharray="10 20" strokeOpacity="0.4" />

        {/* Animated Orbits */}
        <g className="orb-ring-1">
          <circle cx="400" cy="400" r="180" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="80 300" strokeOpacity="0.7" />
          <circle cx="220" cy="400" r="5" fill="#60a5fa" filter="url(#softGlow)" />
        </g>
        <g className="orb-ring-2">
          <circle cx="400" cy="400" r="280" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="150 500" strokeOpacity="0.5" />
          <circle cx="680" cy="400" r="7" fill="#a78bfa" filter="url(#softGlow)" />
          <circle cx="120" cy="400" r="4" fill="#a78bfa" />
        </g>

        {/* Static Base Connections */}
        <path d="M400 400 Q 300 325 200 250" fill="none" stroke="#1e293b" strokeWidth="4" />
        <path d="M400 400 Q 500 325 600 250" fill="none" stroke="#1e293b" strokeWidth="4" />
        <path d="M400 400 Q 400 525 400 650" fill="none" stroke="#1e293b" strokeWidth="4" />
        <path d="M200 250 Q 400 150 600 250" fill="none" stroke="#1e293b" strokeWidth="2" strokeDasharray="6 10" />
        <path d="M200 250 Q 250 450 400 650" fill="none" stroke="#1e293b" strokeWidth="2" strokeDasharray="6 10" />
        <path d="M600 250 Q 550 450 400 650" fill="none" stroke="#1e293b" strokeWidth="2" strokeDasharray="6 10" />
        <line x1="200" y1="250" x2="150" y2="500" stroke="#1e293b" strokeWidth="3" />
        <line x1="600" y1="250" x2="650" y2="500" stroke="#1e293b" strokeWidth="3" />
        <line x1="200" y1="250" x2="400" y2="150" stroke="#1e293b" strokeWidth="3" />
        <line x1="600" y1="250" x2="400" y2="150" stroke="#1e293b" strokeWidth="3" />

        {/* Animated Data Connections */}
        {/* Hub to AWS */}
        <path className="connection" d="M400 400 Q 300 325 200 250" fill="none" stroke="#f97316" strokeWidth="3" filter="url(#softGlow)" />
        {/* Hub to Azure */}
        <path className="connection-fast" d="M400 400 Q 500 325 600 250" fill="none" stroke="#0ea5e9" strokeWidth="3" filter="url(#softGlow)" />
        {/* Hub to GCP */}
        <path className="connection" d="M400 400 Q 400 525 400 650" fill="none" stroke="#ef4444" strokeWidth="3" filter="url(#softGlow)" />

        {/* Outer nodes animated connections */}
        <line className="connection-reverse" x1="200" y1="250" x2="150" y2="500" stroke="#8b5cf6" strokeWidth="2" filter="url(#softGlow)" />
        <line className="connection-fast" x1="600" y1="250" x2="650" y2="500" stroke="#8b5cf6" strokeWidth="2" filter="url(#softGlow)" />
        <line className="connection" x1="400" y1="150" x2="200" y2="250" stroke="#8b5cf6" strokeWidth="2" filter="url(#softGlow)" />

        {/* Small Nodes (K8s, DB, API) */}
        <g className="node-small-1">
          <circle cx="150" cy="500" r="45" fill="url(#nodeGlow)" />
          <circle cx="150" cy="500" r="22" fill="#0f172a" stroke="#8b5cf6" strokeWidth="3" filter="url(#neonGlow)" />
          <circle cx="150" cy="500" r="22" fill="#0f172a" stroke="#8b5cf6" strokeWidth="1" />
          <text x="150" y="502" textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#e2e8f0" fontWeight="bold" letterSpacing="0.5">K8s</text>
        </g>

        <g className="node-small-2">
          <circle cx="650" cy="500" r="45" fill="url(#nodeGlow)" />
          <circle cx="650" cy="500" r="22" fill="#0f172a" stroke="#8b5cf6" strokeWidth="3" filter="url(#neonGlow)" />
          <circle cx="650" cy="500" r="22" fill="#0f172a" stroke="#8b5cf6" strokeWidth="1" />
          <text x="650" y="502" textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#e2e8f0" fontWeight="bold" letterSpacing="0.5">DB</text>
        </g>

        <g className="node-small-3">
          <circle cx="400" cy="150" r="45" fill="url(#nodeGlow)" />
          <circle cx="400" cy="150" r="22" fill="#0f172a" stroke="#8b5cf6" strokeWidth="3" filter="url(#neonGlow)" />
          <circle cx="400" cy="150" r="22" fill="#0f172a" stroke="#8b5cf6" strokeWidth="1" />
          <text x="400" y="152" textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#e2e8f0" fontWeight="bold" letterSpacing="0.5">API</text>
        </g>

        {/* --- Main Cloud Nodes --- */}

        {/* AWS Node */}
        <g className="node-aws">
          <circle cx="200" cy="250" r="85" fill="url(#awsGlow)" />
          <circle cx="200" cy="250" r="50" fill="#0f172a" stroke="#f97316" strokeWidth="4" filter="url(#neonGlow)" />
          <circle cx="200" cy="250" r="50" fill="#0f172a" stroke="#f97316" strokeWidth="1" />
          <text x="200" y="244" textAnchor="middle" dominantBaseline="middle" fontSize="24" fontWeight="900" fill="#f97316" letterSpacing="1.5">AWS</text>
          <text x="200" y="270" textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#94a3b8" fontWeight="500">us-east-1</text>
          <circle cx="200" cy="250" r="62" fill="none" stroke="#f97316" strokeWidth="1.5" strokeDasharray="6 18" className="orb-ring-1" opacity="0.6" />
        </g>

        {/* Azure Node */}
        <g className="node-azure">
          <circle cx="600" cy="250" r="85" fill="url(#azureGlow)" />
          <circle cx="600" cy="250" r="50" fill="#0f172a" stroke="#0ea5e9" strokeWidth="4" filter="url(#neonGlow)" />
          <circle cx="600" cy="250" r="50" fill="#0f172a" stroke="#0ea5e9" strokeWidth="1" />
          <text x="600" y="244" textAnchor="middle" dominantBaseline="middle" fontSize="24" fontWeight="900" fill="#0ea5e9" letterSpacing="1.5">Azure</text>
          <text x="600" y="270" textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#94a3b8" fontWeight="500">eastus</text>
          <circle cx="600" cy="250" r="62" fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeDasharray="12 12" className="orb-ring-2" opacity="0.6" />
        </g>

        {/* GCP Node */}
        <g className="node-gcp">
          <circle cx="400" cy="650" r="85" fill="url(#gcpGlow)" />
          <circle cx="400" cy="650" r="50" fill="#0f172a" stroke="#ef4444" strokeWidth="4" filter="url(#neonGlow)" />
          <circle cx="400" cy="650" r="50" fill="#0f172a" stroke="#ef4444" strokeWidth="1" />
          <text x="400" y="644" textAnchor="middle" dominantBaseline="middle" fontSize="24" fontWeight="900" fill="#ef4444" letterSpacing="1.5">GCP</text>
          <text x="400" y="670" textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#94a3b8" fontWeight="500">us-central1</text>
          <circle cx="400" cy="650" r="62" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 12" className="orb-ring-1" opacity="0.6" />
        </g>

        {/* Center Hub Node */}
        <g className="center-hub">
          <circle className="orb-ring-3" cx="400" cy="400" r="105" fill="url(#hubGlow)" />
          <circle cx="400" cy="400" r="75" fill="#0f172a" stroke="#3b82f6" strokeWidth="6" filter="url(#neonGlow)" />
          <circle cx="400" cy="400" r="75" fill="#0f172a" stroke="#3b82f6" strokeWidth="2" />

          <circle cx="400" cy="400" r="58" fill="#1e293b" />

          {/* Inner Hexagon Icon */}
          <path d="M400 358 L436 379 L436 421 L400 442 L364 421 L364 379 Z" fill="none" stroke="#60a5fa" strokeWidth="3" filter="url(#softGlow)" />
          <path d="M400 358 L436 379 L436 421 L400 442 L364 421 L364 379 Z" fill="none" stroke="#60a5fa" strokeWidth="1" />

          {/* Core pulse */}
          <circle cx="400" cy="400" r="18" fill="#3b82f6" filter="url(#neonGlow)" />
          <circle cx="400" cy="400" r="18" fill="#60a5fa" />

          <text x="400" y="490" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="bold" fill="#60a5fa" letterSpacing="2.5" filter="url(#softGlow)">CLOUD ATLAS</text>
          <text x="400" y="490" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="bold" fill="#ffffff" letterSpacing="2.5">CLOUD ATLAS</text>
        </g>
      </svg>
    </div>

    {/* Information Card */}
    <div className="mt-8 z-20 flex flex-col items-center">
      <div className="bg-slate-900/60 backdrop-blur-xl py-5 px-8 sm:px-12 rounded-2xl border border-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transform hover:scale-105 transition-transform duration-300">
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide mb-2 text-center">Visibilidade Total</h2>
        <p className="text-slate-400 text-sm sm:text-base max-w-sm text-center leading-relaxed">
          Orquestre seus recursos multi-cloud através de um único painel de alta performance.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-6 text-xs sm:text-sm font-semibold">
          <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-orange-500/30 text-slate-200 shadow-[inset_0_0_10px_rgba(249,115,22,0.1)]">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_10px_#f97316]" /> AWS
          </span>
          <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-sky-500/30 text-slate-200 shadow-[inset_0_0_10px_rgba(14,165,233,0.1)]">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse shadow-[0_0_10px_#0ea5e9]" style={{ animationDelay: '0.4s' }} /> Azure
          </span>
          <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-red-500/30 text-slate-200 shadow-[inset_0_0_10px_rgba(239,68,68,0.1)]">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_#ef4444]" style={{ animationDelay: '0.8s' }} /> GCP
          </span>
        </div>
      </div>
    </div>
  </div>
);

const inputClass =
  'w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg text-gray-900 font-medium placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent';

/* ── Login page ──────────────────────────────────────────────────── */
const Login = () => {
  // Credentials step
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA step
  const [step, setStep] = useState('credentials'); // 'credentials' | 'otp'
  const [mfaToken, setMfaToken] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef(null);
  const otpInputRef = useRef(null);

  const { login, loginWithTokens } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const startCooldown = () => {
    setResendCooldown(60);
    clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((v) => {
        if (v <= 1) { clearInterval(cooldownRef.current); return 0; }
        return v - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(cooldownRef.current), []);

  useEffect(() => {
    if (step === 'otp') setTimeout(() => otpInputRef.current?.focus(), 50);
  }, [step]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.mfa_required) {
        setMfaToken(data.mfa_token);
        setStep('otp');
        startCooldown();
      } else {
        navigate(inviteToken ? `/invite/${inviteToken}` : '/');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setOtpError('');
    setLoading(true);
    try {
      const data = await authService.verifyMFA(mfaToken, otp);
      loginWithTokens(data);
      navigate(inviteToken ? `/invite/${inviteToken}` : '/');
    } catch (err) {
      setOtpError(err.response?.data?.detail || 'Código inválido');
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await authService.resendMFA(mfaToken);
      setOtpError('');
      setOtp('');
      startCooldown();
    } catch (err) {
      setOtpError(err.response?.data?.detail || 'Erro ao reenviar código');
    }
  };

  const handleBack = () => {
    setStep('credentials');
    setOtp('');
    setOtpError('');
    setMfaToken('');
    clearInterval(cooldownRef.current);
    setResendCooldown(0);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel – form */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 bg-white lg:max-w-md xl:max-w-lg">
        {/* Logo */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <img src="/logo.png" alt="CloudAtlas" className="w-10 h-10 object-contain" />
            <span className="text-2xl font-bold text-gray-900">CloudAtlas</span>
          </div>
          <p className="text-gray-500 text-sm">Gerenciamento multi-cloud centralizado</p>
        </div>

        {step === 'credentials' ? (
          <>
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

            <OAuthButtons />
          </>
        ) : (
          <>
            {/* OTP step */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Verificação em dois fatores</h1>
              <p className="text-gray-500 text-sm">
                Enviamos um código de 6 dígitos para<br />
                <span className="font-medium text-gray-700">{email}</span>
              </p>
            </div>

            {otpError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
                {otpError}
              </div>
            )}

            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-center">
                  Código de verificação
                </label>
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 font-mono text-2xl text-center tracking-[0.5em] placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {loading ? 'Verificando...' : 'Verificar'}
              </button>
            </form>

            <div className="mt-5 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
              </button>

              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar
              </button>
            </div>
          </>
        )}
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
