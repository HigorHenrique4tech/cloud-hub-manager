import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Cookie, X, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'cloudatlas_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const save = (value) => {
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
    setVisible(false);
  };

  if (!visible) return null;

  return createPortal(
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-2xl px-4"
    >
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40 p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary dark:text-primary-light mt-0.5">
            <Cookie className="w-5 h-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Cookies e privacidade
              </p>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3" />
                LGPD
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Usamos cookies essenciais para autenticação e funcionamento da plataforma, e cookies analíticos para melhorar sua experiência. Seus dados são tratados conforme nossa{' '}
              <Link
                to="/privacy"
                className="text-primary dark:text-primary-light underline underline-offset-2 hover:no-underline"
              >
                Política de Privacidade
              </Link>
              , em conformidade com a LGPD.
            </p>
          </div>

          {/* Close (dismiss without choosing) */}
          <button
            onClick={() => save('essential')}
            aria-label="Fechar aviso de cookies"
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pl-14">
          <button
            onClick={() => save('all')}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-semibold transition-colors"
          >
            Aceitar todos
          </button>
          <button
            onClick={() => save('essential')}
            className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold transition-colors"
          >
            Apenas essenciais
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
