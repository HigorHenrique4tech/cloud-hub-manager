import { createContext, useContext, useMemo, useEffect } from 'react';
import { useOrgWorkspace } from './OrgWorkspaceContext';

const BrandingContext = createContext(null);

const DEFAULT_BRANDING = {
  platform_name: 'CloudAtlas',
  logo_light_url: '/logo.png',
  logo_dark_url: '/logoblack.png',
  favicon_url: null,
  color_primary: '#1E6FD9',
  color_accent: '#0EA5E9',
  powered_by: true,
  email_sender_name: 'CloudAtlas',
  is_white_labeled: false,
};

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

export function BrandingProvider({ children }) {
  const { currentOrg } = useOrgWorkspace();

  const branding = useMemo(() => {
    const b = currentOrg?.branding;
    if (!b) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...b };
  }, [currentOrg?.branding]);

  // Apply CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-brand-primary', hexToRgb(branding.color_primary));
    root.style.setProperty('--color-brand-accent', hexToRgb(branding.color_accent));
    // Also set hex versions for direct use
    root.style.setProperty('--brand-primary-hex', branding.color_primary);
    root.style.setProperty('--brand-accent-hex', branding.color_accent);
  }, [branding.color_primary, branding.color_accent]);

  // Dynamic page title
  useEffect(() => {
    document.title = branding.platform_name;
  }, [branding.platform_name]);

  // Dynamic favicon
  useEffect(() => {
    if (branding.favicon_url) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = branding.favicon_url;
    }
  }, [branding.favicon_url]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext) || DEFAULT_BRANDING;
