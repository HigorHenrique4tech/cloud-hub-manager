import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

const VARIANTS = {
  success: {
    icon: CheckCircle,
    bar: 'bg-emerald-500',
    iconCls: 'text-emerald-400',
    bg: 'bg-gray-800 border-gray-700',
  },
  error: {
    icon: XCircle,
    bar: 'bg-red-500',
    iconCls: 'text-red-400',
    bg: 'bg-gray-800 border-gray-700',
  },
  warning: {
    icon: AlertTriangle,
    bar: 'bg-amber-500',
    iconCls: 'text-amber-400',
    bg: 'bg-gray-800 border-gray-700',
  },
  info: {
    icon: Info,
    bar: 'bg-blue-500',
    iconCls: 'text-blue-400',
    bg: 'bg-gray-800 border-gray-700',
  },
};

function Toast({ toast, onDismiss }) {
  const v = VARIANTS[toast.type] ?? VARIANTS.info;
  const Icon = v.icon;

  return (
    <div
      className={`flex items-start gap-3 w-80 rounded-lg border shadow-xl overflow-hidden ${v.bg} animate-slide-in`}
      role="alert"
    >
      {/* color bar */}
      <div className={`w-1 shrink-0 self-stretch ${v.bar}`} />

      <Icon className={`mt-3 shrink-0 w-5 h-5 ${v.iconCls}`} />

      <p className="flex-1 py-3 text-sm text-gray-100 leading-snug">{toast.message}</p>

      <button
        onClick={() => onDismiss(toast.id)}
        className="mt-2 mr-2 p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        aria-label="Fechar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function Toaster() {
  const { toasts, dismiss } = useToast();

  return createPortal(
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>,
    document.body
  );
}
