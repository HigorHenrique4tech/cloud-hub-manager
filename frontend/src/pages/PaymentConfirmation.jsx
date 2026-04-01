import { useEffect, useState } from 'react';
import { CheckCircle2, ArrowRight, Shield } from 'lucide-react';
import Logo from '../components/common/Logo';

const PaymentConfirmation = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Clean up any pending payment data
    localStorage.removeItem('pending_payment_id');
    localStorage.removeItem('pending_payment_org');
    // Trigger entrance animation
    const t = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Check if user is likely logged in (has token)
  const isLoggedIn = !!localStorage.getItem('token');
  const appUrl = isLoggedIn ? '/' : '/login';

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)' }}
    >
      <div className={`w-full max-w-md transition-all duration-700 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <Logo size="lg" variant="light" />
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center shadow-2xl">
          {/* Success icon */}
          <div className="relative mx-auto w-20 h-20 mb-6">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white mb-2">
            Pagamento Confirmado
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Seu pagamento foi recebido com sucesso.<br />
            Agradecemos a sua confianca!
          </p>

          {/* Info card */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-8">
            <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-medium">
              <Shield className="w-4 h-4" />
              <span>Transacao processada com seguranca</span>
            </div>
          </div>

          {/* CTA button */}
          <a
            href={appUrl}
            className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl text-sm transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-[0.97]"
          >
            Acessar Plataforma
            <ArrowRight className="w-4 h-4" />
          </a>

          {/* Secondary link */}
          <p className="mt-4 text-xs text-slate-500">
            Caso tenha duvidas, entre em contato com nosso suporte.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-8">
          Este pagamento foi processado de forma segura via PIX.
        </p>
      </div>
    </div>
  );
};

export default PaymentConfirmation;
