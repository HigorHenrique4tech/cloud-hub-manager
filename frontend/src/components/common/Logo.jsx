const SIZES = { sm: 24, md: 32, lg: 48 };

export default function Logo({ size = 'md', showText = true, variant = 'default' }) {
  const px = SIZES[size] || SIZES.md;
  const textCls = variant === 'light'
    ? 'text-white'
    : 'text-gray-900 dark:text-gray-100';
  const fontSize = px <= 24 ? 'text-sm' : px <= 32 ? 'text-lg' : 'text-2xl';

  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <svg width={px} height={px} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="logo-grad" x1="5" y1="4" x2="43" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1E6FD9" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>
        {/* Hexagon outline */}
        <path
          d="M24 4L43 14V34L24 44L5 34V14L24 4Z"
          stroke="url(#logo-grad)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Inner filled circle — the "hub" */}
        <circle cx="24" cy="24" r="8" fill="url(#logo-grad)" />
        {/* Three connection dots */}
        <circle cx="24" cy="10" r="2.5" fill="url(#logo-grad)" opacity="0.6" />
        <circle cx="12" cy="34" r="2.5" fill="url(#logo-grad)" opacity="0.6" />
        <circle cx="36" cy="34" r="2.5" fill="url(#logo-grad)" opacity="0.6" />
      </svg>
      {showText && (
        <span className={`font-bold tracking-tight ${textCls} ${fontSize}`}>
          Cloud<span className="text-primary">Atlas</span>
        </span>
      )}
    </div>
  );
}