import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, LogIn, Eye, EyeOff, ShieldCheck, ArrowLeft, RefreshCw, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAccessToken } from '../services/api';
import authService from '../services/authService';
import OAuthButtons from '../components/auth/OAuthButtons';
import AuthLayout, { FormLogo, Spinner, inputStyle, iconStyle } from '../components/auth/AuthLayout';

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
  const cooldownRef = useRef(null);
  const otpInputRef = useRef(null);

  const [forgotEmail, setForgotEmail]     = useState('');
  const [forgotError, setForgotError]     = useState('');
  const [forgotSent, setForgotSent]       = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const { login, loginWithTokens, user, loading: authLoading } = useAuth();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken    = searchParams.get('invite');
  const redirectParam  = searchParams.get('redirect');
  const DESK_URL       = 'https://desk.cloudatlas.app.br';

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (redirectParam === 'desk') {
      const t = getAccessToken() || '';
      window.location.replace(`${DESK_URL}/auth/callback?token=${t}`);
    } else {
      navigate(inviteToken ? `/invite/${inviteToken}` : '/', { replace: true });
    }
  }, [authLoading, user]);

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
      } else if (redirectParam === 'desk') {
        window.location.href = `${DESK_URL}/auth/callback?token=${data.access_token}&refresh=${data.refresh_token || ''}`;
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
      if (redirectParam === 'desk') {
        window.location.href = `${DESK_URL}/auth/callback?token=${data.access_token}&refresh=${data.refresh_token || ''}`;
        return;
      }
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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotLoading(true);
    try {
      await authService.forgotPassword(forgotEmail);
      setForgotSent(true);
    } catch (err) {
      setForgotError(err.response?.data?.detail || 'Erro ao enviar email. Tente novamente.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleBackFromForgot = () => {
    setStep('credentials');
    setForgotEmail('');
    setForgotError('');
    setForgotSent(false);
  };

  /* ── Icon button (show/hide password) ── */
  const EyeBtn = ({ show, toggle }) => (
    <button
      type="button"
      onClick={toggle}
      style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer',
        padding: 4, display: 'flex', alignItems: 'center',
      }}
    >
      {show ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
    </button>
  );

  const Label = ({ children }) => (
    <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
      {children}
    </label>
  );

  return (
    <AuthLayout>
      <FormLogo />

      {/* ── Credentials step ── */}
      {step === 'credentials' && (
        <>
          <div className="af1 mb-7">
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px', marginBottom: 6 }}>
              Bem-vindo de volta
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280' }}>Entre com suas credenciais para continuar</p>
          </div>

          {error && <div className="auth-error af2 mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="af2 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <div className="relative">
                <Mail style={iconStyle} />
                <input
                  type="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="auth-input"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Senha</Label>
                <button
                  type="button"
                  className="auth-link"
                  style={{ fontSize: 12 }}
                  onClick={() => { setStep('forgot'); setForgotEmail(email); }}
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Lock style={iconStyle} />
                <input
                  type={showPassword ? 'text' : 'password'} required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="auth-input auth-input-pr"
                  style={{ ...inputStyle, paddingRight: 42 }}
                />
                <EyeBtn show={showPassword} toggle={() => setShowPassword(v => !v)} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="auth-btn af3 mt-1">
              {loading ? <Spinner /> : <LogIn style={{ width: 16, height: 16 }} />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="af4">
            <OAuthButtons redirectTarget={redirectParam} />
          </div>

          <p className="af5 text-center mt-4" style={{ fontSize: 13, color: '#6b7280' }}>
            Não tem uma conta?{' '}
            <Link to="/register" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
              Criar conta
            </Link>
          </p>
        </>
      )}

      {/* ── OTP / MFA step ── */}
      {step === 'otp' && (
        <>
          <div className="af1 flex flex-col items-center text-center mb-6">
            <div style={{
              width: 60, height: 60, borderRadius: 16, marginBottom: 16,
              background: '#eff6ff', border: '1.5px solid #bfdbfe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldCheck style={{ width: 28, height: 28, color: '#2563eb' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6, letterSpacing: '-0.3px' }}>
              Verificação em dois fatores
            </h1>
            <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
              Enviamos um código de 6 dígitos para<br />
              <span style={{ fontWeight: 600, color: '#374151' }}>{email}</span>
            </p>
          </div>

          {otpError && <div className="auth-error af2 mb-4 text-center">{otpError}</div>}

          <form onSubmit={handleVerifyOTP} className="af2 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase', textAlign: 'center' }}>
                Código de verificação
              </label>
              <input
                ref={otpInputRef}
                type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="auth-input auth-input-mono"
                style={{ ...inputStyle, paddingLeft: 14, fontFamily: 'monospace', fontSize: 22, textAlign: 'center', letterSpacing: '0.45em' }}
              />
            </div>

            <button type="submit" disabled={loading || otp.length !== 6} className="auth-btn">
              {loading ? <Spinner /> : <ShieldCheck style={{ width: 16, height: 16 }} />}
              {loading ? 'Verificando...' : 'Verificar'}
            </button>
          </form>

          <div className="flex flex-col items-center gap-3 mt-5">
            <button
              type="button"
              className="auth-link flex items-center gap-1.5"
              disabled={resendCooldown > 0}
              onClick={handleResend}
              style={{ opacity: resendCooldown > 0 ? 0.5 : 1, cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer' }}
            >
              <RefreshCw style={{ width: 13, height: 13 }} />
              {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
            </button>
            <button type="button" className="auth-link flex items-center gap-1.5" onClick={handleBack}>
              <ArrowLeft style={{ width: 13, height: 13 }} />
              Voltar
            </button>
          </div>
        </>
      )}

      {/* ── Forgot password step ── */}
      {step === 'forgot' && (
        <>
          <div className="af1 flex flex-col items-center text-center mb-6">
            <div style={{
              width: 60, height: 60, borderRadius: 16, marginBottom: 16,
              background: '#eff6ff', border: '1.5px solid #bfdbfe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mail style={{ width: 28, height: 28, color: '#2563eb' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6, letterSpacing: '-0.3px' }}>
              Redefinir senha
            </h1>
            <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
              {forgotSent
                ? 'Verifique seu email para continuar.'
                : 'Informe seu email e enviaremos um link para redefinir sua senha.'}
            </p>
          </div>

          {forgotSent ? (
            <div className="af2 flex flex-col items-center gap-5">
              <div className="auth-success-box w-full">
                <CheckCircle style={{ width: 18, height: 18, flexShrink: 0 }} />
                Email enviado! Verifique sua caixa de entrada e o spam.
              </div>
              <button type="button" className="auth-link flex items-center gap-1.5" onClick={handleBackFromForgot}>
                <ArrowLeft style={{ width: 13, height: 13 }} />
                Voltar ao login
              </button>
            </div>
          ) : (
            <>
              {forgotError && <div className="auth-error af2 mb-4">{forgotError}</div>}
              <form onSubmit={handleForgotPassword} className="af2 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    Email
                  </label>
                  <div className="relative">
                    <Mail style={iconStyle} />
                    <input
                      type="email" required
                      value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="auth-input"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <button type="submit" disabled={forgotLoading} className="auth-btn">
                  {forgotLoading ? <Spinner /> : <Mail style={{ width: 16, height: 16 }} />}
                  {forgotLoading ? 'Enviando...' : 'Enviar link de redefinição'}
                </button>
              </form>
              <div className="flex justify-center mt-4">
                <button type="button" className="auth-link flex items-center gap-1.5" onClick={handleBackFromForgot}>
                  <ArrowLeft style={{ width: 13, height: 13 }} />
                  Voltar ao login
                </button>
              </div>
            </>
          )}
        </>
      )}
    </AuthLayout>
  );
};

export default Login;
