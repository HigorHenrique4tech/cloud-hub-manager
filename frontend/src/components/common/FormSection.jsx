const FormSection = ({ title, description, children }) => (
  <div className="border-b border-gray-200 dark:border-gray-700 pb-6 mb-6 last:border-0 last:pb-0 last:mb-0">
    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
    {description && (
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>
    )}
    <div className="space-y-4">{children}</div>
  </div>
);

export default FormSection;
