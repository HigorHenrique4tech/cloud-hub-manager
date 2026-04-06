import { useEffect } from 'react';

/**
 * useEscapeKey — fecha modal/drawer quando Escape é pressionado.
 * @param {boolean} active - se o listener deve estar ativo (ex: isOpen)
 * @param {Function} onEscape - callback a executar ao pressionar Escape
 */
export function useEscapeKey(active, onEscape) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onEscape]);
}
