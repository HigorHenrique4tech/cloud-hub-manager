import CopyButton from './CopyButton';

const SecretBanner = ({ secret, onDismiss }) => (
  <div className="rounded-xl border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-4 space-y-2">
    <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">
      Guarde o segredo — ele não será exibido novamente!
    </p>
    <div className="flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-yellow-200 dark:border-yellow-700 px-3 py-2 font-mono text-xs text-gray-800 dark:text-slate-200 overflow-x-auto">
      <span className="flex-1 select-all">{secret}</span>
      <CopyButton text={secret} />
    </div>
    <button onClick={onDismiss} className="text-xs text-yellow-700 dark:text-yellow-500 hover:underline">
      Entendido, fechar
    </button>
  </div>
);

export default SecretBanner;
