import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import authService from '../services/authService';
import AuthLayout, { FormLogo, Spinner, inputStyle, iconStyle } from '../components/auth/AuthLayout';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword]         = useState('');
  const [confirm, setConfirm]           = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState(false);

  useEffect(() => {
    if (!token) navigate('/login', { replace: true });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    if (password.length < 8)  { setError('A senha deve ter pelo menos 8 caracteres.'); return; }
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

  const EyeBtn = ({ show, toggle }) => (
    <button
      type="button" onClick={toggle}
      style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer',
        padding: 4, display: 'flex', alignItems: 'center',
      }}
    >
      {show ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
    </button>
  );

  return (
    <AuthLayout>
      <FormLogo />

      {success ? (
        <div className="af1 flex flex-col items-center gap-5 text-center">
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: '#f0fdf4', border: '1.5px solid #bbf7d0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle style={{ width: 30, height: 30, color: '#16a34a' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 8, letterSpacing: '-0.3px' }}>
              Senha redefinida!
            </h1>
            <p style={{ fontSize: 13, color: '#6b7280' }}>Sua senha foi alterada com sucesso.</p>
          </div>
          <Link
            to="/login"
            className="auth-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '12px 32px', textDecoration: 'none',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14,
              fontFamily: "'Plus Jakarta Sans', system-ui",
            }}
          >
            Ir para o login
          </Link>
        </div>
      ) : (
        <>
          <div className="af1 flex flex-col items-center text-center mb-7">
            <div style={{
              width: 60, height: 60, borderRadius: 16, marginBottom: 16,
              background: '#eff6ff', border: '1.5px solid #bfdbfe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Lock style={{ width: 28, height: 28, color: '#2563eb' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6, letterSpacing: '-0.3px' }}>
              Nova senha
            </h1>
            <p style={{ fontSize: 13, color: '#6b7280' }}>
              Crie uma senha forte com pelo menos 8 caracteres.
            </p>
          </div>

          {error && (
            <div className="auth-error af2 mb-4 flex items-center gap-2">
              <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="af2 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Nova senha
              </label>
              <div className="relative">
                <Lock style={iconStyle} />
                <input
                  type={showPassword ? 'text' : 'password'} required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="auth-input"
                  style={{ ...inputStyle, paddingRight: 42 }}
                />
                <EyeBtn show={showPassword} toggle={() => setShowPassword(v => !v)} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Confirmar senha
              </label>
              <div className="relative">
                <Lock style={iconStyle} />
                <input
                  type={showConfirm ? 'text' : 'password'} required
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="auth-input"
                  style={{ ...inputStyle, paddingRight: 42 }}
                />
                <EyeBtn show={showConfirm} toggle={() => setShowConfirm(v => !v)} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="auth-btn mt-1">
              {loading ? <Spinner /> : <Lock style={{ width: 16, height: 16 }} />}
              {loading ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </form>

          <div className="flex justify-center mt-5">
            <Link to="/login" className="auth-link flex items-center gap-1.5" style={{ fontSize: 13 }}>
              <ArrowLeft style={{ width: 13, height: 13 }} />
              Voltar ao login
            </Link>
          </div>
        </>
      )}
    </AuthLayout>
  );
};

export default ResetPassword;
