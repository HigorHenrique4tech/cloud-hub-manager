import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
      {copied
        ? <Check size={14} className="text-green-500" />
        : <Copy size={14} className="text-gray-500 dark:text-slate-400" />
      }
    </button>
  );
};

export default CopyButton;
