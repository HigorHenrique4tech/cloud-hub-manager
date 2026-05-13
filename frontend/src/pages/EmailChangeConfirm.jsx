import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import api, { clearAccessToken } from '../services/api';

export default function EmailChangeConfirm() {
  const { token } = useParams();
  const navigate = useNavigate();
  const calledRef = useRef(false);
  const [state, setState] = useState({ status: 'loading', message: '' });

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    api
      .post('/auth/email/confirm', { token })
      .then((resp) => {
        setState({
          status: 'success',
          message: resp.data?.detail || 'Email atualizado com sucesso. Faça login novamente.',
        });
        clearAccessToken();
      })
      .catch((err) => {
        setState({
          status: 'error',
          message: err.response?.data?.detail || 'Não foi possível confirmar a alteração de email.',
        });
      });
  }, [token]);

  const isSuccess = state.status === 'success';
  const isError   = state.status === 'error';

  const iconBox = (color, bg, border) => ({
    width: 64, height: 64, borderRadius: '50%',
    background: bg, border: `2px solid ${border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 16px', color,
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #e8f0fe 0%, #dce8fb 50%, #e0eaf7 100%)' }}
    >
      <div
        className="w-full max-w-sm text-center"
        style={{
          background: '#fff', borderRadius: 20, padding: '36px 28px',
          boxShadow: '0 4px 24px rgba(37,99,235,0.08), 0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-7">
          <div style={{
            width: 36, height: 36, background: '#eff6ff', border: '1.5px solid #bfdbfe',
            borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src="/logo.png" alt="CloudAtlas" style={{ width: 24, height: 24, objectFit: 'contain' }} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#111827', fontFamily: "'Plus Jakarta Sans', system-ui" }}>
            Cloud<span style={{ color: '#2563eb' }}>Atlas</span>
          </span>
        </div>

        {state.status === 'loading' && (
          <div style={{ ...iconBox('#2563eb', '#eff6ff', '#bfdbfe') }}>
            <Loader2 style={{ width: 28, height: 28, animation: 'spin .9s linear infinite' }} />
          </div>
        )}
        {isSuccess && (
          <div style={{ ...iconBox('#16a34a', '#f0fdf4', '#bbf7d0') }}>
            <CheckCircle2 style={{ width: 28, height: 28 }} />
          </div>
        )}
        {isError && (
          <div style={{ ...iconBox('#dc2626', '#fef2f2', '#fecaca') }}>
            <XCircle style={{ width: 28, height: 28 }} />
          </div>
        )}

        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8, fontFamily: "'Plus Jakarta Sans', system-ui" }}>
          {state.status === 'loading' && 'Confirmando alteração...'}
          {isSuccess && 'Email atualizado'}
          {isError && 'Falha ao confirmar'}
        </h1>

        {state.message && (
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>{state.message}</p>
        )}

        {(isSuccess || isError) && (
          <button
            onClick={() => navigate('/login', { replace: true })}
            style={{
              width: '100%', padding: '11px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', system-ui",
            }}
          >
            Ir para login
          </button>
        )}
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
