import { Link } from 'react-router-dom';
import { Video, ChevronRight, BookOpen, Clock } from 'lucide-react';
import * as Icons from 'lucide-react';
import { estimateReadingTime } from '../../utils/formatters';

function CategoryIcon({ name, className }) {
  if (!name) return <BookOpen className={className} />;
  const Lucide = Icons[name] || BookOpen;
  return <Lucide className={className} />;
}

export default function ArticleCard({ article, featured = false }) {
  const readingMin = estimateReadingTime(article.content || article.summary || '');
  const hasVideos = article.video_count > 0;

  if (featured) {
    return (
      <Link
        to={`/knowledge/${article.slug}`}
        className="group card-interactive p-5 md:p-6 flex gap-5 items-start border-primary/30"
      >
        <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20 flex items-center justify-center text-primary">
          <CategoryIcon name={article.category_icon} className="w-6 h-6 md:w-7 md:h-7" />
        </div>
        <div className="flex-1 min-w-0">
          {article.category_name && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold uppercase tracking-wide mb-2">
              {article.category_name}
            </span>
          )}
          <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary transition-colors line-clamp-2">
            {article.title}
          </h3>
          {article.summary && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">
              {article.summary}
            </p>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
            {hasVideos && (
              <span className="inline-flex items-center gap-1">
                <Video className="w-3.5 h-3.5" />
                {article.video_count} vídeo{article.video_count > 1 ? 's' : ''}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              ~{readingMin} min de leitura
            </span>
          </div>
        </div>
        <ChevronRight className="hidden md:block w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all self-center" />
      </Link>
    );
  }

  return (
    <Link
      to={`/knowledge/${article.slug}`}
      className="group card-interactive p-5 flex flex-col gap-2"
    >
      {article.category_name && (
        <span className="inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold uppercase tracking-wide">
          <CategoryIcon name={article.category_icon} className="w-3 h-3" />
          {article.category_name}
        </span>
      )}
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary transition-colors line-clamp-2">
        {article.title}
      </h3>
      {article.summary && (
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
          {article.summary}
        </p>
      )}
      <div className="flex items-center justify-between mt-auto pt-2">
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {hasVideos && (
            <span className="inline-flex items-center gap-1">
              <Video className="w-3.5 h-3.5" />
              {article.video_count}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            ~{readingMin} min
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}
