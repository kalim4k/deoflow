/**
 * Injection de l'avatar dans un prompt de génération.
 *
 * Partagé navigateur et serveur, comme `capabilities.ts` : l'atelier affiche le
 * prompt composé pour que le créateur voie ce qu'il envoie, mais c'est le
 * serveur qui le refabrique avant de payer le fournisseur. Une seule fonction
 * pour les deux, sinon l'affiché et l'envoyé divergeront un jour.
 */

export interface AvatarPromptSource {
  name: string;
  /** Texte libre : corps, tenue, style, caractère. */
  description: string;
}

/**
 * Compose le prompt final : le personnage, puis la scène.
 *
 * L'ordre n'est pas arbitraire — ces modèles pondèrent plus fortement le début
 * du prompt. Mettre la scène d'abord donne des images où le décor est juste et
 * le personnage approximatif, c'est-à-dire l'inverse de ce qu'on cherche.
 *
 * Le nom de l'avatar n'est PAS envoyé : « Awa » n'apprend rien au modèle sur
 * une apparence, et un prénom peut tirer la génération vers des stéréotypes
 * que le créateur n'a pas demandés. Il ne sert qu'à l'interface.
 */
export function composePrompt(
  avatar: AvatarPromptSource | null | undefined,
  scenePrompt: string,
): string {
  const scene = scenePrompt.trim();
  const character = avatar?.description.trim() ?? '';

  if (character.length === 0) return scene;
  if (scene.length === 0) return character;

  // Point final ajouté seulement s'il manque : « mince.. » se voit.
  const closed = /[.!?…]$/.test(character) ? character : `${character}.`;
  return `${closed} ${scene}`;
}

/**
 * Vrai quand la description de l'avatar ajoutera réellement quelque chose.
 * L'atelier s'en sert pour n'afficher le prompt composé que s'il diffère.
 */
export function enrichesPrompt(avatar: AvatarPromptSource | null | undefined): boolean {
  return (avatar?.description.trim().length ?? 0) > 0;
}
