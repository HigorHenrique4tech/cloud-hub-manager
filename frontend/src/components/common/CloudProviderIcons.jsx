/**
 * Cloud provider brand SVG icons — transparent background, no external dependencies.
 * All icons accept a `className` prop (works with Tailwind w-* h-* classes).
 */

/**
 * AWS — orange "aws" wordmark + iconic smile arrow
 */
export const AwsIcon = ({ className }) => (
  <svg
    viewBox="0 0 44 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Amazon Web Services"
  >
    {/* Letter A */}
    <path
      d="M1.5 21 L6 7 L10.5 21"
      stroke="#FF9900"
      strokeWidth="2.4"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line x1="3" y1="16.5" x2="9" y2="16.5" stroke="#FF9900" strokeWidth="2.4" strokeLinecap="round" />

    {/* Letter W */}
    <path
      d="M13 7 L15.5 19 L18.5 11 L21.5 19 L24 7"
      stroke="#FF9900"
      strokeWidth="2.4"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* Letter S */}
    <path
      d="M33 9.5 C33 7.5 31.5 6.5 29.5 6.5 C27 6.5 26.5 8 26.5 9.5 C26.5 11.5 30.5 12.5 30.5 15 C30.5 16.5 29.5 17.5 27.5 17.5 C25.5 17.5 24.5 16.5 24.5 14.5"
      stroke="#FF9900"
      strokeWidth="2.4"
      fill="none"
      strokeLinecap="round"
    />

    {/* Smile arc */}
    <path
      d="M3 25 Q22 32 41 25"
      stroke="#FF9900"
      strokeWidth="2.2"
      fill="none"
      strokeLinecap="round"
    />
    {/* Arrow head */}
    <polyline
      points="37,22 42,25 37,28"
      stroke="#FF9900"
      strokeWidth="2.2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Microsoft Azure — the iconic angular "A" mark in blue
 */
export const AzureIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Microsoft Azure"
  >
    {/* Left panel — diagonal strip */}
    <path d="M3 22 L10.5 3 L14.5 3 L9.5 14 L17 14 Z" fill="#0078D4" />
    {/* Right panel — vertical strip */}
    <path d="M10.5 22 L21 22 L14.5 10 L11.5 17 Z" fill="#0078D4" />
  </svg>
);

/**
 * Google Cloud Platform — the iconic 4-color arrangement (Google brand colors)
 */
export const GcpIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Google Cloud Platform"
  >
    <rect x="2"  y="2"  width="9" height="9" rx="2" fill="#EA4335" />
    <rect x="13" y="2"  width="9" height="9" rx="2" fill="#4285F4" />
    <rect x="2"  y="13" width="9" height="9" rx="2" fill="#FBBC05" />
    <rect x="13" y="13" width="9" height="9" rx="2" fill="#34A853" />
  </svg>
);
