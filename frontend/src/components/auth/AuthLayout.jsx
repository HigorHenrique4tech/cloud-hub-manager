/**
 * Shared split-screen layout for all auth pages.
 * Left: light-gradient illustration panel (hidden on mobile).
 * Right: white form panel — renders {children}.
 */

const PROVIDERS = [
  { label: 'AWS',   color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  { label: 'Azure', color: '#0284c7', bg: '#eff6ff', border: '#bfdbfe' },
  { label: 'GCP',   color: '#dc2626', bg: '#fff1f2', border: '#fecaca' },
  { label: 'M365',  color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
];

/* ── Light cloud network illustration ────────────────────────────── */
const LightCloudSVG = () => (
  <svg viewBox="0 0 800 760" className="w-full" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="la-hub" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#2563eb" stopOpacity="0.14" />
        <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
      </radialGradient>
      <filter id="la-soft" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="4" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <style>{`
        @keyframes la-f1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes la-f2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(14px)} }
        @keyframes la-f3 { 0%,100%{transform:translateY(0)} 50%{transform:translateX(10px) translateY(-10px)} }
        @keyframes la-f4 { 0%,100%{transform:translateY(0)} 50%{transform:translateX(-10px) translateY(10px)} }
        @keyframes la-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes la-flow { 0%{stroke-dashoffset:200;opacity:0} 15%{opacity:.8} 85%{opacity:.8} 100%{stroke-dashoffset:0;opacity:0} }
        @keyframes la-flowr { 0%{stroke-dashoffset:0;opacity:0} 15%{opacity:.8} 85%{opacity:.8} 100%{stroke-dashoffset:200;opacity:0} }
        .la-hub { animation: la-f1 7s ease-in-out infinite; transform-origin: 400px 370px; }
        .la-aws { animation: la-f2 8s ease-in-out infinite .5s; transform-origin: 195px 240px; }
        .la-az  { animation: la-f3 7.5s ease-in-out infinite 1s; transform-origin: 605px 240px; }
        .la-gcp { animation: la-f4 9s ease-in-out infinite 1.5s; transform-origin: 400px 620px; }
        .la-k8s { animation: la-f1 6s ease-in-out infinite .2s; transform-origin: 140px 490px; }
        .la-db  { animation: la-f3 6.5s ease-in-out infinite .8s; transform-origin: 660px 490px; }
        .la-api { animation: la-f2 7s ease-in-out infinite 1.2s; transform-origin: 400px 120px; }
        .la-r1  { animation: la-spin 38s linear infinite; transform-origin: 400px 370px; }
        .la-c   { stroke-dasharray: 10 15; animation: la-flow 3s linear infinite; }
        .la-cr  { stroke-dasharray: 10 15; animation: la-flowr 3s linear infinite; }
        .la-cf  { stroke-dasharray: 12 18; animation: la-flow 2.2s linear infinite; }
      `}</style>
    </defs>

    {/* Outer dashed ring */}
    <circle cx="400" cy="370" r="270" fill="none" stroke="rgba(37,99,235,0.09)" strokeWidth="1.5" strokeDasharray="8 18" />

    {/* Animated inner ring arc */}
    <g className="la-r1">
      <circle cx="400" cy="370" r="170" fill="none" stroke="rgba(37,99,235,0.14)" strokeWidth="1" strokeDasharray="65 250" />
      <circle cx="230" cy="370" r="5" fill="#93c5fd" />
    </g>

    {/* Hub glow */}
    <circle cx="400" cy="370" r="95" fill="url(#la-hub)" />

    {/* ── Base connection lines (light gray) ── */}
    <path d="M400 370 Q 297 305 195 240" fill="none" stroke="#e2e8f0" strokeWidth="2" />
    <path d="M400 370 Q 503 305 605 240" fill="none" stroke="#e2e8f0" strokeWidth="2" />
    <path d="M400 370 Q 400 495 400 620" fill="none" stroke="#e2e8f0" strokeWidth="2" />
    <line x1="195" y1="240" x2="140" y2="490" stroke="#e2e8f0" strokeWidth="1.5" />
    <line x1="605" y1="240" x2="660" y2="490" stroke="#e2e8f0" strokeWidth="1.5" />
    <line x1="195" y1="240" x2="400" y2="120" stroke="#e2e8f0" strokeWidth="1.5" />
    <line x1="605" y1="240" x2="400" y2="120" stroke="#e2e8f0" strokeWidth="1.5" />

    {/* ── Animated data flow ── */}
    <path className="la-c"  d="M400 370 Q 297 305 195 240" fill="none" stroke="#f97316" strokeWidth="2.5" />
    <path className="la-cf" d="M400 370 Q 503 305 605 240" fill="none" stroke="#0ea5e9" strokeWidth="2.5" />
    <path className="la-c"  d="M400 370 Q 400 495 400 620" fill="none" stroke="#ef4444" strokeWidth="2.5" />
    <line className="la-cr" x1="195" y1="240" x2="140" y2="490" stroke="#8b5cf6" strokeWidth="1.5" />
    <line className="la-cf" x1="605" y1="240" x2="660" y2="490" stroke="#8b5cf6" strokeWidth="1.5" />

    {/* ── Sub-nodes ── */}
    <g className="la-k8s">
      <circle cx="140" cy="490" r="27" fill="#faf5ff" stroke="#8b5cf6" strokeWidth="2" filter="url(#la-soft)" />
      <text x="140" y="492" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#7c3aed" fontWeight="700">K8s</text>
    </g>
    <g className="la-db">
      <circle cx="660" cy="490" r="27" fill="#faf5ff" stroke="#8b5cf6" strokeWidth="2" filter="url(#la-soft)" />
      <text x="660" y="492" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#7c3aed" fontWeight="700">DB</text>
    </g>
    <g className="la-api">
      <circle cx="400" cy="120" r="27" fill="#faf5ff" stroke="#8b5cf6" strokeWidth="2" filter="url(#la-soft)" />
      <text x="400" y="122" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#7c3aed" fontWeight="700">API</text>
    </g>

    {/* ── Provider nodes ── */}
    <g className="la-aws">
      <circle cx="195" cy="240" r="54" fill="#fff7ed" stroke="#fb923c" strokeWidth="2.5" filter="url(#la-soft)" />
      <text x="195" y="234" textAnchor="middle" dominantBaseline="middle" fontSize="19" fontWeight="900" fill="#ea580c" letterSpacing=".5">AWS</text>
      <text x="195" y="252" textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#9ca3af">us-east-1</text>
    </g>
    <g className="la-az">
      <circle cx="605" cy="240" r="54" fill="#eff6ff" stroke="#38bdf8" strokeWidth="2.5" filter="url(#la-soft)" />
      <text x="605" y="234" textAnchor="middle" dominantBaseline="middle" fontSize="18" fontWeight="900" fill="#0284c7" letterSpacing=".5">Azure</text>
      <text x="605" y="252" textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#9ca3af">eastus</text>
    </g>
    <g className="la-gcp">
      <circle cx="400" cy="620" r="54" fill="#fff1f2" stroke="#f87171" strokeWidth="2.5" filter="url(#la-soft)" />
      <text x="400" y="614" textAnchor="middle" dominantBaseline="middle" fontSize="19" fontWeight="900" fill="#dc2626" letterSpacing=".5">GCP</text>
      <text x="400" y="632" textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#9ca3af">us-central1</text>
    </g>

    {/* ── Central hub ── */}
    <g className="la-hub">
      <circle cx="400" cy="370" r="72" fill="#eff6ff" stroke="#2563eb" strokeWidth="3" filter="url(#la-soft)" />
      <circle cx="400" cy="370" r="56" fill="#dbeafe" />
      <path d="M400 336 L429 354 L429 390 L400 408 L371 390 L371 354 Z" fill="none" stroke="#3b82f6" strokeWidth="2" />
      <circle cx="400" cy="370" r="15" fill="#2563eb" />
      <circle cx="400" cy="370" r="7" fill="#fff" />
    </g>
  </svg>
);

/* ── Shared CSS (injected once when AuthLayout mounts) ──────────── */
const AUTH_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  .auth-page { font-family: 'DM Sans', system-ui, sans-serif; }
  .auth-page h1, .auth-page h2, .auth-logo-text {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  }

  .auth-input {
    width: 100%;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 11px 14px 11px 40px;
    font-size: 14px;
    color: #111827;
    outline: none;
    transition: border-color .2s, box-shadow .2s, background .2s;
    font-family: inherit;
  }
  .auth-input:focus {
    border-color: #2563eb !important;
    background: #fff !important;
    box-shadow: 0 0 0 3px rgba(37,99,235,.1) !important;
  }
  .auth-input::placeholder { color: #9ca3af; }
  .auth-input-noicon { padding-left: 14px; }
  .auth-input-mono {
    padding-left: 14px !important;
    font-family: 'Courier New', monospace;
    font-size: 22px;
    text-align: center;
    letter-spacing: .45em;
  }
  .auth-input-pr { padding-right: 42px; }

  .auth-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border-radius: 10px;
    border: none;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    box-shadow: 0 1px 3px rgba(0,0,0,.12);
    transition: opacity .2s, transform .15s, box-shadow .2s;
  }
  .auth-btn:hover:not(:disabled) {
    opacity: .92;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(37,99,235,.3);
  }
  .auth-btn:active:not(:disabled) { transform: scale(.98); }
  .auth-btn:disabled { opacity: .5; cursor: not-allowed; }

  .auth-link {
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    font-size: 12px;
    transition: color .2s;
    padding: 0;
  }
  .auth-link:hover { color: #2563eb; }

  .auth-error {
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
  }
  .auth-success-box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 10px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #16a34a;
    font-size: 13px;
  }

  @keyframes auth-fadeup {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

  .af0 { animation: auth-fadeup .5s .00s ease both; }
  .af1 { animation: auth-fadeup .5s .07s ease both; }
  .af2 { animation: auth-fadeup .5s .13s ease both; }
  .af3 { animation: auth-fadeup .5s .19s ease both; }
  .af4 { animation: auth-fadeup .5s .25s ease both; }
  .af5 { animation: auth-fadeup .5s .31s ease both; }
  .af6 { animation: auth-fadeup .5s .37s ease both; }
`;

/* ── Layout component ────────────────────────────────────────────── */
export default function AuthLayout({ children, subtitle }) {
  return (
    <>
      <style>{AUTH_STYLE}</style>

      <div className="auth-page min-h-screen flex" style={{ background: '#f1f5f9' }}>

        {/* ── LEFT: illustration panel (hidden on mobile) ── */}
        <div
          className="hidden lg:flex flex-1 flex-col items-center justify-center relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #e8f0fe 0%, #dce8fb 50%, #e0eaf7 100%)' }}
        >
          {/* Dot pattern overlay */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(37,99,235,0.055) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }} />

          <div className="relative z-10 flex flex-col items-center px-12" style={{ maxWidth: 580 }}>
            {/* SVG */}
            <LightCloudSVG />

            {/* Branding */}
            <div className="text-center mt-2">
              <h2 className="auth-logo-text" style={{ fontSize: 30, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px', marginBottom: 10 }}>
                Cloud<span style={{ color: '#2563eb' }}>Atlas</span>
              </h2>
              <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.7, maxWidth: 360 }}>
                {subtitle || 'Orquestre seus recursos multi-cloud com performance e facilidade.'}
              </p>
            </div>

            {/* Provider badges */}
            <div className="flex gap-2 mt-7 flex-wrap justify-center">
              {PROVIDERS.map(({ label, color, bg, border }) => (
                <span
                  key={label}
                  style={{
                    fontSize: 11, fontWeight: 700, color,
                    background: bg, border: `1px solid ${border}`,
                    borderRadius: 999, padding: '4px 12px',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: form panel ── */}
        <div
          className="flex flex-col w-full overflow-y-auto"
          style={{ background: '#ffffff', minHeight: '100dvh', maxWidth: '100%' }}
        >
          {/* Centering wrapper */}
          <div
            className="my-auto w-full px-7 py-10"
            style={{ maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}
          >
            {children}
          </div>
        </div>

      </div>
    </>
  );
}

/* ── Shared helpers exported for pages ──────────────────────────── */

export const Spinner = ({ size = 18 }) => (
  <span style={{
    width: size, height: size,
    border: '2px solid rgba(255,255,255,0.4)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin .7s linear infinite',
    display: 'inline-block',
    flexShrink: 0,
  }} />
);

export const FormLogo = () => (
  <div className="flex items-center gap-2.5 mb-8 af0">
    <div style={{
      width: 38, height: 38, flexShrink: 0,
      background: '#eff6ff',
      border: '1.5px solid #bfdbfe',
      borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <img src="/logo.png" alt="CloudAtlas" style={{ width: 26, height: 26, objectFit: 'contain' }} />
    </div>
    <span
      className="auth-logo-text"
      style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.3px' }}
    >
      Cloud<span style={{ color: '#2563eb' }}>Atlas</span>
    </span>
  </div>
);

export const inputStyle = {
  width: '100%',
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '11px 14px 11px 40px',
  fontSize: 14,
  color: '#111827',
  outline: 'none',
  transition: 'border-color .2s, box-shadow .2s, background .2s',
  fontFamily: 'inherit',
};

export const iconStyle = {
  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
  width: 15, height: 15, color: '#9ca3af', pointerEvents: 'none',
};
