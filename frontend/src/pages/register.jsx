import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Lock, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OAuthButtons from '../components/auth/OAuthButtons';
import AuthLayout, { FormLogo, Spinner, inputStyle, iconStyle } from '../components/auth/AuthLayout';

const Register = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm)         { setError('As senhas não coincidem'); return; }
    if (form.password.length < 8)               { setError('A senha deve ter pelo menos 8 caracteres'); return; }
    if (form.password.length > 72)              { setError('A senha deve ter no máximo 72 caracteres'); return; }
    if (!/[a-z]/.test(form.password))           { setError('A senha deve conter pelo menos uma letra minúscula'); return; }
    if (!/[A-Z]/.test(form.password))           { setError('A senha deve conter pelo menos uma letra maiúscula'); return; }
    if (!/\d/.test(form.password))              { setError('A senha deve conter pelo menos um número'); return; }
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+[\]\\;'`~/]/.test(form.password)) {
      setError('A senha deve conter pelo menos um caractere especial (!@#$%...)');
      return;
    }
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

  const Label = ({ children }) => (
    <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
      {children}
    </label>
  );

  return (
    <AuthLayout subtitle="Crie sua conta e gerencie toda sua infraestrutura multi-cloud em um único lugar.">
      <FormLogo />

      <div className="af1 mb-7">
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px', marginBottom: 6 }}>
          Criar conta
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>Preencha os dados para começar</p>
      </div>

      {error && <div className="auth-error af2 mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="af2 flex flex-col gap-3.5">

        <div className="flex flex-col gap-1.5">
          <Label>Nome</Label>
          <div className="relative">
            <User style={iconStyle} />
            <input
              type="text" name="name" required
              value={form.name} onChange={handleChange}
              placeholder="Seu nome"
              className="auth-input"
              style={inputStyle}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Email</Label>
          <div className="relative">
            <Mail style={iconStyle} />
            <input
              type="email" name="email" required
              value={form.email} onChange={handleChange}
              placeholder="seu@email.com"
              className="auth-input"
              style={inputStyle}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Senha</Label>
          <div className="relative">
            <Lock style={iconStyle} />
            <input
              type={showPassword ? 'text' : 'password'} name="password" required
              value={form.password} onChange={handleChange}
              placeholder="Mín. 8 chars, maiúscula, número, símbolo"
              className="auth-input"
              style={{ ...inputStyle, paddingRight: 42 }}
            />
            <EyeBtn show={showPassword} toggle={() => setShowPassword(v => !v)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Confirmar senha</Label>
          <div className="relative">
            <Lock style={iconStyle} />
            <input
              type={showConfirm ? 'text' : 'password'} name="confirm" required
              value={form.confirm} onChange={handleChange}
              placeholder="Repita a senha"
              className="auth-input"
              style={{ ...inputStyle, paddingRight: 42 }}
            />
            <EyeBtn show={showConfirm} toggle={() => setShowConfirm(v => !v)} />
          </div>
        </div>

        <button type="submit" disabled={loading} className="auth-btn af3 mt-1">
          {loading ? <Spinner /> : <UserPlus style={{ width: 16, height: 16 }} />}
          {loading ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>

      <div className="af4">
        <OAuthButtons />
      </div>

      <p className="af5 text-center mt-4" style={{ fontSize: 13, color: '#6b7280' }}>
        Já tem uma conta?{' '}
        <Link to="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
};

export default Register;
