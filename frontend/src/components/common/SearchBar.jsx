import { Search } from 'lucide-react';

const SearchBar = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="relative w-full max-w-sm flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300
                 bg-white text-gray-400 hover:border-gray-400 hover:text-gray-500
                 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500 dark:hover:border-gray-500
                 transition-colors cursor-pointer text-left"
    >
      <Search className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">Buscar...</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono
                     text-gray-400 bg-gray-100 dark:bg-gray-600 rounded border border-gray-200 dark:border-gray-500">
        Ctrl+K
      </kbd>
    </button>
  );
};

export default SearchBar;
