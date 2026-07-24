import { useState, useCallback } from 'react';

/**
 * useModal — gerencia estado de modal genérico.
 *
 * const { isOpen, open, close, data } = useModal();
 * <button onClick={() => open(myItem)}>Abrir</button>
 * {isOpen && <Modal item={data} onClose={close} />}
 */
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [data, setData]     = useState(null);

  const open  = useCallback((payload = null) => { setData(payload); setIsOpen(true); }, []);
  const close = useCallback(() => { setIsOpen(false); setData(null); }, []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return { isOpen, open, close, toggle, data };
}
