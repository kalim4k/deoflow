import { describe, it, expect } from 'vitest';
import { AI_MODELS } from './catalog';
import { capabilitiesFor, paramsFor, type ParamSpec } from './capabilities';
import { ROW_MAX_OPTIONS, isNarrow, needsTwoColumns } from './studioLayout';

/**
 * Le débordement des pistes de choix s'est produit DEUX fois, et les deux fois
 * il ne s'est vu que sur une capture d'écran envoyée par l'utilisateur. Rien
 * dans le typage ne relie le nombre d'options d'un réglage à la place qu'il
 * obtient : un modèle ajouté au catalogue avec trois formats se découvre coupé
 * en production.
 *
 * Ces tests parcourent le catalogue réel et refont le calcul de l'atelier.
 */

/** Nombre de pastilles d'un réglage ; `null` pour un interrupteur. */
function pillCount(spec: ParamSpec): number | null {
  return spec.kind === 'choice' ? spec.options.length : null;
}

/**
 * Les réglages courts d'un modèle, mode par mode — mêmes entrées que
 * `GenerationStudio`, dans le même ordre.
 */
function shortControlsOf(slug: string): { mode: string; controls: (number | null)[] }[] {
  const model = AI_MODELS.find((m) => m.slug === slug);
  const caps = capabilitiesFor(slug);
  if (!model || !caps) return [];

  return caps.modes.map((mode) => ({
    mode: mode.id,
    controls: [
      ...(model.ratios.length > 0 ? [model.ratios.length] : []),
      ...paramsFor(caps, mode).map(pillCount),
      // La durée mesurée sur un fichier ne s'affiche pas en piste — on prend
      // donc le cas le plus chargé, celui où le sélecteur est visible.
      ...(caps.duration.kind === 'choice' ? [caps.duration.values.length] : []),
    ],
  }));
}

const CASES = AI_MODELS.flatMap((m) =>
  shortControlsOf(m.slug).map((row) => ({ slug: m.slug, ...row })),
);

describe('mise en page des réglages courts', () => {
  it('couvre bien tout le catalogue', () => {
    // Sans cette garde, un `flatMap` qui rendrait un tableau vide ferait passer
    // tous les tests ci-dessous sans rien vérifier.
    expect(CASES.length).toBeGreaterThanOrEqual(AI_MODELS.length);
  });

  it.each(CASES)('$slug / $mode : aucune piste ne déborde de sa colonne', ({ controls }) => {
    const twoColumns = needsTwoColumns(controls);

    for (const count of controls) {
      if (count === null) continue; // interrupteur : toute la ligne, toujours

      // Un réglage n'occupe une demi-colonne que s'il est étroit ET que la
      // grille est effectivement en deux colonnes. Autrement dit : jamais plus
      // de deux pastilles dans une demi-largeur.
      const inHalfColumn = twoColumns && isNarrow(count);
      if (inHalfColumn) expect(count).toBeLessThanOrEqual(2);
    }
  });

  it.each(CASES)('$slug / $mode : aucune piste ne dépasse la ligne entière', ({ controls }) => {
    // Au-delà de quatre pastilles, même toute la largeur ne suffit plus : il
    // faudrait une liste déroulante. Ce test force à trancher AVANT de livrer.
    for (const count of controls) {
      if (count !== null) expect(count).toBeLessThanOrEqual(ROW_MAX_OPTIONS);
    }
  });

  it('un réglage seul prend toute la ligne', () => {
    // Le cas Kling : l'orientation était le seul paramètre et restait coincée
    // dans une demi-colonne, à rogner « Comme dans la vidéo ».
    expect(needsTwoColumns([2])).toBe(false);
  });

  it('un réglage large n’appelle pas une deuxième colonne à lui seul', () => {
    // Le cas des trois formats : un format à trois pastilles accompagné d'un
    // seul interrupteur. C'est ce comptage-là qui coupait « 16:9 ».
    expect(needsTwoColumns([3, null])).toBe(false);
  });

  it('deux réglages étroits s’apparient', () => {
    expect(needsTwoColumns([2, 2])).toBe(true);
  });

  it('un réglage large ne compte pas dans l’appariement', () => {
    // Format à 3 pastilles + définition à 2 : le format prend la ligne, la
    // définition reste seule — donc une seule colonne.
    expect(needsTwoColumns([3, 2])).toBe(false);
  });
});
