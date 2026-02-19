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
      const msg = err.response?.data?.detail || err.message || 'Erro ao criar recurso';
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
