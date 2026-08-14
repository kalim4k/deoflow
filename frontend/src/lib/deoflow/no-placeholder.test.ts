import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import fg from 'fast-glob';

/**
 * Aucun écran ne montre de contenu simulé.
 *
 * Trois mentions traînaient jusqu'ici, toutes fausses depuis que la génération
 * réelle tourne sur kie.ai :
 *
 *   - `/gallery/[id]` affichait « Aperçu simulé : la génération réelle sera
 *     branchée » **sans condition**, sur une création que le client venait de
 *     payer. Annoncer à un acheteur que son résultat est une simulation est le
 *     plus coûteux des trois, et le plus silencieux : rien ne casse.
 *   - `/models/[slug]` présentait trois vignettes SVG portant « aperçu simulé »
 *     incrusté dans l'image, sur la fiche d'un modèle payant.
 *   - La page d'accueil annonçait « 4,8/5 » et « 500+ créateurs déjà inscrits ».
 *     Ces nombres étaient inventés.
 *
 * Ce test interdit leur retour. Il vaut par ce qu'il empêche : ce genre de
 * texte s'écrit pendant qu'une fonctionnalité est en chantier, puis survit à
 * son chantier — parce que rien ne le signale une fois qu'il est devenu faux.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(here, '../../..');

const files = fg.sync(['src/app/**/*.tsx', 'src/components/**/*.tsx'], {
  cwd: FRONTEND,
  absolute: true,
  ignore: ['**/*.test.tsx'],
});

/**
 * Le fichier privé de ses commentaires. Les commentaires expliquent justement
 * ce qui a été retiré et citent donc les formules interdites : sans ce
 * dépouillement, le garde-fou se déclencherait sur sa propre justification.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Formules qui annoncent au visiteur que ce qu'il voit n'est pas réel. */
const AVEUX = [/aperçus?\s+simulé/i, /pas\s+encore\s+branché/i, /sera\s+branché/i];

describe('aucun écran n’affiche de contenu simulé', () => {
  it('aucun texte n’annonce une simulation à l’utilisateur', () => {
    const coupables: string[] = [];
    for (const file of files) {
      const src = code(file);
      for (const motif of AVEUX) {
        if (motif.test(src)) coupables.push(`${relative(FRONTEND, file)} → ${motif}`);
      }
    }
    expect(coupables).toEqual([]);
  });

  it('aucun écran n’importe le générateur d’aperçus', () => {
    // `placeholder.ts` dessine des SVG estampillés « aperçu simulé ». Il reste
    // dans le dépôt pour la couche `client.ts` résiduelle, mais plus aucune
    // surface visible ne doit y toucher.
    const coupables = files
      .filter((f) => /from '@\/lib\/deoflow\/placeholder'/.test(code(f)))
      .map((f) => relative(FRONTEND, f));
    expect(coupables).toEqual([]);
  });

  it('la page d’accueil n’affiche ni note ni audience inventées', () => {
    // Une note et un nombre d'inscrits fictifs sur une page de vente, c'est de
    // la publicité trompeuse. Le jour où ces chiffres existent, ils viendront
    // d'une route d'agrégation.
    const accueil = code(resolve(FRONTEND, 'src/app/page.tsx'));
    expect(accueil).not.toMatch(/SOCIAL_PROOF/);
    expect(accueil).not.toMatch(/\d+\s*\+?\s*créateurs déjà inscrits/i);
    expect(accueil).not.toMatch(/\d[,.]\d\s*\/\s*5/);
  });
});
