import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';

export default function OAuthCallback({ provider }) {
  const [error, setError] = useState('');
  const { loginWithTokens } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const code = searchParams.get('code');
    if (!code) {
      setError('Código de autorização não encontrado.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        let data;
        if (provider === 'google') {
          const redirectUri = `${window.location.origin}/auth/google/callback`;
          data = await authService.googleCallback(code, redirectUri);
        } else if (provider === 'microsoft') {
          const redirectUri = `${window.location.origin}/auth/microsoft/callback`;
          data = await authService.microsoftCallback(code, redirectUri);
        } else {
          data = await authService.githubCallback(code);
        }
        if (cancelled) return;
        loginWithTokens(data);
        const oauthRedirect = sessionStorage.getItem('oauth_redirect');
        if (oauthRedirect === 'desk') {
          sessionStorage.removeItem('oauth_redirect');
          window.location.href = `https://desk.cloudatlas.app.br/auth/callback?token=${data.access_token}&refresh=${data.refresh_token || ''}`;
          return;
        }
        navigate('/', { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || `Falha na autenticação com ${provider}.`);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [provider, searchParams, loginWithTokens, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Erro na autenticação</h2>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
          >
            Voltar ao login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <span className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin inline-block mb-4" />
        <p className="text-gray-500">Autenticando...</p>
      </div>
    </div>
  );
}
