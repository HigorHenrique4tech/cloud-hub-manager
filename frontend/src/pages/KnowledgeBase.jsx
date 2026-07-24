import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BookOpen, Search, Settings2, Grid3x3, X, Sparkles, ArrowLeft,
} from 'lucide-react';
import * as Icons from 'lucide-react';
import Layout from '../components/layout/layout';
import knowledgeService from '../services/knowledgeService';
import ArticleCard from '../components/knowledge/ArticleCard';
import EmptyState from '../components/common/emptystate';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';

function CategoryIcon({ name, className }) {
  if (!name) return <BookOpen className={className} />;
  const Lucide = Icons[name] || BookOpen;
  return <Lucide className={className} />;
}

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

  const clearFilters = () => {
    setSearch('');
    const next = new URLSearchParams(params);
    next.delete('cat');
    next.delete('q');
    setParams(next, { replace: true });
  };

  const categories = catsQ.data || [];
  const articles = articlesQ.data?.items || [];

  const isFiltering = activeCategory !== 'all' || !!debouncedSearch;
  const totalArticles = useMemo(
    () => categories.reduce((acc, c) => acc + (c.article_count || 0), 0),
    [categories]
  );
  const showFeatured = !isFiltering && articles.length >= 3;
  const featured = showFeatured ? articles[0] : null;
  const restArticles = showFeatured ? articles.slice(1) : articles;

  const activeCatName = useMemo(() => {
    if (activeCategory === 'all') return null;
    return categories.find((c) => c.slug === activeCategory)?.name || activeCategory;
  }, [activeCategory, categories]);

  return (
    <Layout>
    <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl ring-1 ring-white/10 shadow-lg p-6 md:p-8 text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1E6FD9 0%, #0EA5E9 50%, #1558B0 100%)' }}
      >
        <div className="absolute inset-0 opacity-20 pointer-events-none"
             style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.25) 0%, transparent 50%)' }} />
        <div className="relative flex items-start gap-4 flex-wrap">
          <Link
            to="/"
            className="p-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur ring-1 ring-white/20 transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-3 rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/20">
            <BookOpen className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold">Base de Conhecimento</h1>
            <p className="text-sm md:text-base text-white/80 mt-1">
              Tutoriais, guias e respostas para suas dúvidas sobre o CloudAtlas.
            </p>
          </div>
          {user?.is_admin && (
            <Link
              to="/admin/knowledge"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur ring-1 ring-white/20 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              Gerenciar
            </Link>
          )}
        </div>

        {/* Search dentro do hero */}
        <div className="relative mt-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar artigos..."
            className="w-full pl-10 pr-10 py-3 text-sm rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/20 text-white placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white/60"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/15"
              aria-label="Limpar busca"
            >
              <X className="w-4 h-4 text-white/80" />
            </button>
          )}
        </div>
      </div>

      {/* ── Categorias (só sem filtro) ──────────────────────────────────── */}
      {!isFiltering && categories.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Categorias
          </h2>
          <div className="flex flex-wrap gap-3">
            {categories.map((cat) => (
              <button
                key={cat.slug}
                onClick={() => setCategory(cat.slug)}
                className="card-interactive p-4 min-w-[170px] flex items-center gap-3 text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <CategoryIcon name={cat.icon} className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {cat.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {cat.article_count || 0} artigo{(cat.article_count || 0) === 1 ? '' : 's'}
                  </div>
                </div>
              </button>
            ))}
            <button
              onClick={() => setCategory('all')}
              className="card-interactive p-4 min-w-[170px] flex items-center gap-3 text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0">
                <Grid3x3 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Todos
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {totalArticles} artigo{totalArticles === 1 ? '' : 's'}
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── Filter bar (com filtro/busca) ───────────────────────────────── */}
      {isFiltering && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {activeCatName && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <CategoryIcon
                  name={categories.find((c) => c.slug === activeCategory)?.icon}
                  className="w-3.5 h-3.5"
                />
                {activeCatName}
                <button
                  onClick={() => setCategory('all')}
                  className="ml-0.5 hover:bg-primary/20 rounded-full p-0.5"
                  aria-label="Remover filtro de categoria"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {debouncedSearch && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium">
                <Search className="w-3.5 h-3.5" />
                "{debouncedSearch}"
                <button
                  onClick={() => setSearch('')}
                  className="ml-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                  aria-label="Limpar busca"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {articles.length} artigo{articles.length === 1 ? '' : 's'}
          </div>
        </div>
      )}

      {/* ── Featured article ────────────────────────────────────────────── */}
      {featured && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-primary mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Em destaque
          </h2>
          <ArticleCard article={featured} featured />
        </div>
      )}

      {/* ── Articles grid ───────────────────────────────────────────────── */}
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
        <EmptyState
          icon={BookOpen}
          title={
            debouncedSearch
              ? `Nenhum resultado para "${debouncedSearch}"`
              : isFiltering
              ? 'Nenhum artigo nesta categoria ainda.'
              : 'Ainda não há artigos publicados.'
          }
          description={
            isFiltering
              ? 'Tente outra categoria ou limpe os filtros para ver tudo.'
              : user?.is_admin
              ? 'Comece criando sua primeira categoria e artigo no painel admin.'
              : 'Volte em breve — estamos preparando o conteúdo.'
          }
          action={isFiltering ? clearFilters : undefined}
          actionLabel={isFiltering ? 'Limpar filtros' : undefined}
        />
      ) : (
        <div>
          {featured && (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
              Mais artigos
            </h2>
          )}
          {restArticles.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {restArticles.map((a) => <ArticleCard key={a.id} article={a} />)}
            </div>
          ) : (
            !featured && null
          )}
        </div>
      )}
    </div>
    </Layout>
  );
}
