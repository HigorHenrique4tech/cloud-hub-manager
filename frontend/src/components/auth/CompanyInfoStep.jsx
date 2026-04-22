import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Phone, FileText, User, CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/authService';

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
  const [cnpjData, setCnpjData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    if (!form.company_name.trim()) {
      setError('O nome da empresa é obrigatório');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const updated = await authService.updateCompanyInfo({
        name: form.name || undefined,
        company_name: form.company_name,
        cnpj: form.cnpj.replace(/\D/g, '') || undefined,
        phone: form.phone || undefined,
      });
      if (setUser) setUser(updated);
      navigate('/select-plan', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao salvar informações');
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

  const cnpjDigits = form.cnpj.replace(/\D/g, '');
  const canValidate = cnpjDigits.length === 14 && cnpjStatus !== 'loading';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        .ci-page { font-family: 'DM Sans', system-ui, sans-serif; }
        .ci-page h1 { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        .ci-input:focus {
          border-color: rgba(56,189,248,0.5) !important;
          background: rgba(56,189,248,0.03) !important;
          box-shadow: 0 0 0 3px rgba(56,189,248,0.08) !important;
        }
        .ci-input::placeholder { color: #334155; }
        .ci-btn {
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          box-shadow: 0 4px 20px rgba(14,165,233,0.25);
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .ci-btn:hover:not(:disabled) {
          opacity: 0.9; transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(14,165,233,0.35);
        }
        .ci-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        @keyframes fadeUpCI { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
        .ci-anim { animation: fadeUpCI 0.55s ease both; }
      `}</style>

      <div
        className="ci-page min-h-screen flex items-center justify-center px-4"
        style={{ background: '#07090f', color: '#e2e8f0' }}
      >
        <div
          className="ci-anim w-full max-w-md rounded-2xl p-8 relative"
          style={{
            background: 'rgba(13,17,23,0.97)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: 'linear-gradient(135deg, #1e3a5f, #0c1e33)',
              border: '1px solid rgba(56,189,248,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 32px rgba(56,189,248,0.15)',
            }}>
              <Building2 style={{ width: 30, height: 30, color: '#38bdf8' }} />
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-7">
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', color: '#f8fafc', marginBottom: 8 }}>
              Informações da empresa
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
              Precisamos de alguns dados para personalizar sua experiência.
            </p>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Seu nome
              </label>
              <div className="relative">
                <User style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Nome completo"
                  className="ci-input"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Company */}
            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Empresa <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div className="relative">
                <Building2 style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                <input
                  type="text"
                  name="company_name"
                  required
                  value={form.company_name}
                  onChange={handleChange}
                  placeholder="Nome da empresa"
                  className="ci-input"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* CNPJ */}
            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                CNPJ
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <FileText style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    name="cnpj"
                    value={form.cnpj}
                    onChange={handleChange}
                    placeholder="00.000.000/0000-00"
                    className="ci-input"
                    style={{ ...inputStyle, paddingRight: cnpjStatus ? 36 : 14 }}
                    inputMode="numeric"
                  />
                  {cnpjStatus === 'valid' && (
                    <CheckCircle2 style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#22c55e', pointerEvents: 'none' }} />
                  )}
                  {cnpjStatus === 'invalid' && (
                    <XCircle style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#ef4444', pointerEvents: 'none' }} />
                  )}
                  {cnpjStatus === 'loading' && (
                    <Loader2 style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#64748b', animation: 'spin 1s linear infinite', pointerEvents: 'none' }} />
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleValidateCnpj}
                  disabled={!canValidate}
                  style={{
                    padding: '0 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.13)',
                    background: canValidate ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.04)',
                    color: canValidate ? '#38bdf8' : '#475569',
                    fontSize: 13, fontWeight: 500, cursor: canValidate ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap', transition: 'all 0.2s',
                  }}
                >
                  Validar
                </button>
              </div>
              {cnpjStatus === 'valid' && cnpjData && (
                <p style={{ fontSize: 12, color: '#22c55e', marginTop: 2 }}>
                  {cnpjData.razao_social} — {cnpjData.situacao_cadastral}
                </p>
              )}
              {cnpjStatus === 'invalid' && (
                <p style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>CNPJ não encontrado ou inválido</p>
              )}
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Telefone
              </label>
              <div className="relative">
                <Phone style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b', pointerEvents: 'none' }} />
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="(00) 00000-0000"
                  className="ci-input"
                  style={inputStyle}
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="ci-btn w-full flex items-center justify-center gap-2 mt-2"
              style={{
                padding: '13px', borderRadius: 10, border: 'none',
                color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              }}
            >
              {loading ? (
                <Loader2 style={{ width: 18, height: 18, animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <ArrowRight style={{ width: 16, height: 16 }} />
              )}
              {loading ? 'Salvando...' : 'Continuar'}
            </button>

            {/* Skip */}
            <button
              type="button"
              onClick={() => navigate('/select-plan', { replace: true })}
              style={{
                background: 'none', border: 'none', color: '#475569',
                fontSize: 13, cursor: 'pointer', textAlign: 'center',
                padding: '4px 0', transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
            >
              Pular por agora
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
