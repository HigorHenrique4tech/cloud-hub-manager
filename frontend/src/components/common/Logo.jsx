import { useTheme } from '../../contexts/ThemeContext';

const SIZES = { sm: 24, md: 32, lg: 48 };

export default function Logo({ size = 'md', showText = true, variant = 'default' }) {
  const { isDark } = useTheme();
  const px = SIZES[size] || SIZES.md;

  // On light backgrounds: use colored logo. On dark backgrounds (or variant="light"): use white logo.
  const useDarkLogo = variant === 'light' || isDark;
  const logoSrc = useDarkLogo ? '/logoblack.png' : '/logo.png';

  const textCls = variant === 'light'
    ? 'text-white'
    : 'text-gray-900 dark:text-gray-100';
  const fontSize = px <= 24 ? 'text-sm' : px <= 32 ? 'text-lg' : 'text-2xl';

  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <img
        src={logoSrc}
        alt="CloudAtlas"
        width={px}
        height={px}
        className="object-contain"
      />
      {showText && (
        <span className={`font-bold tracking-tight ${textCls} ${fontSize}`}>
          Cloud<span className="text-primary">Atlas</span>
        </span>
      )}
    </div>
  );
}
