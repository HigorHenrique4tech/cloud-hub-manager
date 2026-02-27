import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, LogIn, Eye, EyeOff, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';
import OAuthButtons from '../components/auth/OAuthButtons';

/* ── Globe animation ──────────────────────────────────────────────── */
const GlobeAnimation = () => (
  <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none">

    {/* Ambient glow layers */}
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-[520px] h-[520px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 70%)' }} />
    </div>
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-[280px] h-[280px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(96,165,250,0.12) 0%, transparent 80%)' }} />
    </div>

    <svg
      viewBox="0 0 480 480"
      className="w-80 h-80 lg:w-[420px] lg:h-[420px] relative z-10 drop-shadow-2xl"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="globeSphere" cx="38%" cy="35%" r="70%">
          <stop offset="0%"   stopColor="#1e3a8a" stopOpacity="0.9" />
          <stop offset="45%"  stopColor="#0c1830" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#050810" stopOpacity="1" />
        </radialGradient>

        <radialGradient id="globeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#2563eb" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#60a5fa" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>

        <filter id="nodeGlow">
          <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>

        <filter id="softGlow">
          <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>

        <clipPath id="globeClip">
          <circle cx="240" cy="240" r="118" />
        </clipPath>

        <style>{`
          @keyframes floatUp   { 0%,100%{transform:translateY(0px)}  50%{transform:translateY(-10px)} }
          @keyframes floatDown { 0%,100%{transform:translateY(0px)}  50%{transform:translateY(8px)}  }
          @keyframes spinCW    { from{transform:rotate(0deg)}   to{transform:rotate(360deg)}  }
          @keyframes spinCCW   { from{transform:rotate(0deg)}   to{transform:rotate(-360deg)} }
          @keyframes spinDiag  { from{transform:rotate(-20deg)} to{transform:rotate(340deg)}  }
          @keyframes pulseDash {
            0%   { stroke-dashoffset: 300; opacity: 0.1; }
            40%  { opacity: 0.55; }
            100% { stroke-dashoffset: 0;   opacity: 0.1; }
          }
          @keyframes pulseRing {
            0%,100% { opacity: 0.35; }
            50%     { opacity: 0.65; }
          }
          @keyframes shimmer {
            0%,100% { opacity:0.25; } 50% { opacity:0.6; }
          }
          .nAws   { animation: floatUp   5.0s ease-in-out infinite 0.0s; }
          .nAzure { animation: floatDown 4.5s ease-in-out infinite 0.8s; }
          .nM365  { animation: floatUp   5.5s ease-in-out infinite 1.3s; }
          .nSec   { animation: floatDown 4.2s ease-in-out infinite 0.4s; }
          .ring1  { animation: spinCW   22s linear infinite; transform-origin: 240px 240px; }
          .ring2  { animation: spinCCW  18s linear infinite; transform-origin: 240px 240px; }
          .ring3  { animation: spinDiag 28s linear infinite; transform-origin: 240px 240px; }
          .rPulse { animation: pulseRing 4s ease-in-out infinite; }
          .lA  { stroke-dasharray:300; animation: pulseDash 3.2s linear infinite 0.0s; }
          .lB  { stroke-dasharray:300; animation: pulseDash 3.8s linear infinite 0.9s; }
          .lC  { stroke-dasharray:300; animation: pulseDash 3.5s linear infinite 1.8s; }
          .lD  { stroke-dasharray:300; animation: pulseDash 4.0s linear infinite 0.5s; }
          .shimmer { animation: shimmer 3s ease-in-out infinite; }
        `}</style>
      </defs>

      {/* ── Outer ambient halo ── */}
      <circle cx="240" cy="240" r="210" fill="url(#globeGlow)" />

      {/* ── Connection lines (behind globe) ── */}
      <line className="lA" x1="240" y1="240" x2="82"  y2="118" stroke="#3b82f6" strokeWidth="1.5" />
      <line className="lB" x1="240" y1="240" x2="398" y2="118" stroke="#38bdf8" strokeWidth="1.5" />
      <line className="lC" x1="240" y1="240" x2="86"  y2="362" stroke="#818cf8" strokeWidth="1.5" />
      <line className="lD" x1="240" y1="240" x2="394" y2="358" stroke="#60a5fa" strokeWidth="1.5" />

      {/* ── Globe sphere ── */}
      <circle cx="240" cy="240" r="120" fill="url(#globeSphere)" />

      {/* ── Grid lines (clipped to globe) ── */}
      <g clipPath="url(#globeClip)" opacity="0.18">
        {/* latitude */}
        <ellipse cx="240" cy="200" rx="118" ry="22"  fill="none" stroke="#93c5fd" strokeWidth="0.7" />
        <ellipse cx="240" cy="240" rx="118" ry="40"  fill="none" stroke="#93c5fd" strokeWidth="0.7" />
        <ellipse cx="240" cy="278" rx="118" ry="22"  fill="none" stroke="#93c5fd" strokeWidth="0.7" />
        <ellipse cx="240" cy="160" rx="118" ry="8"   fill="none" stroke="#93c5fd" strokeWidth="0.5" />
        <ellipse cx="240" cy="320" rx="118" ry="8"   fill="none" stroke="#93c5fd" strokeWidth="0.5" />
        {/* longitude */}
        <ellipse cx="240" cy="240" rx="25"  ry="118" fill="none" stroke="#93c5fd" strokeWidth="0.7" />
        <ellipse cx="240" cy="240" rx="65"  ry="118" fill="none" stroke="#93c5fd" strokeWidth="0.7" />
        <ellipse cx="240" cy="240" rx="100" ry="118" fill="none" stroke="#93c5fd" strokeWidth="0.7" />
      </g>

      {/* ── Globe edge rim ── */}
      <circle cx="240" cy="240" r="120" fill="none" stroke="#2563eb" strokeWidth="1.2" strokeOpacity="0.6" />

      {/* ── Globe inner highlight ── */}
      <circle cx="210" cy="208" r="48" fill="#ffffff" fillOpacity="0.025" />
      <circle cx="198" cy="200" r="18" fill="#3b82f6" fillOpacity="0.12" />

      {/* ── Orbit rings ── */}
      <g className="ring1 rPulse">
        <ellipse cx="240" cy="240" rx="172" ry="36"
          fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="6 5" strokeOpacity="0.55" />
      </g>
      <g className="ring2 rPulse">
        <ellipse cx="240" cy="240" rx="36" ry="172"
          fill="none" stroke="#6366f1" strokeWidth="1" strokeDasharray="6 5" strokeOpacity="0.45" />
      </g>
      <g className="ring3">
        <ellipse cx="240" cy="240" rx="160" ry="55"
          fill="none" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="4 7" strokeOpacity="0.3"
          transform="rotate(-30 240 240)" />
      </g>

      {/* ── Center hub (shield icon) ── */}
      <g filter="url(#softGlow)">
        <circle cx="240" cy="240" r="30" fill="url(#centerGlow)" />
        <circle cx="240" cy="240" r="22" fill="#070c1a" stroke="#3b82f6" strokeWidth="1.8" />
        <path
          d="M240 230 L232 234.5 L232 243 Q232 251.5 240 255 Q248 251.5 248 243 L248 234.5 Z"
          fill="none" stroke="#60a5fa" strokeWidth="1.6" strokeLinejoin="round"
        />
      </g>

      {/* ── AWS node ── */}
      <g className="nAws" filter="url(#nodeGlow)">
        <circle cx="82"  cy="118" r="30" fill="#070c1a" stroke="#f97316" strokeWidth="1.8" />
        <circle cx="82"  cy="118" r="38" fill="none" stroke="#f97316" strokeWidth="0.5" strokeOpacity="0.25" />
        <text x="82" y="123" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="bold" fill="#f97316">AWS</text>
      </g>

      {/* ── Azure node ── */}
      <g className="nAzure" filter="url(#nodeGlow)">
        <circle cx="398" cy="118" r="30" fill="#070c1a" stroke="#0ea5e9" strokeWidth="1.8" />
        <circle cx="398" cy="118" r="38" fill="none" stroke="#0ea5e9" strokeWidth="0.5" strokeOpacity="0.25" />
        <text x="398" y="123" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="bold" fill="#0ea5e9">Azure</text>
      </g>

      {/* ── Microsoft 365 node (Windows-style 4-square icon) ── */}
      <g className="nM365" filter="url(#nodeGlow)">
        <circle cx="394" cy="358" r="30" fill="#070c1a" stroke="#2563eb" strokeWidth="1.8" />
        <circle cx="394" cy="358" r="38" fill="none" stroke="#2563eb" strokeWidth="0.5" strokeOpacity="0.25" />
        <rect x="383" y="348" width="8" height="8" fill="#f25022" rx="1.2" />
        <rect x="393" y="348" width="8" height="8" fill="#7fba00" rx="1.2" />
        <rect x="383" y="358" width="8" height="8" fill="#00a4ef" rx="1.2" />
        <rect x="393" y="358" width="8" height="8" fill="#ffb900" rx="1.2" />
      </g>

      {/* ── Security node ── */}
      <g className="nSec" filter="url(#nodeGlow)">
        <circle cx="86"  cy="362" r="30" fill="#070c1a" stroke="#8b5cf6" strokeWidth="1.8" />
        <circle cx="86"  cy="362" r="38" fill="none" stroke="#8b5cf6" strokeWidth="0.5" strokeOpacity="0.25" />
        <path
          d="M86 352 L79 356 L79 363 Q79 370 86 373 Q93 370 93 363 L93 356 Z"
          fill="none" stroke="#a78bfa" strokeWidth="1.6" strokeLinejoin="round"
        />
      </g>

      {/* ── Floating particles ── */}
      <circle className="shimmer" cx="160" cy="170" r="2" fill="#60a5fa" />
      <circle className="shimmer" cx="320" cy="175" r="1.5" fill="#38bdf8" />
      <circle className="shimmer" cx="155" cy="310" r="2" fill="#818cf8" />
      <circle className="shimmer" cx="330" cy="308" r="1.5" fill="#60a5fa" />
      <circle className="shimmer" cx="240" cy="140" r="1.5" fill="#93c5fd" />
      <circle className="shimmer" cx="240" cy="345" r="2"   fill="#818cf8" />
    </svg>

    {/* Tagline */}
    <p className="mt-6 text-center text-slate-300 text-lg font-semibold max-w-sm leading-snug tracking-tight">
      Governança e Segurança<br />
      <span className="text-white">Multi-Cloud em um só lugar</span>
    </p>

    {/* Provider chips */}
    <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-400 px-6">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> AWS
      </span>
      <span className="text-slate-600">•</span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> Azure
      </span>
      <span className="text-slate-600">•</span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Microsoft 365
      </span>
      <span className="text-slate-600">•</span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" /> Segurança
      </span>
    </div>
  </div>
);

/* ── Input style for dark theme ─────────────────────────────────── */
const inputClass =
  'w-full pl-10 pr-10 py-3 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 font-medium ' +
  'bg-white/5 border border-white/10 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/60 ' +
  'transition-colors';

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
    <div className="min-h-screen flex" style={{ background: '#080c14' }}>

      {/* ── Left panel — login form ── */}
      <div
        className="flex-1 flex flex-col justify-center px-10 py-12 lg:max-w-[460px] xl:max-w-[500px] relative"
        style={{ background: 'linear-gradient(160deg, #0d1220 0%, #080c14 100%)' }}
      >
        {/* Subtle left-edge glow */}
        <div className="absolute inset-y-0 right-0 w-px"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(37,99,235,0.25), transparent)' }} />

        {/* Logo */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-1">
            <img src="/logo.png" alt="CloudAtlas" className="w-10 h-10 object-contain" />
            <span className="text-2xl font-bold text-white tracking-tight">CloudAtlas</span>
          </div>
          <p className="text-slate-500 text-xs tracking-wide uppercase font-medium ml-[52px]">
            Multi-Cloud Control &amp; Security Platform
          </p>
        </div>

        {step === 'credentials' ? (
          <>
            <h1 className="text-3xl font-bold text-white mb-1 leading-tight">
              Acesse seu centro<br />de controle
            </h1>
            <p className="text-slate-400 text-sm mb-8">Entre com sua conta para continuar</p>

            {error && (
              <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
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
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                style={{
                  background: loading
                    ? 'rgba(37,99,235,0.5)'
                    : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  boxShadow: loading ? 'none' : '0 4px 24px rgba(37,99,235,0.4)',
                }}
              >
                {loading
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <LogIn className="w-4 h-4" />}
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">
              Não tem uma conta?{' '}
              <Link to="/register" className="text-blue-400 font-medium hover:text-blue-300 transition-colors">
                Criar conta
              </Link>
            </p>

            <OAuthButtons />

            {/* Security badge */}
            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-600">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current flex-shrink-0">
                <path d="M8 1L2 3.5v4C2 11.08 4.6 14.22 8 15c3.4-.78 6-3.92 6-7.5v-4L8 1z" />
              </svg>
              Seus dados são protegidos com criptografia de nível enterprise
            </div>
          </>
        ) : (
          <>
            {/* OTP step */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.35)' }}>
                <ShieldCheck className="w-8 h-8 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Verificação em dois fatores</h1>
              <p className="text-slate-400 text-sm">
                Enviamos um código de 6 dígitos para<br />
                <span className="font-semibold text-slate-200">{email}</span>
              </p>
            </div>

            {otpError && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
                {otpError}
              </div>
            )}

            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 text-center">
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
                  className="w-full px-4 py-3 rounded-xl font-mono text-2xl text-center tracking-[0.5em] bg-white/5 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/60"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  boxShadow: '0 4px 24px rgba(37,99,235,0.4)',
                }}
              >
                {loading
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <ShieldCheck className="w-4 h-4" />}
                {loading ? 'Verificando...' : 'Verificar'}
              </button>
            </form>

            <div className="mt-5 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-400 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
              </button>

              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Right panel — globe animation ── */}
      <div
        className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #070b12 0%, #0d1525 50%, #07090f 100%)' }}
      >
        {/* Subtle top-right corner glow */}
        <div className="absolute top-0 right-0 w-96 h-96 pointer-events-none"
          style={{ background: 'radial-gradient(circle at top right, rgba(37,99,235,0.08), transparent 70%)' }} />
        {/* Bottom-left glow */}
        <div className="absolute bottom-0 left-0 w-80 h-80 pointer-events-none"
          style={{ background: 'radial-gradient(circle at bottom left, rgba(99,102,241,0.07), transparent 70%)' }} />

        <GlobeAnimation />
      </div>
    </div>
  );
};

export default Login;
