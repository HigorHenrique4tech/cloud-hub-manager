import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    const refresh = searchParams.get('refresh');
    if (token) {
      localStorage.setItem('desk_token', token);
      if (refresh) localStorage.setItem('desk_refreshToken', refresh);
    }
    navigate('/', { replace: true });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin inline-block mb-4" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Autenticando...</p>
      </div>
    </div>
  );
}
