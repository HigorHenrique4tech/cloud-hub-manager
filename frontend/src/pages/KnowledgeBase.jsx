import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Search, Sparkles, Settings2 } from 'lucide-react';
import knowledgeService from '../services/knowledgeService';
import ArticleCard from '../components/knowledge/ArticleCard';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';

export default function KnowledgeBase() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const activeCategory = params.get('cat') || 'all';
  const debouncedSearch = useDebounce(search, 350);

  const catsQ = useQuery({
    queryKey: ['kb-categories'],
    queryFn: knowledgeService.listCategories,
    staleTime: 5 * 60_000,
  });

  const articlesQ = useQuery({
    queryKey: ['kb-articles', activeCategory, debouncedSearch],
    queryFn: () => knowledgeService.listArticles({
      category_slug: activeCategory === 'all' ? undefined : activeCategory,
      q: debouncedSearch || undefined,
      page_size: 50,
    }),
    keepPreviousData: true,
  });

  const setCategory = (slug) => {
    const next = new URLSearchParams(params);
    if (slug === 'all') next.delete('cat'); else next.set('cat', slug);
    setParams(next, { replace: true });
  };

  const categories = catsQ.data || [];
  const articles = articlesQ.data?.items || [];

  const tabs = useMemo(() => [
    { slug: 'all', name: 'Todos' },
    ...categories,
  ], [categories]);

  return (
    <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
          <BookOpen className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Base de Conhecimento
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Tutoriais, guias e respostas para suas dúvidas sobre o CloudAtlas.
          </p>
        </div>
        {user?.is_admin && (
          <Link
            to="/admin/knowledge"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <Settings2 className="w-4 h-4" />
            Gerenciar
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar artigos..."
          className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {tabs.map((t) => {
          const active = activeCategory === t.slug;
          return (
            <button
              key={t.slug}
              onClick={() => setCategory(t.slug)}
              className={`shrink-0 px-3.5 py-1.5 text-sm rounded-full border transition-colors ${
                active
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-primary/50'
              }`}
            >
              {t.name}
              {t.article_count != null && t.slug !== 'all' && (
                <span className={`ml-1.5 text-[11px] ${active ? 'text-white/80' : 'text-gray-400'}`}>
                  {t.article_count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Articles grid */}
      {articlesQ.isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 h-40 animate-pulse">
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="h-5 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16">
          <Sparkles className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {debouncedSearch
              ? `Nenhum artigo encontrado para "${debouncedSearch}"`
              : 'Nenhum artigo disponível nesta categoria ainda.'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      )}
    </div>
  );
}
