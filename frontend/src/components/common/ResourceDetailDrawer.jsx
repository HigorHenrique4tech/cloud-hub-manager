import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

const SkeletonRow = () => (
  <div className="flex items-center justify-between py-2 animate-pulse">
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-28" />
    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-40" />
  </div>
);

const ResourceDetailDrawer = ({
  isOpen,
  onClose,
  title,
  subtitle,
  statusText,
  statusColor,
  queryKey,
  queryFn,
  sections,
  actions,
  tags,
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const { data: detail, isLoading } = useQuery({
    queryKey: queryKey ?? ['detail'],
    queryFn: queryFn ?? (() => ({})),
    enabled: isOpen && !!queryFn,
    staleTime: 30_000,
    retry: false,
  });

  const resolvedSections = sections ? sections(detail ?? null) : [];
  const resolvedTags = typeof tags === 'function' ? tags(detail ?? null) : tags;

  const badgeClass = statusColor === 'green'
    ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
    : statusColor === 'red'
    ? 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-100'
    : statusColor === 'yellow'
    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-100'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="min-w-0 flex-1 pr-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{title || '—'}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {subtitle && <span className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</span>}
              {statusText && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>
                  {statusText}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i}>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-3 animate-pulse" />
                  <div className="space-y-1">
                    {[...Array(4)].map((_, j) => <SkeletonRow key={j} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {resolvedSections.map((section, si) => (
                section.fields?.length > 0 && (
                  <div key={si}>
                    <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                      {section.title}
                    </h3>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {section.fields.map((field, fi) => (
                        field.value !== undefined && field.value !== null && (
                          <div key={fi} className="flex items-start justify-between py-2 gap-4">
                            <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0 w-36">
                              {field.label}
                            </span>
                            <span className={`text-sm text-gray-900 dark:text-gray-100 text-right break-all ${field.mono ? 'font-mono text-xs' : ''}`}>
                              {field.value === '' ? '—' : String(field.value)}
                            </span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )
              ))}

              {/* Tags */}
              {resolvedTags && Object.keys(resolvedTags).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(resolvedTags).map(([k, v]) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono"
                      >
                        <span className="text-gray-500 dark:text-gray-400">{k}</span>
                        <span>=</span>
                        <span>{v}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {actions && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </>
  );
};

export default ResourceDetailDrawer;
