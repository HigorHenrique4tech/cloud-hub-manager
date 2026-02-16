import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';

const VerifyEmail = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const email = user?.email || searchParams.get('email') || '';

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    try {
      await authService.resendVerification(email);
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch {
      // silent
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)' }}
    >
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <img src="/logoblack.png" alt="CloudAtlas" className="w-10 h-10 object-contain" />
          <span className="text-2xl font-bold text-white">CloudAtlas</span>
        </div>

        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
          <Mail className="w-10 h-10 text-primary" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">Verifique seu email</h1>
        <p className="text-slate-400 text-sm mb-2 leading-relaxed">
          Enviamos um link de confirmação para:
        </p>
        <p className="text-white font-semibold text-sm mb-6">{email}</p>
        <p className="text-slate-500 text-xs mb-8 leading-relaxed max-w-sm mx-auto">
          Clique no link enviado para o seu email para ativar sua conta.
          O link expira em 24 horas.
        </p>

        {/* Resend */}
        <button
          onClick={handleResend}
          disabled={resending || resent}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-lg
                     text-sm font-medium hover:bg-slate-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700"
        >
          {resent ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              Email reenviado!
            </>
          ) : resending ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Reenviando...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Reenviar email
            </>
          )}
        </button>

        {/* Back to login */}
        <p className="mt-8 text-xs text-slate-600">
          Email errado?{' '}
          <Link to="/register" className="text-primary hover:underline">
            Criar nova conta
          </Link>
          {' | '}
          <Link to="/login" className="text-primary hover:underline">
            Entrar com outra conta
          </Link>
        </p>
      </div>
    </div>
  );
};

export default VerifyEmail;
