/**
 * Génère les icônes de l'application à partir du fichier source unique.
 *
 *   pnpm --filter frontend run icons
 *
 * Pourquoi un script plutôt qu'un découpage à la main : les trois sorties
 * doivent rester cohérentes entre elles. Régénérer « celle de l'onglet » sans
 * « celle d'iOS » donne deux marques différentes selon l'appareil, et personne
 * ne s'en aperçoit avant longtemps.
 *
 * Le fichier source est en RVB SANS canal alpha : ses coins arrondis sont
 * PEINTS en noir opaque. Posé tel quel sur l'interface claire de Deoflow, il
 * afficherait un carré noir autour de la forme. Tout l'objet de ce script est
 * de remplacer ce noir par de la transparence, en épousant exactement le rayon
 * du dessin.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../..');
const SRC = resolve(REPO, 'deoflow icon/deoflow icon.png');

/**
 * Rayon des coins, en fraction du côté.
 *
 * Mesuré sur la source (274 px sur 1254) plutôt que choisi : un masque plus
 * serré rognerait le dessin, un masque plus large laisserait un liseré noir
 * dans chaque coin. C'est aussi pour ça qu'on ne met AUCUN `rounded-*` CSS
 * par-dessus à l'affichage — à 36 px, `rounded-xl` (12 px) découperait deux
 * fois plus profond que le dessin.
 */
const RADIUS_RATIO = 274 / 1254;

/**
 * Teinte de la carte relevée au bord du dessin. Sert uniquement à l'icône iOS :
 * Apple applique son propre masque arrondi et ne gère pas la transparence, donc
 * on lui fournit un carré plein. Remplir avec cette teinte plutôt qu'avec du
 * noir évite le liseré sombre que la découpe d'iOS laisserait apparaître —
 * sa courbe n'est pas tout à fait la nôtre.
 */
const CARD = '#15152d';

/** Masque un carré arrondi : ce qui déborde devient transparent. */
function roundedMask(size) {
  const r = Math.round(size * RADIUS_RATIO);
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
}

/** La source détourée à la taille voulue, coins devenus transparents. */
async function maskedPng(size) {
  return (
    sharp(SRC)
      .resize(size, size, { fit: 'cover' })
      .ensureAlpha()
      // `dest-in` ne garde la source que là où le masque est opaque.
      .composite([{ input: roundedMask(size), blend: 'dest-in' }])
      .png()
      .toBuffer()
  );
}

async function emit(size, out, { opaque = false } = {}) {
  const path = resolve(REPO, 'frontend', out);

  const masked = await maskedPng(size);

  // Deuxième passe obligatoire pour l'aplatissement : sharp exécute `flatten`
  // AVANT `composite` dans son pipeline interne, quel que soit l'ordre des
  // appels. Enchaîné sur la même instance, il aplatissait donc une image encore
  // opaque, puis le masque reperçait les coins — l'icône iOS ressortait
  // transparente malgré la consigne.
  const img = opaque ? sharp(masked).flatten({ background: CARD }) : sharp(masked);

  await img.png({ compressionLevel: 9, palette: false }).toFile(path);
  const ko = (statSync(path).size / 1024).toFixed(1);
  console.log(`  ${out.padEnd(42)} ${String(size).padStart(4)} px   ${ko.padStart(6)} Ko`);
}

console.log(`source : ${SRC}\n`);

// Convention Next.js App Router : ces deux noms de fichiers suffisent, Next
// génère les <link rel="icon"> et <link rel="apple-touch-icon"> tout seul.
await emit(256, 'src/app/icon.png');
await emit(180, 'src/app/apple-icon.png', { opaque: true });

// Copie destinée au composant Logo, importée statiquement (Next en déduit les
// dimensions et lui donne une empreinte de contenu). Séparée des deux fichiers
// ci-dessus : ce sont des conventions de routage, pas des ressources à importer.
await emit(192, 'src/components/brand/deoflow-icon.png');

// Icônes du manifeste PWA. Chemins publics figés : `src/app/manifest.ts` les
// référence en dur, et un manifeste qui pointe vers une icône absente rend
// l'application non installable — sans message d'erreur ailleurs que dans
// l'onglet « Application » des outils de développement.
await emit(192, 'public/icons/icon-192.png');
await emit(512, 'public/icons/icon-512.png');

/**
 * Icône « maskable » Android.
 *
 * Le lanceur découpe lui-même la forme — cercle chez Google, carré arrondi
 * chez Samsung, goutte ailleurs — et il la découpe DANS l'image fournie. Une
 * icône non déclarée maskable subit le sort inverse : Android la pose dans un
 * carré blanc avec une marge, ce qui se voit encore davantage. C'est ce fichier
 * qui donne les bords arrondis une fois l'application installée.
 *
 * La spécification garantit un seul endroit : la « zone de sécurité », cercle
 * de 80 % du côté (donc rayon 40 %). Mesure faite sur la source, le pictogramme
 * s'étend jusqu'à 39,3 % du centre — il tient, et on peut donc rester en pleine
 * page. Une variante réduite à 80 % aurait été plus confortable mais laissait
 * voir le contour de la carte sur le fond de remplissage : le dessin porte un
 * léger dégradé, qu'aucune couleur unie n'égale partout.
 *
 * Les coins sont remplis (`opaque`) et non transparents : ce que le lanceur
 * découpe doit être de la matière, pas du vide.
 *
 * ⚠️ Si l'icône source change, refaire la mesure. Un pictogramme qui dépasserait
 * 40 % se ferait rogner par les lanceurs circulaires — et seulement par
 * ceux-là, donc invisible sur l'appareil de test le plus probable.
 */
await emit(512, 'public/icons/maskable-512.png', { opaque: true });

console.log('\nterminé.');
