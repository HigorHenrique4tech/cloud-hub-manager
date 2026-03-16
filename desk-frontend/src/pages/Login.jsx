import { useEffect, useState } from 'react';
import { LifeBuoy, Loader2 } from 'lucide-react';

const HUB_LOGIN = 'https://hub.cloudatlas.app.br/login?redirect=desk';

export default function Login() {
  const [countdown, setCountdown] = useState(3);

  // Auto-redirect after brief countdown so the user sees what's happening
  useEffect(() => {
    if (countdown <= 0) {
      window.location.replace(HUB_LOGIN);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <LifeBuoy className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">CloudAtlas Desk</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Portal de Suporte</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Verificando sessão...
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Redirecionando para autenticação em {countdown}s
          </p>
          <button
            onClick={() => window.location.replace(HUB_LOGIN)}
            className="text-xs text-primary hover:underline"
          >
            Ir agora
          </button>
        </div>
      </div>
    </div>
  );
}
