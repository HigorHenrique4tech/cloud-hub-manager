import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';

const InviteAccept = () => {
  const { token } = useParams();
  const { token: authToken } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');
  const [orgSlug, setOrgSlug] = useState(null);
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    if (!authToken) {
      navigate(`/register?invite=${token}`, { replace: true });
      return;
    }

    const accept = async () => {
      try {
        const result = await authService.acceptInvitation(token);
        setStatus('success');
        setMessage(result.detail);
        setOrgSlug(result.organization_slug);
        setOrgName(result.organization_name || '');
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.detail || 'Erro ao aceitar convite');
      }
    };
    accept();
  }, [authToken, token, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Processando convite...</h2>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{message}</h2>
            {orgName && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Você agora faz parte da organização <strong>{orgName}</strong>.
              </p>
            )}
            <Link
              to="/"
              className="inline-block px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Ir para o Dashboard
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Erro no convite</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</p>
            <Link
              to="/"
              className="inline-block px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Ir para o Dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default InviteAccept;
