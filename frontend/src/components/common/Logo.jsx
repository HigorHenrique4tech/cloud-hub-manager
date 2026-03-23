import { useTheme } from '../../contexts/ThemeContext';
import { useBranding } from '../../contexts/BrandingContext';

const SIZES = { sm: 24, md: 32, lg: 48 };

export default function Logo({ size = 'md', showText = true, variant = 'default' }) {
  const { isDark } = useTheme();
  const branding = useBranding();
  const px = SIZES[size] || SIZES.md;

  const useDarkLogo = variant === 'light' || isDark;
  const logoSrc = useDarkLogo ? branding.logo_dark_url : branding.logo_light_url;

  const textCls = variant === 'light'
    ? 'text-white'
    : 'text-gray-900 dark:text-gray-100';
  const fontSize = px <= 24 ? 'text-sm' : px <= 32 ? 'text-lg' : 'text-2xl';

  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <img
        src={logoSrc}
        alt={branding.platform_name}
        width={px}
        height={px}
        className="object-contain"
      />
      {showText && (
        <span className={`font-bold tracking-tight ${textCls} ${fontSize}`}>
          {branding.is_white_labeled ? branding.platform_name : (
            <>Cloud<span className="text-primary">Atlas</span></>
          )}
        </span>
      )}
    </div>
  );
}
