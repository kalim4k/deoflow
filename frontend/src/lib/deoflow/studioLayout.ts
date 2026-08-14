/**
 * Largeur des réglages courts de l'atelier (format, définition, durée…).
 *
 * Une piste à colonnes égales partage sa largeur entre ses pastilles : trois
 * pastilles dans une demi-colonne tombent sous la centaine de pixels, et le
 * libellé est coupé net — « 16:9 » devient « 16:! ». La largeur demandée par un
 * réglage se lit donc sur son NOMBRE D'OPTIONS, jamais sur sa simple présence.
 *
 * Module à part, et non une closure dans le composant : c'est une règle de
 * données autant que de mise en page, et `studioLayout.test.ts` la vérifie
 * contre tout le catalogue. Un modèle ajouté avec six durées au choix doit
 * faire échouer un test, pas se découvrir sur une capture d'écran.
 */

/** Au-delà, les pastilles d'une demi-colonne deviennent illisibles. */
export const NARROW_MAX_OPTIONS = 2;

/**
 * Au-delà, la ligne entière ne suffit plus non plus : il faudrait une liste
 * déroulante ou un curseur plutôt qu'une piste.
 */
export const ROW_MAX_OPTIONS = 4;

/**
 * Un réglage tient-il dans une demi-colonne ?
 *
 * `null` désigne un interrupteur — libellé à gauche, bascule à droite. Ce n'est
 * pas une piste, et il a toujours occupé la ligne entière.
 */
export function isNarrow(optionCount: number | null): boolean {
  return optionCount !== null && optionCount <= NARROW_MAX_OPTIONS;
}

/**
 * Faut-il passer la grille en deux colonnes ?
 *
 * Seulement s'il y a de quoi les APPARIER. Compter tous les réglages — y
 * compris ceux qui prennent la ligne entière — laissait le format seul dans une
 * demi-colonne, à rogner ses libellés pour une place que rien n'occupait à
 * côté.
 */
export function needsTwoColumns(controls: (number | null)[]): boolean {
  return controls.filter(isNarrow).length > 1;
}
