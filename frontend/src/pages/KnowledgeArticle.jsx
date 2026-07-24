import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Video as VideoIcon, Loader2, FileX } from 'lucide-react';
import Layout from '../components/layout/layout';
import knowledgeService from '../services/knowledgeService';
import MarkdownRenderer from '../components/knowledge/MarkdownRenderer';
import VideoPlayer, { formatDuration } from '../components/knowledge/VideoPlayer';

export default function KnowledgeArticle() {
  const { slug } = useParams();

  const articleQ = useQuery({
    queryKey: ['kb-article', slug],
    queryFn: () => knowledgeService.getArticle(slug),
    // Presigned URLs expire in 1h — refetch every 50min so a long reading session stays valid.
    refetchInterval: 50 * 60_000,
    refetchIntervalInBackground: false,
  });

  if (articleQ.isLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto p-6 flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (articleQ.isError || !articleQ.data) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto p-6 text-center">
          <FileX className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Artigo não encontrado ou removido.
          </p>
          <Link to="/knowledge" className="text-primary hover:underline text-sm">
            ← Voltar para Base de Conhecimento
          </Link>
        </div>
      </Layout>
    );
  }

  const a = articleQ.data;
  const videos = a.videos || [];

  return (
    <Layout>
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <Link to="/knowledge" className="inline-flex items-center gap-1 hover:text-primary">
          <ArrowLeft className="w-3 h-3" />
          Base de Conhecimento
        </Link>
        {a.category_slug && (
          <>
            <span>/</span>
            <Link
              to={`/knowledge?cat=${a.category_slug}`}
              className="hover:text-primary"
            >
              {a.category_name}
            </Link>
          </>
        )}
      </nav>

      {/* Title + meta */}
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          {a.title}
        </h1>
        {a.summary && (
          <p className="text-base text-gray-600 dark:text-gray-400">
            {a.summary}
          </p>
        )}
        <p className="text-xs text-gray-400">
          Atualizado em {new Date(a.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </header>

      {/* Content */}
      {a.content && (
        <section className="card p-6">
          <MarkdownRenderer content={a.content} />
        </section>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <VideoIcon className="w-5 h-5 text-primary" />
            Vídeos tutoriais
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {videos.map((v) => (
              <div key={v.id} className="card overflow-hidden">
                <VideoPlayer
                  url={v.url}
                  title={v.title}
                  contentType={v.content_type}
                  durationSeconds={v.duration_seconds}
                />
                <div className="p-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                    {v.title || 'Vídeo'}
                  </span>
                  {v.duration_seconds > 0 && (
                    <span className="text-xs text-gray-500 tabular-nums">
                      {formatDuration(v.duration_seconds)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
    </Layout>
  );
}
