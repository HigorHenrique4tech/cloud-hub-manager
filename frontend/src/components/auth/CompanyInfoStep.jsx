import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Phone, FileText, User, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/authService';
import TermsModal from './TermsModal';
import AuthLayout, { FormLogo, Spinner, inputStyle, iconStyle } from './AuthLayout';

const formatCnpj = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
};

const formatPhone = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};

const Label = ({ children }) => (
  <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
    {children}
  </label>
);

export default function CompanyInfoStep() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: user?.name || '',
    company_name: '',
    cnpj: '',
    phone: '',
  });
  const [cnpjStatus, setCnpjStatus] = useState(null); // null | 'loading' | 'valid' | 'invalid'
  const [cnpjData, setCnpjData]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [showTerms, setShowTerms]   = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'cnpj') {
      setForm((p) => ({ ...p, cnpj: formatCnpj(value) }));
      setCnpjStatus(null);
      setCnpjData(null);
    } else if (name === 'phone') {
      setForm((p) => ({ ...p, phone: formatPhone(value) }));
    } else {
      setForm((p) => ({ ...p, [name]: value }));
    }
  };

  const handleValidateCnpj = async () => {
    const digits = form.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;
    setCnpjStatus('loading');
    try {
      const data = await authService.validateCnpj(digits);
      setCnpjData(data);
      setCnpjStatus('valid');
      if (data.razao_social && !form.company_name) {
        setForm((p) => ({ ...p, company_name: data.nome_fantasia || data.razao_social }));
      }
    } catch {
      setCnpjStatus('invalid');
      setCnpjData(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_name.trim()) { setError('O nome da empresa é obrigatório'); return; }
    setPendingSubmit({
      name: form.name || undefined,
      company_name: form.company_name,
      cnpj: form.cnpj.replace(/\D/g, '') || undefined,
      phone: form.phone || undefined,
    });
    setShowTerms(true);
  };

  const handleTermsAccept = async () => {
    setLoading(true);
    setError('');
    try {
      await authService.acceptTerms();
      const updated = await authService.updateCompanyInfo(pendingSubmit);
      if (setUser) setUser({ ...updated, terms_accepted: true });
      navigate('/select-plan', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao salvar informações');
      setShowTerms(false);
    } finally {
      setLoading(false);
    }
  };

  const handleTermsDecline = () => {
    setShowTerms(false);
    setPendingSubmit(null);
  };

  const cnpjDigits = form.cnpj.replace(/\D/g, '');
  const canValidate = cnpjDigits.length === 14 && cnpjStatus !== 'loading';

  return (
    <>
      {showTerms && (
        <TermsModal
          onAccept={handleTermsAccept}
          onDecline={handleTermsDecline}
          loading={loading}
        />
      )}
      <AuthLayout subtitle="Precisamos de alguns dados para personalizar sua experiência.">
        <FormLogo />

        <div className="af1 mb-7">
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px', marginBottom: 6 }}>
            Informações da empresa
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>Preencha os dados para continuar</p>
        </div>

        {error && <div className="auth-error af2 mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="af2 flex flex-col gap-3.5">

          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <Label>Seu nome</Label>
            <div className="relative">
              <User style={iconStyle} />
              <input
                type="text" name="name"
                value={form.name} onChange={handleChange}
                placeholder="Nome completo"
                className="auth-input"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Empresa */}
          <div className="flex flex-col gap-1.5">
            <Label>Empresa <span style={{ color: '#ef4444' }}>*</span></Label>
            <div className="relative">
              <Building2 style={iconStyle} />
              <input
                type="text" name="company_name" required
                value={form.company_name} onChange={handleChange}
                placeholder="Nome da empresa"
                className="auth-input"
                style={inputStyle}
              />
            </div>
          </div>

          {/* CNPJ */}
          <div className="flex flex-col gap-1.5">
            <Label>CNPJ</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <FileText style={iconStyle} />
                <input
                  type="text" name="cnpj"
                  value={form.cnpj} onChange={handleChange}
                  placeholder="00.000.000/0000-00"
                  className="auth-input"
                  style={{ ...inputStyle, paddingRight: cnpjStatus ? 36 : 14 }}
                  inputMode="numeric"
                />
                {cnpjStatus === 'valid' && (
                  <CheckCircle2 style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#16a34a', pointerEvents: 'none' }} />
                )}
                {cnpjStatus === 'invalid' && (
                  <XCircle style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#dc2626', pointerEvents: 'none' }} />
                )}
                {cnpjStatus === 'loading' && (
                  <span style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    width: 16, height: 16,
                    border: '2px solid #e5e7eb', borderTopColor: '#2563eb',
                    borderRadius: '50%', animation: 'spin .7s linear infinite',
                    display: 'inline-block', pointerEvents: 'none',
                  }} />
                )}
              </div>
              <button
                type="button"
                onClick={handleValidateCnpj}
                disabled={!canValidate}
                style={{
                  padding: '0 16px', borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  background: canValidate ? '#eff6ff' : '#f9fafb',
                  color: canValidate ? '#2563eb' : '#9ca3af',
                  fontSize: 13, fontWeight: 600,
                  cursor: canValidate ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap', transition: 'all 0.2s',
                  fontFamily: 'inherit',
                }}
              >
                Validar
              </button>
            </div>
            {cnpjStatus === 'valid' && cnpjData && (
              <p style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>
                ✓ {cnpjData.razao_social} — {cnpjData.situacao_cadastral}
              </p>
            )}
            {cnpjStatus === 'invalid' && (
              <p style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>CNPJ não encontrado ou inválido</p>
            )}
          </div>

          {/* Telefone */}
          <div className="flex flex-col gap-1.5">
            <Label>Telefone</Label>
            <div className="relative">
              <Phone style={iconStyle} />
              <input
                type="tel" name="phone"
                value={form.phone} onChange={handleChange}
                placeholder="(00) 00000-0000"
                className="auth-input"
                style={inputStyle}
                inputMode="numeric"
              />
            </div>
          </div>

          {/* Submit */}
          <button type="submit" disabled={loading} className="auth-btn af3 mt-1">
            {loading ? <Spinner /> : <ArrowRight style={{ width: 16, height: 16 }} />}
            {loading ? 'Salvando...' : 'Continuar'}
          </button>

          {/* Skip */}
          <button
            type="button"
            onClick={() => navigate('/select-plan', { replace: true })}
            className="auth-link af4"
            style={{ textAlign: 'center', paddingTop: 2 }}
          >
            Pular por agora
          </button>
        </form>
      </AuthLayout>
    </>
  );
}
