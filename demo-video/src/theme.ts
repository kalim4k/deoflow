import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';

/**
 * Jetons recopiés de `frontend/src/app/globals.css` (bloc `@theme`). Si le site
 * change de palette, c'est ici qu'il faut la reporter avant un nouveau rendu.
 */
export const C = {
  canvas: '#fafafa',
  surface: '#ffffff',
  sunken: '#f2f2f4',
  ink900: '#0b0b0c',
  ink700: '#34383f',
  ink500: '#5b5f66',
  ink300: '#8a8f98',
  line: '#e6e7ea',
  lineStrong: '#d3d5da',
  ember50: '#fff3ee',
  ember100: '#ffe1d4',
  ember500: '#ff5a1f',
  ember600: '#e2440c',
  ember700: '#b83609',
  gain50: '#ecfdf3',
  gain600: '#16a34a',
  gain700: '#15803d',
} as const;

/**
 * Space Grotesk pour les titres, comme le site. Le corps du site est en
 * `system-ui` — c'est-à-dire Roboto sur les téléphones Android de la cible :
 * on charge Roboto explicitement pour que le rendu ne dépende pas des polices
 * installées sur la machine qui le produit.
 */
export const DISPLAY = loadSpaceGrotesk('normal', {
  weights: ['500', '700'],
  subsets: ['latin', 'latin-ext'],
}).fontFamily;

export const BODY = loadRoboto('normal', {
  weights: ['400', '500', '700'],
  subsets: ['latin', 'latin-ext'],
}).fontFamily;

export const SHADOW_CARD = '0 1px 2px rgba(11, 11, 12, 0.04)';
