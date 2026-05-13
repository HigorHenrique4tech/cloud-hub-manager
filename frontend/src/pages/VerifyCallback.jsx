import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';

const VerifyCallback = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [status, setStatus]   = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      try {
        const data = await authService.verifyEmail(token);
        setStatus('success');
        setMessage(data.detail);
        if (user) setUser({ ...user, is_verified: true });
        setTimeout(() => {
          navigate(data.already_verified ? '/' : '/select-plan');
        }, 2000);
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.detail || 'Token inválido ou expirado');
      }
    };
    verify();
  }, [token]);

  const iconBox = (color, bg, border) => ({
    width: 72, height: 72, borderRadius: '50%',
    background: bg, border: `2px solid ${border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 20px',
    color,
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #e8f0fe 0%, #dce8fb 50%, #e0eaf7 100%)' }}
    >
      <div
        className="w-full max-w-sm text-center"
        style={{
          background: '#fff', borderRadius: 20, padding: '40px 32px',
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

        {status === 'loading' && (
          <>
            <div style={{ ...iconBox('#2563eb', '#eff6ff', '#bfdbfe') }}>
              <Loader2 style={{ width: 32, height: 32, animation: 'spin .9s linear infinite' }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
              Verificando email...
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af' }}>Aguarde um momento</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ ...iconBox('#16a34a', '#f0fdf4', '#bbf7d0') }}>
              <CheckCircle2 style={{ width: 32, height: 32 }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{message}</h2>
            <p style={{ fontSize: 13, color: '#9ca3af' }}>Redirecionando...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ ...iconBox('#dc2626', '#fef2f2', '#fecaca') }}>
              <XCircle style={{ width: 32, height: 32 }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
              Falha na verificação
            </h2>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>{message}</p>
            <div className="flex items-center justify-center gap-3">
              <Link
                to="/login"
                style={{
                  padding: '9px 20px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                  color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13,
                  textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', system-ui",
                }}
              >
                Ir para login
              </Link>
              <Link
                to="/register"
                style={{
                  padding: '9px 20px', background: '#f9fafb',
                  border: '1px solid #e5e7eb', color: '#374151',
                  borderRadius: 10, fontWeight: 600, fontSize: 13, textDecoration: 'none',
                }}
              >
                Criar conta
              </Link>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

export default VerifyCallback;
