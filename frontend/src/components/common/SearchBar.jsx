import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useSearchParams, useLocation } from 'react-router-dom';

const SearchBar = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const query = searchParams.get('q') || '';

  // Clear search when navigating to a different page
  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('q');
        return next;
      });
    }
  }, [location.pathname, setSearchParams]);

  const handleChange = (e) => {
    const value = e.target.value;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set('q', value);
      } else {
        next.delete('q');
      }
      return next;
    });
  };

  const handleClear = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('q');
      return next;
    });
  };

  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder="Buscar recursos, grupos, assinaturas..."
        className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-gray-300 bg-white
                   focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
                   dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400
                   dark:focus:ring-primary"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
