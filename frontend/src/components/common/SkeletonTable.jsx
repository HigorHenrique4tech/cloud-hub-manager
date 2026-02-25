const SkeletonTable = ({ columns = 5, rows = 5, hasCheckbox = false }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full animate-pulse">
      <thead className="bg-gray-50 dark:bg-gray-900/50">
        <tr>
          {hasCheckbox && (
            <th className="w-10 px-3 py-3">
              <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
            </th>
          )}
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i} className="px-6 py-3">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {hasCheckbox && (
              <td className="px-3 py-4">
                <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
              </td>
            )}
            {Array.from({ length: columns }).map((_, c) => (
              <td key={c} className="px-6 py-4">
                <div
                  className={`h-4 bg-gray-200 dark:bg-gray-700 rounded ${
                    c === 0 ? 'w-32' : c % 2 === 0 ? 'w-24' : 'w-16'
                  }`}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default SkeletonTable;
