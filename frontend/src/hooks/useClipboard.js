import { useState, useCallback } from 'react';

/**
 * useClipboard — copy-to-clipboard reutilizável.
 *
 * const { copy, copied } = useClipboard();
 * <button onClick={() => copy('texto')}>
 *   {copied ? 'Copiado!' : 'Copiar'}
 * </button>
 */
export function useClipboard(resetDelay = 2000) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), resetDelay);
    } catch {
      // fallback para browsers mais antigos
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), resetDelay);
    }
  }, [resetDelay]);

  return { copy, copied };
}
