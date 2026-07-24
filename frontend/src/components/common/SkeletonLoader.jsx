/**
 * SkeletonLoader — variantes de loading skeleton para diferentes contextos.
 *
 * Variantes disponíveis:
 *   <SkeletonCard count={4} />           — cards do dashboard
 *   <SkeletonTable rows={5} cols={4} />  — tabela genérica
 *   <SkeletonChart type="bar|line" />    — gráfico placeholder
 *   <SkeletonText lines={3} />           — linhas de texto
 */

/* ── Base atom ─────────────────────────────────────────────────────────────── */
const Bone = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
);

/* ── SkeletonCard ──────────────────────────────────────────────────────────── */
export const SkeletonCard = ({ count = 1 }) => (
  <div className={`grid gap-4 grid-cols-1 ${
    count >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' :
    count >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' :
    count >= 2 ? 'sm:grid-cols-2' : ''
  }`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card space-y-3">
        <div className="flex items-center justify-between">
          <Bone className="h-4 w-28" />
          <Bone className="h-8 w-8 rounded-lg" />
        </div>
        <Bone className="h-8 w-20" />
        <Bone className="h-3 w-16" />
      </div>
    ))}
  </div>
);

/* ── SkeletonTable ─────────────────────────────────────────────────────────── */
export const SkeletonTable = ({ rows = 5, cols = 4 }) => (
  <div className="card overflow-hidden p-0">
    {/* Header */}
    <div className="grid gap-4 px-4 py-3 border-b border-gray-200 dark:border-gray-700"
         style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Bone key={i} className="h-3 w-full max-w-[80px]" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, ri) => (
      <div
        key={ri}
        className="grid gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: cols }).map((_, ci) => (
          <Bone
            key={ci}
            className={`h-4 ${ci === 0 ? 'w-3/4' : ci === cols - 1 ? 'w-1/2' : 'w-full'}`}
          />
        ))}
      </div>
    ))}
  </div>
);

/* ── SkeletonChart ─────────────────────────────────────────────────────────── */
export const SkeletonChart = ({ type = 'line', height = 180 }) => (
  <div className="card space-y-3">
    <div className="flex items-center justify-between">
      <Bone className="h-4 w-40" />
      <Bone className="h-4 w-20" />
    </div>
    {type === 'bar' ? (
      <div className="flex items-end gap-2" style={{ height }}>
        {[60, 80, 45, 90, 70, 55, 85, 65].map((h, i) => (
          <Bone key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    ) : (
      <Bone className="w-full rounded-lg" style={{ height }} />
    )}
  </div>
);

/* ── SkeletonText ──────────────────────────────────────────────────────────── */
export const SkeletonText = ({ lines = 3 }) => (
  <div className="space-y-2">
    {Array.from({ length: lines }).map((_, i) => (
      <Bone
        key={i}
        className={`h-4 ${
          i === lines - 1 ? 'w-3/4' : i % 2 === 0 ? 'w-full' : 'w-5/6'
        }`}
      />
    ))}
  </div>
);

/* ── Default export (generic) ─────────────────────────────────────────────── */
const SkeletonLoader = ({ variant = 'card', ...props }) => {
  switch (variant) {
    case 'table': return <SkeletonTable {...props} />;
    case 'chart': return <SkeletonChart {...props} />;
    case 'text':  return <SkeletonText {...props} />;
    default:      return <SkeletonCard {...props} />;
  }
};

export default SkeletonLoader;
