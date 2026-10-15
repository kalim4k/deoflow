/**
 * Gabarit de Replace — le « prompt maître » envoyé à MiniMax H3.
 *
 * Replace remplace la personne d'une vidéo par un personnage : même
 * chorégraphie, même caméra, même décor. Le créateur n'écrit pas ce prompt :
 * il fournit une vidéo, un personnage et, s'il veut, une précision. Le serveur
 * assemble le reste ici.
 *
 * Ce texte vient d'un essai réel (octobre 2026) où deux variantes ont tourné
 * sur la même vidéo : un gabarit générique, et le même gabarit complété d'un
 * découpage seconde par seconde. Les deux ont remplacé la personne ; seul le
 * second a tenu le rythme des gestes. D'où l'analyse de la vidéo par Gemini
 * (`lib/server/replace/analysis.ts`), dont les sections viennent remplir
 * celles d'ici — et d'où le repli générique, qui reste un bon résultat quand
 * l'analyse échoue.
 *
 * Partagé navigateur et serveur, sans dépendance : l'atelier a besoin de la
 * place laissée au créateur, que ce gabarit détermine.
 */

/** Limite du prompt chez MiniMax H3 (`minimax-h3/reference-to-video`). */
export const REPLACE_PROVIDER_MAX = 7_000;

/**
 * Place laissée au texte du créateur — description de l'avatar ET précision
 * libre, comptées ensemble comme partout ailleurs (`composePrompt`).
 *
 * Fixée, pas calculée à la volée : c'est une promesse affichée dans l'atelier.
 * `replacePrompt.test.ts` vérifie que gabarit + analyse au maximum + ce budget
 * tiennent dans `REPLACE_PROVIDER_MAX` ; un gabarit qui grossit fait échouer ce
 * test au lieu de faire refuser des générations par le fournisseur.
 */
export const REPLACE_CREATOR_MAX = 3_000;

/** Plafonds par section d'analyse — ce qui dépasse est coupé au mot. */
export const ANALYSIS_LIMITS = {
  character: 500,
  motion: 1_100,
  camera: 250,
  location: 250,
} as const;

/** Ce que l'analyse de la vidéo et de l'image apporte. Tout est facultatif sauf le mouvement. */
export interface ReplaceAnalysis {
  /** Apparence du personnage, lue sur l'image de référence. */
  character?: string | null;
  /** Lignes « début–fin s : action », dans l'ordre. */
  motion: string;
  camera?: string | null;
  location?: string | null;
}

export interface ReplacePromptInput {
  /** Durée du rendu, en secondes entières — celle de la vidéo coupée. */
  seconds: number;
  /** Description de l'avatar choisi, écrite par le créateur. */
  avatarDescription?: string | null;
  /** Précision libre du créateur. */
  note?: string | null;
  /** Analyse de la vidéo ; `null` quand elle a échoué — le gabarit générique prend le relais. */
  analysis?: ReplaceAnalysis | null;
}

/** Une ligne : les retours à la ligne d'un champ libre casseraient la structure du prompt. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Coupe au dernier mot entier sous `max` caractères. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd();
}

/** Coupe un bloc de lignes à la dernière ligne entière : une ligne tronquée décrirait un geste à moitié. */
function clipLines(text: string, max: number): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > max) break;
    kept.push(line);
    length += line.length + 1;
  }
  return kept.length > 0 ? kept.join('\n') : clip(oneLine(text), max);
}

const NOTE_LABEL = 'CREATOR NOTE (apply it without changing the motion): ';

export function buildReplacePrompt(input: ReplacePromptInput): string {
  const seconds = Math.max(1, Math.round(input.seconds));
  const analysis = input.analysis ?? null;

  const character = analysis?.character?.trim()
    ? clip(oneLine(analysis.character), ANALYSIS_LIMITS.character)
    : 'exactly as shown in the reference image — same face, skin tone, hair, build and outfit.';
  const avatar = input.avatarDescription?.trim() ? oneLine(input.avatarDescription) : '';
  const note = input.note?.trim() ? oneLine(input.note) : '';

  const motion = analysis?.motion.trim()
    ? clipLines(analysis.motion, ANALYSIS_LIMITS.motion)
    : `Follow the reference video exactly: every step, turn, pose and gesture happens at the same moment, for the full ${seconds} seconds.`;
  const camera = analysis?.camera?.trim()
    ? clip(oneLine(analysis.camera), ANALYSIS_LIMITS.camera)
    : 'identical to the reference video — same framing, same height, same movements at the same moments.';
  const location = analysis?.location?.trim()
    ? clip(oneLine(analysis.location), ANALYSIS_LIMITS.location)
    : 'the same place as the reference video, with the same light.';

  return [
    'TASK: character replacement. Recreate the reference video shot for shot — same movements, same timing, same camera, same location — but the person performing it is the character from the reference image. The original person of the reference video must never appear.',
    '',
    'REFERENCE ROLES',
    '- Reference video: the source of body motion, poses, gestures, timing, camera framing, camera movement, location, lighting and color grade. It is NOT a source of identity: never take the face, hair, skin tone, body or clothing from it.',
    '- Reference image: the ONLY source of the character’s identity — face, skin tone, hair, build — and outfit. Ignore its background and its pose.',
    '',
    `THE CHARACTER (identical in every frame): ${character}`,
    ...(avatar ? [`Creator’s description of the character: ${avatar}`] : []),
    'Anything the person holds in the reference video (bag, phone, cup…) stays in the same hand. Clothing or footwear not visible in the reference image follows the reference video.',
    '',
    `MOTION (follow the reference video exactly, ${seconds} seconds)`,
    motion,
    '',
    `CAMERA: ${camera}`,
    '',
    `LOCATION AND LIGHT: ${location} Same white balance and grain as the reference video.`,
    ...(note ? ['', `${NOTE_LABEL}${note}`] : []),
    '',
    'CONSTRAINTS: only the main person of the reference video is replaced; anyone else in it stays as they are. The character’s face, hair and outfit stay consistent from the first frame to the last, including in side and back views. Photorealistic, natural skin texture, fabric that moves realistically, correct hands with five fingers, no morphing, no flicker, no text, no watermark.',
    '',
    'SOUND: soft room tone only, no voice, no music.',
  ].join('\n');
}

/**
 * Ce que la galerie montre d'une génération Replace : la précision du
 * créateur, pas le gabarit technique en anglais qu'il n'a pas écrit.
 */
export function replaceDisplayPrompt(prompt: string): string {
  const line = prompt.split('\n').find((l) => l.startsWith(NOTE_LABEL));
  return line ? line.slice(NOTE_LABEL.length).trim() : '';
}
