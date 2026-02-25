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
 * Google Cloud Platform — cloud silhouette with Google brand color arc
 * Outer cloud: divided into 4 Google colors (red/blue top, yellow/green bottom)
 * Inner cloud: white fill creating the colored ring effect
 */
export const GcpIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Google Cloud Platform"
  >
    <defs>
      <clipPath id="gcp-cloud-outer">
        {/* Outer cloud silhouette */}
        <path d="M20.5 9.8C20 6.7 17.4 4.3 14.2 4.3c-1.9 0-3.7.9-4.9 2.3C8.7 6.1 8 5.8 7.2 5.8 5.1 5.8 3.4 7.4 3.4 9.5c0 .2 0 .5.1.7C2 10.8 1.2 12.2 1.2 13.7c0 2.5 2 4.5 4.5 4.5h13.2c2.1 0 3.8-1.7 3.8-3.8 0-1.8-1.2-3.3-2.9-3.7-.1-.3-.2-.6-.3-.9z" />
      </clipPath>
    </defs>

    {/* Red — top-left */}
    <rect x="0" y="0" width="12" height="11" fill="#EA4335" clipPath="url(#gcp-cloud-outer)" />
    {/* Blue — top-right */}
    <rect x="12" y="0" width="12" height="11" fill="#4285F4" clipPath="url(#gcp-cloud-outer)" />
    {/* Yellow — bottom-left */}
    <rect x="0" y="11" width="12" height="13" fill="#FBBC05" clipPath="url(#gcp-cloud-outer)" />
    {/* Green — bottom-right */}
    <rect x="12" y="11" width="12" height="13" fill="#34A853" clipPath="url(#gcp-cloud-outer)" />

    {/* White inner cloud — creates the colored ring/border effect */}
    <path
      d="M18.8 11.7c-.5-2.3-2.6-4-5-4-1.6 0-3.1.8-4 2.1-.5-.2-1-.4-1.6-.4-1.8 0-3.2 1.4-3.2 3.2 0 .2 0 .4.1.5C3.9 13.6 3 14.7 3 16c0 1.6 1.3 2.8 2.9 2.8h11.3c1.6 0 2.9-1.3 2.9-2.9 0-1.4-.9-2.5-2.2-2.8-.1-.2-.1-.3-.1-.4z"
      fill="white"
    />
  </svg>
);
