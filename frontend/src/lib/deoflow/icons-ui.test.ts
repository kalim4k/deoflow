import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Les trois icônes de l'application doivent rester cohérentes.
 *
 * Le fichier source est en RVB sans canal alpha : ses coins arrondis sont
 * PEINTS en noir. Régénérer une icône sans le masque la fait ressortir avec un
 * carré noir autour de la forme — invisible sur une maquette sombre, criant sur
 * l'interface claire de Deoflow.
 *
 * Et l'icône iOS suit la règle INVERSE : Apple applique son propre masque et ne
 * gère pas la transparence. Une icône transparente y apparaît sur fond noir.
 * Les deux exigences sont contradictoires, donc faciles à confondre — d'où ces
 * vérifications plutôt qu'une consigne dans un README.
 *
 * On lit les octets du PNG directement : décoder l'image demanderait `sharp`
 * dans l'environnement de test, alors que l'en-tête suffit à répondre.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(here, '../../..');

/** En-tête PNG : signature 8 octets, puis le chunk IHDR. */
function readIhdr(path: string) {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('latin1'), `${path} n’est pas un PNG`).toBe('PNG');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    // 6 = RVB + alpha, 2 = RVB sans alpha, 4 = gris + alpha, 0 = gris.
    colorType: buf.readUInt8(25),
    bytes: buf.length,
  };
}

const ICONS = [
  { file: 'src/app/icon.png', size: 256, alpha: true, why: 'onglet du navigateur' },
  { file: 'src/app/apple-icon.png', size: 180, alpha: false, why: 'écran d’accueil iOS' },
  { file: 'src/components/brand/deoflow-icon.png', size: 192, alpha: true, why: 'composant Logo' },
] as const;

describe('icônes de l’application', () => {
  it.each(ICONS)('$file fait $size px ($why)', ({ file, size }) => {
    const { width, height } = readIhdr(resolve(FRONTEND, file));
    expect(width).toBe(size);
    expect(height).toBe(size);
  });

  it.each(ICONS.filter((i) => i.alpha))('$file garde ses coins transparents', ({ file }) => {
    // colorType 6 = RVB + alpha. Sans canal alpha, le masque n'a pas été
    // appliqué et les coins noirs de la source sont toujours là.
    expect(readIhdr(resolve(FRONTEND, file)).colorType).toBe(6);
  });

  it('src/app/apple-icon.png reste opaque', () => {
    // colorType 2 = RVB sans alpha. iOS masque lui-même ; une icône
    // transparente s'afficherait sur un fond noir qu'on n'a pas choisi.
    expect(readIhdr(resolve(FRONTEND, 'src/app/apple-icon.png')).colorType).toBe(2);
  });

  it('aucune icône ne dépasse 120 Ko', () => {
    // La cible est sur 4G instable : une icône d'onglet à 1 Mo se paierait à
    // chaque première visite. La source en fait 1,1 — le rappel n'est pas vain.
    for (const { file } of ICONS) {
      const ko = statSync(resolve(FRONTEND, file)).size / 1024;
      expect(ko, `${file} pèse ${ko.toFixed(0)} Ko`).toBeLessThan(120);
    }
  });

  it('le composant Logo n’ajoute pas d’arrondi CSS par-dessus le dessin', () => {
    // À 36 px, `rounded-xl` découpe à 12 px là où le dessin s'arrondit à 8 :
    // les bords de la carte seraient rognés.
    const src = readFileSync(resolve(FRONTEND, 'src/components/Logo.tsx'), 'utf8');
    const img = src.slice(src.indexOf('<Image'), src.indexOf('/>', src.indexOf('<Image')));
    expect(img).not.toMatch(/rounded-/);
  });
});
