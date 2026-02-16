import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';

const VerifyCallback = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      try {
        const data = await authService.verifyEmail(token);
        setStatus('success');
        setMessage(data.detail);

        // Update user state if logged in
        if (user) {
          setUser({ ...user, is_verified: true });
        }

        // Redirect after 2s — new users go to plan selection, existing go to dashboard
        setTimeout(() => {
          if (data.already_verified) {
            navigate('/');
          } else {
            navigate('/select-plan');
          }
        }, 2000);
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.detail || 'Token inválido ou expirado');
      }
    };
    verify();
  }, [token]);

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

        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-white mb-2">Verificando email...</h2>
            <p className="text-slate-400 text-sm">Aguarde um momento</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">{message}</h2>
            <p className="text-slate-400 text-sm mb-6">Redirecionando...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Falha na verificação</h2>
            <p className="text-slate-400 text-sm mb-6">{message}</p>
            <div className="flex items-center justify-center gap-4">
              <Link
                to="/login"
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Ir para login
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 bg-slate-700 text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-600 transition-colors"
              >
                Criar conta
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyCallback;
