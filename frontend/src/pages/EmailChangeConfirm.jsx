import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import api, { clearAccessToken } from '../services/api';

export default function EmailChangeConfirm() {
  const { token } = useParams();
  const navigate = useNavigate();
  const calledRef = useRef(false);
  const [state, setState] = useState({ status: 'loading', message: '' });

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    api
      .post('/auth/email/confirm', { token })
      .then((resp) => {
        setState({
          status: 'success',
          message: resp.data?.detail || 'Email atualizado com sucesso. Faça login novamente.',
        });
        // Force re-login since the backend revoked all sessions
        clearAccessToken();
      })
      .catch((err) => {
        setState({
          status: 'error',
          message: err.response?.data?.detail || 'Não foi possível confirmar a alteração de email.',
        });
      });
  }, [token]);

  const isSuccess = state.status === 'success';
  const isError = state.status === 'error';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="card max-w-sm w-full text-center p-8">
        <div
          className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
            isSuccess
              ? 'bg-green-100 dark:bg-green-900/30'
              : isError
                ? 'bg-red-100 dark:bg-red-900/30'
                : 'bg-blue-100 dark:bg-blue-900/30'
          }`}
        >
          {state.status === 'loading' && <Loader2 className="w-7 h-7 text-blue-600 dark:text-blue-400 animate-spin" />}
          {isSuccess && <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />}
          {isError && <XCircle className="w-7 h-7 text-red-600 dark:text-red-400" />}
        </div>

        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {state.status === 'loading' && 'Confirmando alteração...'}
          {isSuccess && 'Email atualizado'}
          {isError && 'Falha ao confirmar'}
        </h1>

        {state.message && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{state.message}</p>
        )}

        {(isSuccess || isError) && (
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="btn-primary w-full"
          >
            Ir para login
          </button>
        )}
      </div>
    </div>
  );
}
