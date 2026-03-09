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
      <div className="absolute inset-0 rounded-full blur-[120px]" style={{ background: 'rgba(56,189,248,0.06)', animation: 'pulse 4s ease-in-out infinite' }} />
      <div className="absolute inset-1/4 rounded-full blur-[80px]" style={{ background: 'rgba(99,102,241,0.06)' }} />

      <svg viewBox="0 0 800 800" className="w-full h-full z-10" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="hubGlow2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="awsGlow2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="azureGlow2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gcpGlow2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nodeGlow2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
          <filter id="neonGlow2" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="softGlow2" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <style>{`
            @keyframes float1b { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
            @keyframes float2b { 0%,100%{transform:translateY(0)} 50%{transform:translateY(18px)} }
            @keyframes float3b { 0%,100%{transform:translateY(0)} 50%{transform:translateX(12px) translateY(-12px)} }
            @keyframes float4b { 0%,100%{transform:translateY(0)} 50%{transform:translateX(-12px) translateY(12px)} }
            @keyframes spin-slowb { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
            @keyframes spin-rev-slowb { from{transform:rotate(360deg)} to{transform:rotate(0deg)} }
            @keyframes pulse-ringb { 0%{transform:scale(0.85);opacity:0.4} 50%{transform:scale(1.15);opacity:0.8} 100%{transform:scale(0.85);opacity:0.4} }
            @keyframes data-flowb { 0%{stroke-dashoffset:200;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{stroke-dashoffset:0;opacity:0} }
            @keyframes data-flow-revb { 0%{stroke-dashoffset:0;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{stroke-dashoffset:200;opacity:0} }
            .chb { animation: float1b 7s ease-in-out infinite; transform-origin: 400px 400px; }
            .nawsb { animation: float2b 8s ease-in-out infinite 0.5s; transform-origin: 200px 250px; }
            .nazb { animation: float3b 7.5s ease-in-out infinite 1s; transform-origin: 600px 250px; }
            .ngcpb { animation: float4b 9s ease-in-out infinite 1.5s; transform-origin: 400px 650px; }
            .ns1b { animation: float1b 6s ease-in-out infinite 0.2s; transform-origin: 150px 500px; }
            .ns2b { animation: float3b 6.5s ease-in-out infinite 0.8s; transform-origin: 650px 500px; }
            .ns3b { animation: float2b 7s ease-in-out infinite 1.2s; transform-origin: 400px 150px; }
            .or1b { animation: spin-slowb 30s linear infinite; transform-origin: 400px 400px; }
            .or2b { animation: spin-rev-slowb 35s linear infinite; transform-origin: 400px 400px; }
            .or3b { animation: pulse-ringb 4s ease-in-out infinite; transform-origin: 400px 400px; }
            .conn { stroke-dasharray: 10 15; animation: data-flowb 3s linear infinite; }
            .connr { stroke-dasharray: 10 15; animation: data-flow-revb 3s linear infinite; }
            .connf { stroke-dasharray: 15 20; animation: data-flowb 2s linear infinite; }
          `}</style>
        </defs>

        <circle cx="400" cy="400" r="180" fill="none" stroke="rgba(30,41,59,0.8)" strokeWidth="2" />
        <circle cx="400" cy="400" r="280" fill="none" stroke="rgba(30,41,59,0.6)" strokeWidth="2" strokeDasharray="10 20" />

        <g className="or1b">
          <circle cx="400" cy="400" r="180" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="80 300" strokeOpacity="0.6" />
          <circle cx="220" cy="400" r="5" fill="#7dd3fc" filter="url(#softGlow2)" />
        </g>
        <g className="or2b">
          <circle cx="400" cy="400" r="280" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="150 500" strokeOpacity="0.4" />
          <circle cx="680" cy="400" r="6" fill="#a78bfa" filter="url(#softGlow2)" />
        </g>

        <path d="M400 400 Q 300 325 200 250" fill="none" stroke="rgba(30,41,59,0.9)" strokeWidth="4" />
        <path d="M400 400 Q 500 325 600 250" fill="none" stroke="rgba(30,41,59,0.9)" strokeWidth="4" />
        <path d="M400 400 Q 400 525 400 650" fill="none" stroke="rgba(30,41,59,0.9)" strokeWidth="4" />
        <path d="M200 250 Q 400 150 600 250" fill="none" stroke="rgba(30,41,59,0.7)" strokeWidth="2" strokeDasharray="6 10" />
        <line x1="200" y1="250" x2="150" y2="500" stroke="rgba(30,41,59,0.9)" strokeWidth="3" />
        <line x1="600" y1="250" x2="650" y2="500" stroke="rgba(30,41,59,0.9)" strokeWidth="3" />
        <line x1="200" y1="250" x2="400" y2="150" stroke="rgba(30,41,59,0.9)" strokeWidth="3" />
        <line x1="600" y1="250" x2="400" y2="150" stroke="rgba(30,41,59,0.9)" strokeWidth="3" />

        <path className="conn" d="M400 400 Q 300 325 200 250" fill="none" stroke="#f97316" strokeWidth="3" filter="url(#softGlow2)" />
        <path className="connf" d="M400 400 Q 500 325 600 250" fill="none" stroke="#38bdf8" strokeWidth="3" filter="url(#softGlow2)" />
        <path className="conn" d="M400 400 Q 400 525 400 650" fill="none" stroke="#ef4444" strokeWidth="3" filter="url(#softGlow2)" />
        <line className="connr" x1="200" y1="250" x2="150" y2="500" stroke="#8b5cf6" strokeWidth="2" filter="url(#softGlow2)" />
        <line className="connf" x1="600" y1="250" x2="650" y2="500" stroke="#8b5cf6" strokeWidth="2" filter="url(#softGlow2)" />
        <line className="conn" x1="400" y1="150" x2="200" y2="250" stroke="#8b5cf6" strokeWidth="2" filter="url(#softGlow2)" />

        <g className="ns1b">
          <circle cx="150" cy="500" r="22" fill="#07090f" stroke="#8b5cf6" strokeWidth="2.5" filter="url(#neonGlow2)" />
          <text x="150" y="502" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#e2e8f0" fontWeight="bold">K8s</text>
        </g>
        <g className="ns2b">
          <circle cx="650" cy="500" r="22" fill="#07090f" stroke="#8b5cf6" strokeWidth="2.5" filter="url(#neonGlow2)" />
          <text x="650" y="502" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#e2e8f0" fontWeight="bold">DB</text>
        </g>
        <g className="ns3b">
          <circle cx="400" cy="150" r="22" fill="#07090f" stroke="#8b5cf6" strokeWidth="2.5" filter="url(#neonGlow2)" />
          <text x="400" y="152" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#e2e8f0" fontWeight="bold">API</text>
        </g>

        <g className="nawsb">
          <circle cx="200" cy="250" r="80" fill="url(#awsGlow2)" />
          <circle cx="200" cy="250" r="50" fill="#07090f" stroke="#f97316" strokeWidth="3.5" filter="url(#neonGlow2)" />
          <circle cx="200" cy="250" r="50" fill="#07090f" stroke="#f97316" strokeWidth="1" />
          <text x="200" y="244" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="900" fill="#f97316" letterSpacing="1">AWS</text>
          <text x="200" y="268" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">us-east-1</text>
        </g>
        <g className="nazb">
          <circle cx="600" cy="250" r="80" fill="url(#azureGlow2)" />
          <circle cx="600" cy="250" r="50" fill="#07090f" stroke="#38bdf8" strokeWidth="3.5" filter="url(#neonGlow2)" />
          <circle cx="600" cy="250" r="50" fill="#07090f" stroke="#38bdf8" strokeWidth="1" />
          <text x="600" y="244" textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="900" fill="#38bdf8" letterSpacing="1">Azure</text>
          <text x="600" y="268" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">eastus</text>
        </g>
        <g className="ngcpb">
          <circle cx="400" cy="650" r="80" fill="url(#gcpGlow2)" />
          <circle cx="400" cy="650" r="50" fill="#07090f" stroke="#ef4444" strokeWidth="3.5" filter="url(#neonGlow2)" />
          <circle cx="400" cy="650" r="50" fill="#07090f" stroke="#ef4444" strokeWidth="1" />
          <text x="400" y="644" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="900" fill="#ef4444" letterSpacing="1">GCP</text>
          <text x="400" y="668" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">us-central1</text>
        </g>

        <g className="chb">
          <circle className="or3b" cx="400" cy="400" r="100" fill="url(#hubGlow2)" />
          <circle cx="400" cy="400" r="72" fill="#07090f" stroke="#38bdf8" strokeWidth="5" filter="url(#neonGlow2)" />
          <circle cx="400" cy="400" r="72" fill="#07090f" stroke="#38bdf8" strokeWidth="1.5" />
          <circle cx="400" cy="400" r="55" fill="#0d1117" />
          <path d="M400 362 L432 381 L432 419 L400 438 L368 419 L368 381 Z" fill="none" stroke="#38bdf8" strokeWidth="2.5" filter="url(#softGlow2)" />
          <circle cx="400" cy="400" r="16" fill="#0ea5e9" filter="url(#neonGlow2)" />
          <circle cx="400" cy="400" r="16" fill="#38bdf8" />
          <text x="400" y="488" textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="bold" fill="#38bdf8" letterSpacing="2.5" filter="url(#softGlow2)">CLOUD ATLAS</text>
          <text x="400" y="488" textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="bold" fill="#f1f5f9" letterSpacing="2.5">CLOUD ATLAS</text>
        </g>
      </svg>
    </div>

    {/* Info card */}
    <div className="mt-8 z-20 flex flex-col items-center">
      <div
        className="py-5 px-8 sm:px-12 rounded-2xl text-center"
        style={{
          background: 'rgba(13,17,23,0.8)',
          border: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(16px)',
          maxWidth: 400,
        }}
      >
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide mb-2">Visibilidade Total</h2>
        <p className="text-sm sm:text-base max-w-sm text-center leading-relaxed" style={{ color: '#64748b' }}>
          Orquestre seus recursos multi-cloud através de um único painel de alta performance.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3 text-xs font-medium">
          {[
            { label: 'AWS',   color: '#f97316', border: 'rgba(249,115,22,0.3)',  bg: 'rgba(249,115,22,0.07)'  },
            { label: 'Azure', color: '#38bdf8', border: 'rgba(56,189,248,0.3)',  bg: 'rgba(56,189,248,0.07)'  },
            { label: 'GCP',   color: '#ef4444', border: 'rgba(239,68,68,0.3)',   bg: 'rgba(239,68,68,0.07)'   },
            { label: 'M365',  color: '#d4a017', border: 'rgba(212,160,23,0.3)',  bg: 'rgba(212,160,23,0.07)'  },
          ].map(({ label, color, border, bg }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ color, border: `1px solid ${border}`, background: bg }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  </div>
);

/* ── Login page ──────────────────────────────────────────────────── */
const Login = () => {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

  const [step, setStep]                     = useState('credentials');
  const [mfaToken, setMfaToken]             = useState('');
  const [otp, setOtp]                       = useState('');
  const [otpError, setOtpError]             = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef  = useRef(null);
  const otpInputRef  = useRef(null);

  const { login, loginWithTokens } = useAuth();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken    = searchParams.get('invite');

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

  /* ── Shared style tokens ── */
  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: '12px 14px 12px 40px',
    fontSize: 14,
    color: '#e2e8f0',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  };

  return (
    <>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginPulse {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.04); }
        }

        .login-page { font-family: 'DM Sans', system-ui, sans-serif; }
        .login-page h1, .login-page h2, .login-page .logo-text {
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        }

        .login-input:focus {
          border-color: rgba(56,189,248,0.5) !important;
          background: rgba(56,189,248,0.03) !important;
          box-shadow: 0 0 0 3px rgba(56,189,248,0.08) !important;
        }
        .login-input::placeholder { color: #334155; }

        .login-btn-primary {
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          box-shadow: 0 4px 20px rgba(14,165,233,0.25);
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .login-btn-primary:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(14,165,233,0.35);
        }
        .login-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

        .login-btn-ghost {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          transition: background 0.2s, border-color 0.2s, transform 0.15s;
        }
        .login-btn-ghost:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.14);
          transform: translateY(-1px);
        }

        .noise-overlay {
          position: fixed; inset: 0; pointer-events: none; z-index: 1;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          opacity: 0.35;
        }

        .anim-fadein-0 { animation: fadeUp 0.6s 0.0s ease both; }
        .anim-fadein-1 { animation: fadeUp 0.6s 0.1s ease both; }
        .anim-fadein-2 { animation: fadeUp 0.6s 0.15s ease both; }
        .anim-fadein-3 { animation: fadeUp 0.6s 0.2s ease both; }
        .anim-fadein-4 { animation: fadeUp 0.6s 0.25s ease both; }
        .anim-fadein-5 { animation: fadeUp 0.6s 0.3s ease both; }
        .anim-fadein-6 { animation: fadeUp 0.6s 0.35s ease both; }
        .anim-fadein-7 { animation: fadeUp 0.6s 0.4s ease both; }
      `}</style>

      <div className="login-page min-h-screen flex" style={{ background: '#07090f', color: '#e2e8f0', overflow: 'hidden' }}>
        {/* Noise overlay */}
        <div className="noise-overlay" />

        {/* ── LEFT PANEL ── */}
        <div
          className="relative flex flex-col z-10 overflow-hidden"
          style={{
            width: 420,
            minWidth: 420,
            background: 'rgba(13,17,23,0.93)',
            borderRight: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(24px)',
            padding: '48px 44px',
          }}
        >
          {/* Decorative glows */}
          <div style={{
            position: 'absolute', top: -120, left: -80, width: 340, height: 340, pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)',
          }} />
          <div style={{
            position: 'absolute', bottom: -80, right: -60, width: 260, height: 260, pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(249,115,22,0.06) 0%, transparent 70%)',
          }} />

          {/* Logo */}
          <div className="anim-fadein-0 flex items-center gap-2.5 mb-auto">
            <div style={{
              width: 36, height: 36, flexShrink: 0,
              background: 'linear-gradient(135deg, #1e3a5f, #0c1e33)',
              border: '1px solid rgba(56,189,248,0.3)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(56,189,248,0.15)',
            }}>
              <img src="/logo.png" alt="CloudAtlas" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            </div>
            <span className="logo-text" style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px', color: '#f1f5f9' }}>
              CloudAtlas
            </span>
          </div>

          {/* Form section */}
          <div className="flex flex-col gap-7 my-auto py-5">

            {step === 'credentials' ? (
              <>
                {/* Header */}
                <div className="anim-fadein-1">
                  <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.15, color: '#f8fafc', marginBottom: 8 }}>
                    Bem-vindo de volta
                  </h1>
                  <p style={{ fontSize: 14, color: '#64748b' }}>Entre com suas credenciais para continuar</p>
                </div>

                {/* Provider badges */}
                <div className="anim-fadein-2 flex flex-wrap gap-2">
                  {[
                    { label: 'AWS',   color: '#f97316', border: 'rgba(249,115,22,0.3)',  bg: 'rgba(249,115,22,0.07)'  },
                    { label: 'Azure', color: '#38bdf8', border: 'rgba(56,189,248,0.3)',  bg: 'rgba(56,189,248,0.07)'  },
                    { label: 'GCP',   color: '#ef4444', border: 'rgba(239,68,68,0.3)',   bg: 'rgba(239,68,68,0.07)'   },
                    { label: 'M365',  color: '#d4a017', border: 'rgba(212,160,23,0.3)',  bg: 'rgba(212,160,23,0.07)'  },
                  ].map(({ label, color, border, bg }) => (
                    <span
                      key={label}
                      className="flex items-center gap-1.5"
                      style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                        letterSpacing: '0.3px', color, border: `1px solid ${border}`, background: bg,
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      {label}
                    </span>
                  ))}
                </div>

                {/* Error */}
                {error && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10, fontSize: 13,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#fca5a5',
                  }}>
                    {error}
                  </div>
                )}

                {/* Fields */}
                <form onSubmit={handleSubmit} className="anim-fadein-3 flex flex-col gap-3.5">
                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      Email
                    </label>
                    <div className="relative">
                      <Mail style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="login-input"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="flex flex-col gap-1.5">
                    <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      Senha
                    </label>
                    <div className="relative">
                      <Lock style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="login-input"
                        style={{ ...inputStyle, paddingRight: 42 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                        style={{
                          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                          padding: 4, display: 'flex', alignItems: 'center', transition: 'color 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#e2e8f0'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                      >
                        {showPassword ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="anim-fadein-4 login-btn-primary w-full flex items-center justify-center gap-2 mt-1"
                    style={{
                      padding: '13px', borderRadius: 10, border: 'none',
                      color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    }}
                  >
                    {loading ? (
                      <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                    ) : (
                      <LogIn style={{ width: 16, height: 16 }} />
                    )}
                    {loading ? 'Entrando...' : 'Entrar'}
                  </button>
                </form>

                {/* Divider */}
                <div className="anim-fadein-5 flex items-center gap-3">
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                  <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>ou continue com</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                </div>

                {/* OAuth buttons */}
                <div className="anim-fadein-6">
                  <OAuthButtons />
                </div>

                {/* Footer */}
                <p className="anim-fadein-7 text-center" style={{ fontSize: 13, color: '#64748b' }}>
                  Não tem uma conta?{' '}
                  <Link to="/register" style={{ color: '#38bdf8', fontWeight: 500, textDecoration: 'none' }}
                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                  >
                    Criar conta
                  </Link>
                </p>
              </>
            ) : (
              /* ── OTP step ── */
              <>
                <div className="anim-fadein-1 flex flex-col items-center text-center">
                  <div style={{
                    width: 60, height: 60, borderRadius: 16, marginBottom: 16,
                    background: 'rgba(56,189,248,0.08)',
                    border: '1px solid rgba(56,189,248,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ShieldCheck style={{ width: 28, height: 28, color: '#38bdf8' }} />
                  </div>
                  <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginBottom: 8, letterSpacing: '-0.3px' }}>
                    Verificação em dois fatores
                  </h1>
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                    Enviamos um código de 6 dígitos para<br />
                    <span style={{ fontWeight: 500, color: '#94a3b8' }}>{email}</span>
                  </p>
                </div>

                {otpError && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10, fontSize: 13, textAlign: 'center',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#fca5a5',
                  }}>
                    {otpError}
                  </div>
                )}

                <form onSubmit={handleVerifyOTP} className="anim-fadein-3 flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'center' }}>
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
                      className="login-input"
                      style={{
                        ...inputStyle,
                        paddingLeft: 14,
                        fontFamily: 'monospace',
                        fontSize: 24,
                        textAlign: 'center',
                        letterSpacing: '0.5em',
                        color: '#f1f5f9',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="login-btn-primary w-full flex items-center justify-center gap-2"
                    style={{
                      padding: '13px', borderRadius: 10, border: 'none',
                      color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    }}
                  >
                    {loading ? (
                      <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                    ) : (
                      <ShieldCheck style={{ width: 16, height: 16 }} />
                    )}
                    {loading ? 'Verificando...' : 'Verificar'}
                  </button>
                </form>

                <div className="flex flex-col items-center gap-3 mt-1">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    className="flex items-center gap-1.5"
                    style={{
                      background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                      fontSize: 13, color: resendCooldown > 0 ? '#475569' : '#64748b',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => { if (!resendCooldown) e.currentTarget.style.color = '#38bdf8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = resendCooldown > 0 ? '#475569' : '#64748b'; }}
                  >
                    <RefreshCw style={{ width: 13, height: 13 }} />
                    {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
                  </button>

                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex items-center gap-1.5"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#64748b', transition: 'color 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#94a3b8'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                  >
                    <ArrowLeft style={{ width: 13, height: 13 }} />
                    Voltar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div
          className="hidden lg:flex flex-1 relative items-center justify-center z-10 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #07090f 0%, #0d1117 55%, #07090f 100%)' }}
        >
          {/* Subtle grid */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'linear-gradient(rgba(56,189,248,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.03) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />
          <CloudAnimation />
        </div>
      </div>
    </>
  );
};

export default Login;
