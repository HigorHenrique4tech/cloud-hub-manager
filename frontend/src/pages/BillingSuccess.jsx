import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import billingService from '../services/billingService';

const BillingSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentOrg, refreshOrgs } = useOrgWorkspace();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');
  const attemptsRef = useRef(0);
  const timerRef = useRef(null);

  const paymentId = searchParams.get('payment_id') || localStorage.getItem('pending_payment_id');
  const orgSlug = currentOrg?.slug || localStorage.getItem('pending_payment_org');

  useEffect(() => {
    if (!paymentId || !orgSlug) return;

    const verify = async () => {
      try {
        const data = await billingService.verifyPayment(orgSlug, paymentId);

        if (data.status === 'PAID') {
          localStorage.removeItem('pending_payment_id');
          localStorage.removeItem('pending_payment_org');
          setStatus('success');
          setMessage(`Plano ${data.plan_tier?.charAt(0).toUpperCase() + data.plan_tier?.slice(1)} ativado com sucesso!`);
          await refreshOrgs();
          setTimeout(() => navigate('/'), 3000);
          return;
        }

        if (data.status === 'EXPIRED' || data.status === 'CANCELLED' || data.status === 'REFUNDED') {
          localStorage.removeItem('pending_payment_id');
          localStorage.removeItem('pending_payment_org');
          setStatus('error');
          setMessage('Pagamento não foi concluído. Tente novamente.');
          return;
        }

        // Still pending — retry
        attemptsRef.current += 1;
        if (attemptsRef.current >= 10) {
          setStatus('error');
          setMessage('Tempo limite atingido. Verifique seu pagamento e tente novamente.');
          return;
        }

        timerRef.current = setTimeout(verify, 3000);
      } catch {
        setStatus('error');
        setMessage('Erro ao verificar pagamento.');
      }
    };

    verify();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [paymentId, orgSlug]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)' }}
    >
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-center gap-3 mb-10">
          <img src="/logoblack.png" alt="CloudAtlas" className="w-10 h-10 object-contain" />
          <span className="text-2xl font-bold text-white">CloudAtlas</span>
        </div>

        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-white mb-2">Confirmando pagamento...</h2>
            <p className="text-slate-400 text-sm">Aguarde enquanto verificamos seu pagamento</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">{message}</h2>
            <p className="text-slate-400 text-sm mb-6">Redirecionando para o dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Falha no pagamento</h2>
            <p className="text-slate-400 text-sm mb-6">{message}</p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => navigate('/select-plan')}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Tentar novamente
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-slate-700 text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-600 transition-colors"
              >
                Ir para dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BillingSuccess;
