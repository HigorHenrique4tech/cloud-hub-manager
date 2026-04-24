import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components = {
  h1: (p) => <h1 {...p} className="text-2xl font-bold mt-6 mb-3 text-gray-900 dark:text-gray-100" />,
  h2: (p) => <h2 {...p} className="text-xl font-semibold mt-6 mb-3 text-gray-900 dark:text-gray-100" />,
  h3: (p) => <h3 {...p} className="text-lg font-semibold mt-5 mb-2 text-gray-900 dark:text-gray-100" />,
  h4: (p) => <h4 {...p} className="text-base font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100" />,
  p:  (p) => <p  {...p} className="text-sm leading-relaxed mb-3 text-gray-700 dark:text-gray-300" />,
  ul: (p) => <ul {...p} className="list-disc pl-6 mb-3 space-y-1 text-sm text-gray-700 dark:text-gray-300" />,
  ol: (p) => <ol {...p} className="list-decimal pl-6 mb-3 space-y-1 text-sm text-gray-700 dark:text-gray-300" />,
  li: (p) => <li {...p} className="leading-relaxed" />,
  a:  ({ node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" />,
  strong: (p) => <strong {...p} className="font-semibold text-gray-900 dark:text-gray-100" />,
  em: (p) => <em {...p} className="italic" />,
  code: ({ inline, ...p }) =>
    inline
      ? <code {...p} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[0.85em] text-primary font-mono" />
      : <code {...p} className="block font-mono text-sm" />,
  pre: (p) => <pre {...p} className="bg-gray-900 text-gray-100 p-4 rounded-lg border border-gray-800 overflow-x-auto mb-3 text-sm" />,
  blockquote: (p) => (
    <blockquote
      {...p}
      className="border-l-4 border-primary bg-gray-50 dark:bg-gray-800/50 py-2 px-4 my-3 text-sm text-gray-700 dark:text-gray-300"
    />
  ),
  hr: (p) => <hr {...p} className="my-6 border-gray-200 dark:border-gray-700" />,
  img: (p) => <img {...p} className="rounded-lg border border-gray-200 dark:border-gray-700 my-3 max-w-full" alt={p.alt || ''} />,
  table: (p) => (
    <div className="overflow-x-auto mb-3">
      <table {...p} className="text-sm border-collapse w-full" />
    </div>
  ),
  th: (p) => <th {...p} className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-left font-semibold" />,
  td: (p) => <td {...p} className="border border-gray-200 dark:border-gray-700 px-3 py-2" />,
};

export default function MarkdownRenderer({ content = '' }) {
  return (
    <div className="text-gray-700 dark:text-gray-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
