import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import authService from '../services/authService';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword]           = useState('');
  const [confirm, setConfirm]             = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState(false);

  useEffect(() => {
    if (!token) navigate('/login', { replace: true });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Token inválido ou expirado. Solicite um novo link.');
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
        .rp-page { font-family: 'DM Sans', system-ui, sans-serif; }
        .rp-page h1 { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        .rp-input:focus {
          border-color: rgba(56,189,248,0.5) !important;
          background: rgba(56,189,248,0.03) !important;
          box-shadow: 0 0 0 3px rgba(56,189,248,0.08) !important;
        }
        .rp-input::placeholder { color: #334155; }
        .rp-btn {
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          box-shadow: 0 4px 20px rgba(14,165,233,0.25);
          transition: opacity 0.2s, transform 0.15s;
        }
        .rp-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .rp-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      `}</style>

      <div className="rp-page min-h-screen flex items-center justify-center" style={{ background: '#07090f', color: '#e2e8f0' }}>
        <div style={{
          width: '100%', maxWidth: 400, margin: '0 auto', padding: '0 20px',
        }}>
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div style={{
              width: 44, height: 44, flexShrink: 0,
              background: 'linear-gradient(135deg, #1e3a5f, #0c1e33)',
              border: '1px solid rgba(56,189,248,0.3)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 24px rgba(56,189,248,0.2)',
            }}>
              <img src="/logo.png" alt="CloudAtlas" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            </div>
            <span style={{ fontFamily: "'Plus Jakarta Sans', system-ui", fontWeight: 800, fontSize: 26, color: '#f1f5f9' }}>
              CloudAtlas
            </span>
          </div>

          <div style={{
            background: 'rgba(13,17,23,0.93)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16,
            padding: '32px 28px',
          }}>
            {success ? (
              <div className="flex flex-col items-center gap-5 text-center">
                <div style={{
                  width: 60, height: 60, borderRadius: 16,
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CheckCircle style={{ width: 28, height: 28, color: '#4ade80' }} />
                </div>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', marginBottom: 8 }}>Senha redefinida!</h1>
                  <p style={{ fontSize: 13, color: '#64748b' }}>Sua senha foi alterada com sucesso.</p>
                </div>
                <Link
                  to="/login"
                  style={{
                    display: 'inline-block', padding: '12px 32px',
                    background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                    color: '#fff', textDecoration: 'none', borderRadius: 10,
                    fontWeight: 600, fontSize: 14,
                  }}
                >
                  Ir para o login
                </Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div style={{
                    width: 56, height: 56, borderRadius: 14, margin: '0 auto 14px',
                    background: 'rgba(56,189,248,0.08)',
                    border: '1px solid rgba(56,189,248,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Lock style={{ width: 26, height: 26, color: '#38bdf8' }} />
                  </div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', marginBottom: 6 }}>Nova senha</h1>
                  <p style={{ fontSize: 13, color: '#64748b' }}>Crie uma senha forte com pelo menos 8 caracteres.</p>
                </div>

                {error && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#fca5a5',
                  }}>
                    <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      Nova senha
                    </label>
                    <div className="relative">
                      <Lock style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className="rp-input"
                        style={{ ...inputStyle, paddingRight: 42 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                      >
                        {showPassword ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      Confirmar senha
                    </label>
                    <div className="relative">
                      <Lock style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        required
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Repita a nova senha"
                        className="rp-input"
                        style={{ ...inputStyle, paddingRight: 42 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                      >
                        {showConfirm ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="rp-btn w-full flex items-center justify-center gap-2 mt-1"
                    style={{
                      padding: '13px', borderRadius: 10, border: 'none',
                      color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    }}
                  >
                    {loading ? (
                      <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                    ) : (
                      <Lock style={{ width: 16, height: 16 }} />
                    )}
                    {loading ? 'Salvando...' : 'Redefinir senha'}
                  </button>
                </form>

                <p className="text-center mt-4" style={{ fontSize: 13, color: '#64748b' }}>
                  <Link to="/login" style={{ color: '#38bdf8', fontWeight: 500, textDecoration: 'none' }}
                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                  >
                    Voltar ao login
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ResetPassword;
