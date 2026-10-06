// Import explicite : l'API `bundle()` de Remotion compile le JSX en mode classique.
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Le jeu d'icônes du site (`frontend/src/components/icons.tsx`) : mêmes tracés,
 * même grille 24 × 24, même trait de 1,5.
 */
const PATHS = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M20 6L9 17l-5-5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 18l-6-6 6-6" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0114.4 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 19.5a6.4 6.4 0 0112.4 0" />
      <path d="M16.5 5.2a3.2 3.2 0 010 5.9M18 14.2a6.4 6.4 0 013.2 5.3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 10-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5z" />
      <path d="M13.7 19a2 2 0 01-3.4 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M6 9.8V19a1 1 0 001 1h10a1 1 0 001-1V9.8" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  gallery: (
    <>
      <rect x="3" y="3.5" width="12" height="12" rx="2" />
      <path d="M9 20.5h9a2.5 2.5 0 002.5-2.5V9" />
      <path d="M3.5 12.8l2.6-2.4a2 2 0 012.7 0L15 16" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="M3.5 16.5l4.6-4.2a2 2 0 012.7 0l4 3.7M14.5 15l1.9-1.7a2 2 0 012.7 0l1.4 1.3" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="5.5" width="13" height="13" rx="2.5" />
      <path d="M15.5 10l4.3-2.6a.8.8 0 011.2.7v7.8a.8.8 0 01-1.2.7L15.5 14" />
    </>
  ),
  play: <path d="M8 5.5l10 6.5-10 6.5V5.5z" />,
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="2.8" />
      <path d="M3 7v4.5c0 1.55 2.7 2.8 6 2.8s6-1.25 6-2.8V7" />
      <path d="M15 11.2c3.1.15 6 1.35 6 2.8V18c0 1.55-2.7 2.8-6 2.8s-6-1.25-6-2.8v-3.4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5" />
      <path d="M4 17v1.5A2.5 2.5 0 006.5 21h11a2.5 2.5 0 002.5-2.5V17" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5v-11M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4 17v1.5A2.5 2.5 0 006.5 21h11a2.5 2.5 0 002.5-2.5V17" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5a8 8 0 10-2.1 6.1" />
      <path d="M20.5 5.5V11H15" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  color = 'currentColor',
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block', ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Le spinner du site, tourné image par image (pas d'animation CSS en rendu). */
export function Spinner({
  frame,
  size = 20,
  color = 'currentColor',
}: {
  frame: number;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      style={{ flexShrink: 0, display: 'block', transform: `rotate(${frame * 12}deg)` }}
    >
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={2.5} opacity={0.25} />
      <path d="M21 12a9 9 0 00-9-9" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}
