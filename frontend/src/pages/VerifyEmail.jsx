import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';

const VerifyEmail = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [resending, setResending] = useState(false);
  const [resent, setResent]       = useState(false);

  const email = user?.email || searchParams.get('email') || '';

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    try {
      await authService.resendVerification(email);
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch {
      // silent
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #e8f0fe 0%, #dce8fb 50%, #e0eaf7 100%)' }}
    >
      <div
        className="w-full max-w-md text-center"
        style={{
          background: '#fff', borderRadius: 20, padding: '40px 36px',
          boxShadow: '0 4px 24px rgba(37,99,235,0.08), 0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div style={{
            width: 38, height: 38, background: '#eff6ff', border: '1.5px solid #bfdbfe',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src="/logo.png" alt="CloudAtlas" style={{ width: 26, height: 26, objectFit: 'contain' }} />
          </div>
          <span style={{ fontSize: 21, fontWeight: 800, color: '#111827', fontFamily: "'Plus Jakarta Sans', system-ui" }}>
            Cloud<span style={{ color: '#2563eb' }}>Atlas</span>
          </span>
        </div>

        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: '#eff6ff', border: '2px solid #bfdbfe',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <Mail style={{ width: 34, height: 34, color: '#2563eb' }} />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 10, fontFamily: "'Plus Jakarta Sans', system-ui" }}>
          Verifique seu email
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 6, lineHeight: 1.6 }}>
          Enviamos um link de confirmação para:
        </p>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{email}</p>
        <p style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.7, marginBottom: 24 }}>
          Clique no link enviado para o seu email para ativar sua conta.
          O link expira em 24 horas.
        </p>

        <button
          onClick={handleResend}
          disabled={resending || resent}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 20px',
            background: resent ? '#f0fdf4' : '#f9fafb',
            border: `1px solid ${resent ? '#bbf7d0' : '#e5e7eb'}`,
            color: resent ? '#16a34a' : '#374151',
            borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: resending || resent ? 'not-allowed' : 'pointer',
            opacity: resending ? 0.6 : 1, transition: 'all .2s',
          }}
        >
          {resent ? (
            <><CheckCircle2 style={{ width: 15, height: 15 }} /> Email reenviado!</>
          ) : resending ? (
            <><RefreshCw style={{ width: 15, height: 15, animation: 'spin .8s linear infinite' }} /> Reenviando...</>
          ) : (
            <><RefreshCw style={{ width: 15, height: 15 }} /> Reenviar email</>
          )}
        </button>

        <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af' }}>
          Email errado?{' '}
          <Link to="/register" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
            Criar nova conta
          </Link>
          {' · '}
          <Link to="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
            Entrar com outra conta
          </Link>
        </p>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

export default VerifyEmail;
