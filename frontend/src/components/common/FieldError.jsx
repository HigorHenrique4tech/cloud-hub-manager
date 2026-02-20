import { AlertCircle } from 'lucide-react';

const FieldError = ({ message }) => {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />
      {message}
    </p>
  );
};

export default FieldError;
