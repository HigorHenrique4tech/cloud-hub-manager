import { useState } from 'react';
import { X, QrCode, CreditCard, ArrowRight, ShieldCheck } from 'lucide-react';

const CARD_BRANDS = ['Visa', 'Mastercard', 'Elo', 'Amex'];
const INSTALLMENT_OPTIONS = [1, 2, 3, 6];

function formatCPF(value) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

const inputClass = (hasError) =>
  `w-full rounded-lg border px-3 py-2.5 text-sm text-white bg-gray-800 focus:outline-none transition-colors ${
    hasError ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-primary'
  }`;

const PaymentMethodModal = ({ plan, onClose, onConfirm, loading }) => {
  const [method, setMethod]         = useState('PIX');
  const [taxId, setTaxId]           = useState('');
  const [phone, setPhone]           = useState('');
  const [installments, setInstallments] = useState(1);
  const [errors, setErrors]         = useState({});

  const clearError = (field) => setErrors((e) => ({ ...e, [field]: '' }));

  const validate = () => {
    const next = {};
    const taxDigits = taxId.replace(/\D/g, '');
    if (taxDigits.length !== 11 && taxDigits.length !== 14) {
      next.taxId = 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.';
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      next.phone = 'Informe um telefone com DDD (ex: (11) 99999-9999).';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleConfirm = () => {
    if (!validate()) return;
    onConfirm({
      method,
      taxId:        taxId.replace(/\D/g, ''),
      phone:        phone.replace(/\D/g, ''),
      installments: method === 'CREDIT_CARD' ? installments : 1,
    });
  };

  const installmentValue = plan.amountCents / 100 / installments;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Forma de Pagamento</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {plan.name} · <span className="text-white font-medium">
                R$ {(plan.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Method selection */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMethod('PIX')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                method === 'PIX'
                  ? 'border-primary bg-primary/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${method === 'PIX' ? 'bg-primary/20' : 'bg-gray-700'}`}>
                <QrCode className={`w-5 h-5 ${method === 'PIX' ? 'text-primary' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${method === 'PIX' ? 'text-white' : 'text-gray-300'}`}>PIX</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Confirmação imediata</p>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                  Sem taxas
                </span>
              </div>
            </button>

            <button
              onClick={() => setMethod('CARD')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                method === 'CARD'
                  ? 'border-primary bg-primary/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${method === 'CARD' ? 'bg-primary/20' : 'bg-gray-700'}`}>
                <CreditCard className={`w-5 h-5 ${method === 'CARD' ? 'text-primary' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${method === 'CARD' ? 'text-white' : 'text-gray-300'}`}>Cartão</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Parcele em até 6x</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{CARD_BRANDS.join(' · ')}</p>
              </div>
            </button>
          </div>


          {/* Installments (cartão apenas) */}
          {method === 'CARD' && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Parcelamento</label>
              <div className="grid grid-cols-4 gap-2">
                {INSTALLMENT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setInstallments(n)}
                    className={`py-2 rounded-lg text-xs font-medium transition-all ${
                      installments === n
                        ? 'bg-primary text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    {n === 1 ? 'À vista' : `${n}x`}
                  </button>
                ))}
              </div>
              {installments > 1 && (
                <p className="text-xs text-gray-400 mt-1.5">
                  {installments}x de{' '}
                  <span className="text-white font-medium">
                    R$ {installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>{' '}
                  sem juros
                </p>
              )}
            </div>
          )}

          {/* CPF / CNPJ + Telefone (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                CPF / CNPJ <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => { clearError('taxId'); setTaxId(formatCPF(e.target.value)); }}
                placeholder="000.000.000-00"
                className={inputClass(!!errors.taxId)}
              />
              {errors.taxId && <p className="text-[11px] text-red-400 mt-1">{errors.taxId}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Telefone <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => { clearError('phone'); setPhone(formatPhone(e.target.value)); }}
                placeholder="(11) 99999-9999"
                className={inputClass(!!errors.phone)}
              />
              {errors.phone && <p className="text-[11px] text-red-400 mt-1">{errors.phone}</p>}
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-800/50 rounded-lg px-3 py-2.5">
            <ShieldCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span>Pagamento processado com segurança pela AbacatePay. Seus dados não são armazenados.</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Ir para pagamento <ArrowRight size={14} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodModal;
