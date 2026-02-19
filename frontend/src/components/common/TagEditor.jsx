import { Plus, Trash2 } from 'lucide-react';

const TagEditor = ({ tags = [], onChange }) => {
  const addTag = () => onChange([...tags, { key: '', value: '' }]);

  const removeTag = (idx) => onChange(tags.filter((_, i) => i !== idx));

  const updateTag = (idx, field, val) =>
    onChange(tags.map((t, i) => (i === idx ? { ...t, [field]: val } : t)));

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="space-y-2">
          {tags.map((tag, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Chave"
                value={tag.key}
                onChange={(e) => updateTag(idx, 'key', e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="text"
                placeholder="Valor"
                value={tag.value}
                onChange={(e) => updateTag(idx, 'value', e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => removeTag(idx)}
                className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addTag}
        className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-dark font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Adicionar Tag
      </button>
    </div>
  );
};

export default TagEditor;
