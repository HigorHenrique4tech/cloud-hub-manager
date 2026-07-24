import { useState, useEffect } from 'react';

/**
 * useDebounce — adia a atualização de um valor até que o usuário pare de digitar.
 *
 * const debouncedSearch = useDebounce(search, 400);
 * useEffect(() => { fetchResults(debouncedSearch); }, [debouncedSearch]);
 */
export function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
