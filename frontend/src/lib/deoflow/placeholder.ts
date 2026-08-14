import type { MediaKind } from './types';

// Aperçus simulés.
//
// Tant que FAL.AI n'est pas branché, aucune image n'est réellement générée.
// On produit ici un visuel SVG DÉTERMINISTE (même prompt ⇒ même aperçu) encodé
// en data URI : aucune requête réseau, aucun CDN, rien à télécharger sur une
// connexion 4G instable.
//
// Chaque aperçu porte la mention « aperçu simulé » : il ne doit jamais être
// confondu avec un vrai rendu.

/** Hachage 32 bits stable (FNV-1a) — même chaîne, même visuel, à chaque rendu. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const RATIO_SIZES: Record<string, { w: number; h: number }> = {
  '1:1': { w: 720, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '16:9': { w: 1280, h: 720 },
};

/**
 * Aperçu simulé pour une génération.
 *
 * @param seed   Graine de détermination (on passe le prompt + l'identifiant).
 * @param kind   Image ou vidéo — la vidéo ajoute un symbole de lecture.
 * @param ratio  Ratio demandé ; les vidéos retombent sur 9:16 (format TikTok).
 */
export function previewDataUri(seed: string, kind: MediaKind, ratio: string | null): string {
  const h = hash(seed);
  const { w, h: height } = RATIO_SIZES[ratio ?? '9:16'] ?? RATIO_SIZES['9:16']!;

  // Deux teintes voisines tirées de la graine, en saturation basse : l'aperçu
  // doit rester un fond neutre, pas un visuel criard qui vole la vedette.
  const hue = h % 360;
  const hue2 = (hue + 40) % 360;
  const cx = 20 + (h % 60);
  const cy = 25 + ((h >> 8) % 50);
  const r = 22 + ((h >> 16) % 18);

  const glyph =
    kind === 'video'
      ? `<circle cx="50%" cy="50%" r="46" fill="rgba(255,255,255,.75)"/>
         <path d="M-14 -20 L26 0 L-14 20 Z" transform="translate(${w / 2 + 4} ${height / 2})" fill="hsl(${hue} 30% 30%)"/>`
      : `<g transform="translate(${w / 2} ${height / 2})" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
           <rect x="-40" y="-32" width="80" height="64" rx="10"/>
           <circle cx="-16" cy="-10" r="7"/>
           <path d="M-38 20 l22 -20 a9 9 0 0 1 12 0 l18 17"/>
         </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img" aria-label="Aperçu simulé">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 42% 72%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 38% 58%)"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${height}" fill="url(#g)"/>
  <circle cx="${(cx / 100) * w}" cy="${(cy / 100) * height}" r="${(r / 100) * w}" fill="hsl(${hue2} 45% 80%)" opacity=".45"/>
  <circle cx="${w - (cx / 100) * w}" cy="${height - (cy / 100) * height}" r="${(r / 140) * w}" fill="hsl(${hue} 50% 40%)" opacity=".25"/>
  ${glyph}
  <g transform="translate(${w / 2} ${height - 46})">
    <rect x="-92" y="-19" width="184" height="34" rx="17" fill="rgba(11,11,12,.55)"/>
    <text x="0" y="4" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#fff">aperçu simulé</text>
  </g>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Vignettes d'exemple d'une fiche modèle (F5 : au moins 2 par modèle). */
export function modelSamples(slug: string, kind: MediaKind, count = 3): string[] {
  return Array.from({ length: count }, (_, i) =>
    previewDataUri(`${slug}-sample-${i}`, kind, kind === 'video' ? '9:16' : '1:1'),
  );
}
