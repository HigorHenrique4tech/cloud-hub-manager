import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import TermsModal from '../auth/TermsModal';
import authService from '../../services/authService';

/**
 * Envolve a aplicação autenticada e exibe o modal de termos
 * se o usuário ainda não aceitou a versão atual.
 */
export default function TermsGate({ children }) {
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(false);

  // Usuário não logado ou já aceitou: não bloquear
  if (!user || user.terms_accepted) return children;

  const handleAccept = async () => {
    setLoading(true);
    try {
      await authService.acceptTerms();
      // Atualiza o usuário em contexto para desbloquear a UI
      setUser(prev => ({ ...prev, terms_accepted: true }));
    } catch {
      // Erro silencioso — o usuário pode tentar novamente
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = () => {
    // Desloga o usuário se recusar os termos
    authService.logoutServer().catch(() => {});
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  };

  return (
    <>
      <TermsModal onAccept={handleAccept} onDecline={handleDecline} loading={loading} />
      {/* Renderiza a UI por baixo mas bloqueada pelo modal */}
      <div className="pointer-events-none select-none">{children}</div>
    </>
  );
}
