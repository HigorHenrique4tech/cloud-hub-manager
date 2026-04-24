import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { User, Mail, Lock, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OAuthButtons from '../components/auth/OAuthButtons';

/* ── Animated cloud network SVG (shared visual) ─────────────────── */
const CloudAnimation = () => (
  <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none p-4 lg:p-12">
    <div className="relative w-full max-w-2xl aspect-square flex items-center justify-center">
      <div className="absolute inset-0 rounded-full blur-[120px]" style={{ background: 'rgba(56,189,248,0.06)', animation: 'pulse 4s ease-in-out infinite' }} />
      <div className="absolute inset-1/4 rounded-full blur-[80px]" style={{ background: 'rgba(99,102,241,0.06)' }} />

      <svg viewBox="0 0 800 800" className="w-full h-full z-10" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="hubGlowR" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="awsGlowR" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="azureGlowR" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gcpGlowR" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nodeGlowR" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
          <filter id="neonGlowR" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="softGlowR" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <style>{`
            @keyframes float1r { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
            @keyframes float2r { 0%,100%{transform:translateY(0)} 50%{transform:translateY(18px)} }
            @keyframes float3r { 0%,100%{transform:translateY(0)} 50%{transform:translateX(12px) translateY(-12px)} }
            @keyframes float4r { 0%,100%{transform:translateY(0)} 50%{transform:translateX(-12px) translateY(12px)} }
            @keyframes spin-slowr { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
            @keyframes spin-rev-slowr { from{transform:rotate(360deg)} to{transform:rotate(0deg)} }
            @keyframes pulse-ringr { 0%{transform:scale(0.85);opacity:0.4} 50%{transform:scale(1.15);opacity:0.8} 100%{transform:scale(0.85);opacity:0.4} }
            @keyframes data-flowr { 0%{stroke-dashoffset:200;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{stroke-dashoffset:0;opacity:0} }
            @keyframes data-flow-revr { 0%{stroke-dashoffset:0;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{stroke-dashoffset:200;opacity:0} }
            .chr { animation: float1r 7s ease-in-out infinite; transform-origin: 400px 400px; }
            .nawsr { animation: float2r 8s ease-in-out infinite 0.5s; transform-origin: 200px 250px; }
            .nazr { animation: float3r 7.5s ease-in-out infinite 1s; transform-origin: 600px 250px; }
            .ngcpr { animation: float4r 9s ease-in-out infinite 1.5s; transform-origin: 400px 650px; }
            .ns1r { animation: float1r 6s ease-in-out infinite 0.2s; transform-origin: 150px 500px; }
            .ns2r { animation: float3r 6.5s ease-in-out infinite 0.8s; transform-origin: 650px 500px; }
            .ns3r { animation: float2r 7s ease-in-out infinite 1.2s; transform-origin: 400px 150px; }
            .or1r { animation: spin-slowr 30s linear infinite; transform-origin: 400px 400px; }
            .or2r { animation: spin-rev-slowr 35s linear infinite; transform-origin: 400px 400px; }
            .or3r { animation: pulse-ringr 4s ease-in-out infinite; transform-origin: 400px 400px; }
            .connReg  { stroke-dasharray: 10 15; animation: data-flowr 3s linear infinite; }
            .connrReg { stroke-dasharray: 10 15; animation: data-flow-revr 3s linear infinite; }
            .connfReg { stroke-dasharray: 15 20; animation: data-flowr 2s linear infinite; }
          `}</style>
        </defs>

        <circle cx="400" cy="400" r="180" fill="none" stroke="rgba(30,41,59,0.8)" strokeWidth="2" />
        <circle cx="400" cy="400" r="280" fill="none" stroke="rgba(30,41,59,0.6)" strokeWidth="2" strokeDasharray="10 20" />

        <g className="or1r">
          <circle cx="400" cy="400" r="180" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="80 300" strokeOpacity="0.6" />
          <circle cx="220" cy="400" r="5" fill="#7dd3fc" filter="url(#softGlowR)" />
        </g>
        <g className="or2r">
          <circle cx="400" cy="400" r="280" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="150 500" strokeOpacity="0.4" />
          <circle cx="680" cy="400" r="6" fill="#a78bfa" filter="url(#softGlowR)" />
        </g>

        <path d="M400 400 Q 300 325 200 250" fill="none" stroke="rgba(30,41,59,0.9)" strokeWidth="4" />
        <path d="M400 400 Q 500 325 600 250" fill="none" stroke="rgba(30,41,59,0.9)" strokeWidth="4" />
        <path d="M400 400 Q 400 525 400 650" fill="none" stroke="rgba(30,41,59,0.9)" strokeWidth="4" />
        <path d="M200 250 Q 400 150 600 250" fill="none" stroke="rgba(30,41,59,0.7)" strokeWidth="2" strokeDasharray="6 10" />
        <line x1="200" y1="250" x2="150" y2="500" stroke="rgba(30,41,59,0.9)" strokeWidth="3" />
        <line x1="600" y1="250" x2="650" y2="500" stroke="rgba(30,41,59,0.9)" strokeWidth="3" />
        <line x1="200" y1="250" x2="400" y2="150" stroke="rgba(30,41,59,0.9)" strokeWidth="3" />
        <line x1="600" y1="250" x2="400" y2="150" stroke="rgba(30,41,59,0.9)" strokeWidth="3" />

        <path className="connReg" d="M400 400 Q 300 325 200 250" fill="none" stroke="#f97316" strokeWidth="3" filter="url(#softGlowR)" />
        <path className="connfReg" d="M400 400 Q 500 325 600 250" fill="none" stroke="#38bdf8" strokeWidth="3" filter="url(#softGlowR)" />
        <path className="connReg" d="M400 400 Q 400 525 400 650" fill="none" stroke="#ef4444" strokeWidth="3" filter="url(#softGlowR)" />
        <line className="connrReg" x1="200" y1="250" x2="150" y2="500" stroke="#8b5cf6" strokeWidth="2" filter="url(#softGlowR)" />
        <line className="connfReg" x1="600" y1="250" x2="650" y2="500" stroke="#8b5cf6" strokeWidth="2" filter="url(#softGlowR)" />
        <line className="connReg" x1="400" y1="150" x2="200" y2="250" stroke="#8b5cf6" strokeWidth="2" filter="url(#softGlowR)" />

        <g className="ns1r">
          <circle cx="150" cy="500" r="22" fill="#07090f" stroke="#8b5cf6" strokeWidth="2.5" filter="url(#neonGlowR)" />
          <text x="150" y="502" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#e2e8f0" fontWeight="bold">K8s</text>
        </g>
        <g className="ns2r">
          <circle cx="650" cy="500" r="22" fill="#07090f" stroke="#8b5cf6" strokeWidth="2.5" filter="url(#neonGlowR)" />
          <text x="650" y="502" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#e2e8f0" fontWeight="bold">DB</text>
        </g>
        <g className="ns3r">
          <circle cx="400" cy="150" r="22" fill="#07090f" stroke="#8b5cf6" strokeWidth="2.5" filter="url(#neonGlowR)" />
          <text x="400" y="152" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#e2e8f0" fontWeight="bold">API</text>
        </g>

        <g className="nawsr">
          <circle cx="200" cy="250" r="80" fill="url(#awsGlowR)" />
          <circle cx="200" cy="250" r="50" fill="#07090f" stroke="#f97316" strokeWidth="3.5" filter="url(#neonGlowR)" />
          <circle cx="200" cy="250" r="50" fill="#07090f" stroke="#f97316" strokeWidth="1" />
          <text x="200" y="244" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="900" fill="#f97316" letterSpacing="1">AWS</text>
          <text x="200" y="268" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">us-east-1</text>
        </g>
        <g className="nazr">
          <circle cx="600" cy="250" r="80" fill="url(#azureGlowR)" />
          <circle cx="600" cy="250" r="50" fill="#07090f" stroke="#38bdf8" strokeWidth="3.5" filter="url(#neonGlowR)" />
          <circle cx="600" cy="250" r="50" fill="#07090f" stroke="#38bdf8" strokeWidth="1" />
          <text x="600" y="244" textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="900" fill="#38bdf8" letterSpacing="1">Azure</text>
          <text x="600" y="268" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">eastus</text>
        </g>
        <g className="ngcpr">
          <circle cx="400" cy="650" r="80" fill="url(#gcpGlowR)" />
          <circle cx="400" cy="650" r="50" fill="#07090f" stroke="#ef4444" strokeWidth="3.5" filter="url(#neonGlowR)" />
          <circle cx="400" cy="650" r="50" fill="#07090f" stroke="#ef4444" strokeWidth="1" />
          <text x="400" y="644" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="900" fill="#ef4444" letterSpacing="1">GCP</text>
          <text x="400" y="668" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">us-central1</text>
        </g>

        <g className="chr">
          <circle className="or3r" cx="400" cy="400" r="100" fill="url(#hubGlowR)" />
          <circle cx="400" cy="400" r="72" fill="#07090f" stroke="#38bdf8" strokeWidth="5" filter="url(#neonGlowR)" />
          <circle cx="400" cy="400" r="72" fill="#07090f" stroke="#38bdf8" strokeWidth="1.5" />
          <circle cx="400" cy="400" r="55" fill="#0d1117" />
          <path d="M400 362 L432 381 L432 419 L400 438 L368 419 L368 381 Z" fill="none" stroke="#38bdf8" strokeWidth="2.5" filter="url(#softGlowR)" />
          <circle cx="400" cy="400" r="16" fill="#0ea5e9" filter="url(#neonGlowR)" />
          <circle cx="400" cy="400" r="16" fill="#38bdf8" />
          <text x="400" y="488" textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="bold" fill="#38bdf8" letterSpacing="2.5" filter="url(#softGlowR)">CLOUD ATLAS</text>
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
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide mb-2">Comece agora</h2>
        <p className="text-sm sm:text-base max-w-sm text-center leading-relaxed" style={{ color: '#64748b' }}>
          Crie sua conta e gerencie toda sua infraestrutura multi-cloud em um único lugar.
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

/* ── Register page ───────────────────────────────────────────────── */
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
    if (form.password !== form.confirm) { setError('As senhas não coincidem'); return; }
    if (form.password.length < 8) { setError('A senha deve ter pelo menos 8 caracteres'); return; }
    if (form.password.length > 72) { setError('A senha deve ter no máximo 72 caracteres'); return; }
    if (!/[a-z]/.test(form.password)) { setError('A senha deve conter pelo menos uma letra minúscula'); return; }
    if (!/[A-Z]/.test(form.password)) { setError('A senha deve conter pelo menos uma letra maiúscula'); return; }
    if (!/\d/.test(form.password)) { setError('A senha deve conter pelo menos um número'); return; }
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+[\]\\;'`~/]/.test(form.password)) { setError('A senha deve conter pelo menos um caractere especial (!@#$%...)'); return; }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/complete-profile', { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map(e => e.msg?.replace(/^Value error,\s*/i, '') || String(e)).join(' • '));
      } else {
        setError(detail || 'Erro ao criar conta');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.13)',
    borderRadius: 10,
    padding: '12px 14px 12px 40px',
    fontSize: 14,
    color: '#f1f5f9',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        @keyframes fadeUpReg {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .reg-page { font-family: 'DM Sans', system-ui, sans-serif; }
        .reg-page h1, .reg-page .logo-text {
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        }

        .reg-input:focus {
          border-color: rgba(56,189,248,0.5) !important;
          background: rgba(56,189,248,0.03) !important;
          box-shadow: 0 0 0 3px rgba(56,189,248,0.08) !important;
        }
        .reg-input::placeholder { color: #334155; }

        .reg-btn-primary {
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          box-shadow: 0 4px 20px rgba(14,165,233,0.25);
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .reg-btn-primary:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(14,165,233,0.35);
        }
        .reg-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

        .noise-overlay-reg {
          position: fixed; inset: 0; pointer-events: none; z-index: 1;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          opacity: 0.35;
        }

        .reg-fadein-0 { animation: fadeUpReg 0.6s 0.0s ease both; }
        .reg-fadein-1 { animation: fadeUpReg 0.6s 0.1s ease both; }
        .reg-fadein-2 { animation: fadeUpReg 0.6s 0.15s ease both; }
        .reg-fadein-3 { animation: fadeUpReg 0.6s 0.2s ease both; }
        .reg-fadein-4 { animation: fadeUpReg 0.6s 0.25s ease both; }
        .reg-fadein-5 { animation: fadeUpReg 0.6s 0.3s ease both; }
        .reg-fadein-6 { animation: fadeUpReg 0.6s 0.35s ease both; }
      `}</style>

      <div className="reg-page min-h-screen flex" style={{ background: '#07090f', color: '#e2e8f0', overflow: 'hidden' }}>
        <div className="noise-overlay-reg" />

        {/* ── LEFT PANEL ── */}
        <div
          className="relative flex flex-col z-10 overflow-y-auto w-full lg:w-[420px] lg:min-w-[420px]"
          style={{
            background: 'rgba(13,17,23,0.93)',
            borderRight: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(24px)',
            padding: 'clamp(24px, 5vw, 48px) clamp(20px, 5vw, 44px)',
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
          <div className="reg-fadein-0 flex items-center gap-3 mb-auto">
            <div style={{
              width: 52, height: 52, flexShrink: 0,
              background: 'linear-gradient(135deg, #1e3a5f, #0c1e33)',
              border: '1px solid rgba(56,189,248,0.3)',
              borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 24px rgba(56,189,248,0.2)',
            }}>
              <img src="/logo.png" alt="CloudAtlas" style={{ width: 34, height: 34, objectFit: 'contain' }} />
            </div>
            <span className="logo-text" style={{ fontWeight: 800, fontSize: 30, letterSpacing: '-0.5px', color: '#f1f5f9' }}>
              CloudAtlas
            </span>
          </div>

          {/* Form section */}
          <div className="flex flex-col gap-5 my-auto py-5">

            {/* Header */}
            <div className="reg-fadein-1">
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.15, color: '#f8fafc', marginBottom: 8 }}>
                Criar conta
              </h1>
              <p style={{ fontSize: 14, color: '#64748b' }}>Preencha os dados para começar</p>
            </div>

            {/* Provider cards */}
            <div className="reg-fadein-1 grid grid-cols-4 gap-2">
              {[
                { label: 'AWS',   img: '/aws.png',           bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
                { label: 'Azure', img: '/azure.png',         bg: 'rgba(56,189,248,0.08)', border: 'rgba(56,189,248,0.25)' },
                { label: 'GCP',   img: '/google-cloud.png',  bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)' },
                { label: 'M365',  img: '/microsoft-365.png', bg: 'rgba(147,112,219,0.08)', border: 'rgba(147,112,219,0.25)' },
              ].map(({ label, img, bg, border }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl"
                  style={{ background: bg, border: `1px solid ${border}` }}
                >
                  <img src={img} alt={label} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.3px' }}>{label}</span>
                </div>
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
            <form onSubmit={handleSubmit} className="reg-fadein-2 flex flex-col gap-3.5">

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Nome
                </label>
                <div className="relative">
                  <User style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    name="name"
                    required
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Seu nome"
                    className="reg-input"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Email
                </label>
                <div className="relative">
                  <Mail style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="seu@email.com"
                    className="reg-input"
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
                    name="password"
                    required
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Mín. 8 chars, maiúscula, número, símbolo"
                    className="reg-input"
                    style={{ ...inputStyle, paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
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

              {/* Confirm Password */}
              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Confirmar senha
                </label>
                <div className="relative">
                  <Lock style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    name="confirm"
                    required
                    value={form.confirm}
                    onChange={handleChange}
                    placeholder="Repita a senha"
                    className="reg-input"
                    style={{ ...inputStyle, paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Ocultar senha' : 'Mostrar senha'}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                      padding: 4, display: 'flex', alignItems: 'center', transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#e2e8f0'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                  >
                    {showConfirm ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="reg-fadein-3 reg-btn-primary w-full flex items-center justify-center gap-2 mt-1"
                style={{
                  padding: '13px', borderRadius: 10, border: 'none',
                  color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                }}
              >
                {loading ? (
                  <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                ) : (
                  <UserPlus style={{ width: 16, height: 16 }} />
                )}
                {loading ? 'Criando conta...' : 'Criar conta'}
              </button>
            </form>

            {/* Divider */}
            <div className="reg-fadein-4 flex items-center gap-3">
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>ou continue com</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            </div>

            {/* OAuth */}
            <div className="reg-fadein-5">
              <OAuthButtons />
            </div>

            {/* Footer */}
            <p className="reg-fadein-6 text-center" style={{ fontSize: 13, color: '#64748b' }}>
              Já tem uma conta?{' '}
              <Link to="/login" style={{ color: '#38bdf8', fontWeight: 500, textDecoration: 'none' }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                Entrar
              </Link>
            </p>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div
          className="hidden lg:flex flex-1 relative items-center justify-center z-10 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #07090f 0%, #0d1117 55%, #07090f 100%)' }}
        >
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

export default Register;
