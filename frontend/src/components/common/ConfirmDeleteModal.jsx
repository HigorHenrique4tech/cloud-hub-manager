import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Reusable confirmation modal for destructive actions.
 *
 * Props:
 *  variant = "danger" (red) | "warning" (amber) — default: "danger"
 *  confirmText — if set, user must type this string to enable button
 */
const VARIANTS = {
  danger: {
    icon:   'text-red-600 dark:text-red-400',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    btn:    'bg-red-600 hover:bg-red-700',
  },
  warning: {
    icon:   'text-amber-500 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    btn:    'bg-amber-500 hover:bg-amber-600',
  },
};

const ConfirmDeleteModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmar exclusão',
  description = 'Esta ação não pode ser desfeita.',
  confirmText = null,
  confirmLabel = 'Excluir',
  isLoading = false,
  error = null,
  variant = 'danger',
}) => {
  const [typed, setTyped] = useState('');
  const v = VARIANTS[variant] ?? VARIANTS.danger;

  useEffect(() => {
    if (!isOpen) setTyped('');
  }, [isOpen]);

  if (!isOpen) return null;

  const canConfirm = confirmText ? typed === confirmText : true;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md animate-in fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${v.iconBg}`}>
              <AlertTriangle className={`w-5 h-5 ${v.icon}`} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {confirmText && (
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                Digite <strong className={v.icon.split(' ')[0]}>{confirmText}</strong> para confirmar:
              </p>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="input w-full text-gray-900 dark:text-gray-100 font-medium"
                placeholder={confirmText}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || isLoading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${v.btn}`}
          >
            {isLoading ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
