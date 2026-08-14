/**
 * Le gabarit de portrait — imposé par le serveur, jamais écrit par le créateur.
 *
 * Un avatar ne sert à rien s'il n'est pas RÉUTILISABLE. Une image de visage
 * prise dans un décor traîne ce décor dans toutes les générations suivantes :
 * le modèle ne sait pas distinguer « le personnage » de « ce qui l'entoure ».
 * Le cadrage, l'éclairage et le fond blanc sont donc des contraintes système,
 * au même titre que le prix — pas des préférences laissées au champ de saisie.
 *
 * Un créateur qui écrirait « sur une plage au coucher du soleil » obtiendrait
 * sinon un avatar inutilisable, et ne comprendrait pas pourquoi ses scènes
 * suivantes se passent toutes au bord de la mer.
 *
 * ⚠️ Honnêteté sur ce que ce gabarit peut : il ORIENTE, il ne contraint pas.
 * Une description assez insistante peut le contredire — aucun prompt ne
 * garantit son propre respect. Les tests vérifient que les clauses sont
 * présentes, pas qu'elles gagnent toujours.
 */
import 'server-only';

/**
 * Ratio imposé au portrait.
 *
 * Carré : un visage de référence n'a aucune raison d'être panoramique, et le
 * format est reconnu par les deux modèles autorisés (`apiRatios` de
 * `capabilities.ts`). Il rend aussi la grille d'avatars régulière.
 */
export const PORTRAIT_RATIO = '1:1';

/** Les seuls modèles proposés pour un visage : rapides, bons en portrait. */
export const AVATAR_MODELS = ['nano-banana-2', 'gpt-image-2'] as const;
export type AvatarModelSlug = (typeof AVATAR_MODELS)[number];

export function isAvatarModel(slug: string): slug is AvatarModelSlug {
  return (AVATAR_MODELS as readonly string[]).includes(slug);
}

/**
 * Les clauses non négociables, dans l'ordre où elles pèsent.
 *
 * Placées APRÈS la description : sur ces modèles, ce qui vient en dernier
 * cadre ce qui précède. La description dit QUI ; ces clauses disent COMMENT
 * l'image doit être faite.
 */
const CONSTRAINTS = [
  'portrait photographique en gros plan, cadrage tête et épaules uniquement',
  'visage de face, regard vers l’objectif, expression neutre et détendue',
  'fond blanc uni, parfaitement uniforme, sans ombre portée ni dégradé',
  'éclairage de studio doux et homogène, sans ombre dure sur le visage',
  'photoréaliste, netteté élevée sur les yeux',
  'aucun texte, aucun logo, aucun filigrane, aucun cadre',
  'une seule personne dans l’image',
];

/**
 * Compose le prompt de génération d'un visage d'avatar.
 *
 * @param description  texte libre du créateur — physique, style, caractère.
 * @param fromPhoto    vrai quand une photo de référence accompagne la demande :
 *                     le gabarit demande alors de PRÉSERVER les traits plutôt
 *                     que d'en inventer, sans quoi le modèle produit un visage
 *                     ressemblant « en général » mais pas à la photo fournie.
 */
export function buildPortraitPrompt(description: string, fromPhoto = false): string {
  const subject = description.trim();

  const opening = fromPhoto
    ? 'Reprendre fidèlement le visage de la personne sur l’image de référence : mêmes traits, même carnation, même morphologie du visage.'
    : 'Portrait d’une personne fictive.';

  // La description peut être vide côté photo : le visage suffit alors.
  const body = subject.length > 0 ? `${subject}.` : '';

  return [opening, body, CONSTRAINTS.join(', ') + '.'].filter(Boolean).join(' ');
}

/**
 * Ce que le créateur voit avant de payer.
 *
 * Le gabarit n'est pas un secret : montrer ce qui sera réellement envoyé évite
 * qu'il s'étonne de recevoir un fond blanc alors qu'il avait décrit une plage.
 */
export const PORTRAIT_CONSTRAINTS_SUMMARY =
  'Cadrage tête et épaules, de face, sur fond blanc uni — c’est ce qui rend le visage réutilisable dans vos scènes.';
