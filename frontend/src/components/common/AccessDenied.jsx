import { ShieldOff, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../layout/header';
import Sidebar from '../layout/sidebar';

const AccessDenied = ({
  title = 'Acesso não permitido',
  message = 'Você não tem permissão para acessar esta página.',
  hint = null,
  showLayout = true,
}) => {
  const navigate = useNavigate();

  const content = (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/20">
        <ShieldOff className="w-8 h-8 text-red-500 dark:text-red-400" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">{message}</p>
        {hint && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 max-w-sm">{hint}</p>
        )}
      </div>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>
    </div>
  );

  if (!showLayout) return content;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1">{content}</main>
      </div>
    </div>
  );
};

export default AccessDenied;
