import { Link } from 'react-router-dom';
import { Video, ChevronRight, BookOpen } from 'lucide-react';
import * as Icons from 'lucide-react';

function CategoryIcon({ name, className }) {
  if (!name) return <BookOpen className={className} />;
  const Lucide = Icons[name] || BookOpen;
  return <Lucide className={className} />;
}

export default function ArticleCard({ article }) {
  return (
    <Link
      to={`/knowledge/${article.slug}`}
      className="group card p-5 flex flex-col gap-2 hover:border-primary/50 hover:shadow-md transition-all"
    >
      {article.category_name && (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <CategoryIcon name={undefined} className="w-3 h-3" />
          {article.category_name}
        </div>
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
        {article.video_count > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Video className="w-3.5 h-3.5" />
            {article.video_count} vídeo{article.video_count > 1 ? 's' : ''}
          </span>
        ) : (
          <span />
        )}
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}
