import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook for resource creation with loading/error/success states.
 *
 * @param {Function} createFn - Async function that calls the API
 * @param {Object} options
 * @param {string|string[]} options.invalidateKey - React Query key(s) to invalidate on success
 * @param {Function} options.onSuccess - Called after successful creation
 */
const useCreateResource = (createFn, { invalidateKey, onSuccess } = {}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const queryClient = useQueryClient();

  const mutate = async (data) => {
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      const result = await createFn(data);
      setSuccess('Recurso criado com sucesso!');
      if (invalidateKey) {
        const keys = Array.isArray(invalidateKey) ? invalidateKey : [invalidateKey];
        keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      }
      onSuccess?.(result);
      return result;
    } catch (err) {
      const detail = err.response?.data?.detail;
      let msg;
      if (Array.isArray(detail)) {
        msg = detail.map((e) => {
          const field = Array.isArray(e.loc) ? e.loc.filter((x) => x !== 'body').join('.') : '';
          return field ? `${field}: ${e.msg}` : e.msg;
        }).join('; ');
      } else if (typeof detail === 'string') {
        msg = detail;
      } else if (detail && typeof detail === 'object') {
        msg = detail.msg || JSON.stringify(detail);
      } else {
        msg = err.message || 'Erro ao criar recurso';
      }
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setError('');
    setSuccess('');
  };

  return { mutate, isLoading, error, success, reset };
};

export default useCreateResource;
