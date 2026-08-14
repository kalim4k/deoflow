// Ce que chaque modèle accepte RÉELLEMENT en entrée.
//
// `catalog.ts` décrit ce qu'on vend (nom, prix, promesse). Ce fichier-ci décrit
// le contrat d'entrée du fournisseur, relevé champ par champ dans la
// documentation kie.ai (« Gpt Image 2 Image To Image API Do.txt », à la
// racine). Ne rien deviner ici : une clé inventée ou une contrainte approximée
// produit un échec APRÈS débit du créateur.
//
// C'est la source unique de vérité des deux bouts de la chaîne :
//   - l'atelier (`GenerationStudio`) compose son formulaire à partir d'ici ;
//   - le client kie.ai (`lib/server/ai/kie.ts`) construit sa requête à partir
//     des mêmes clés — d'où `key` et `wire` sur chaque emplacement.
// Le module reste utilisable côté navigateur : aucune clé d'API, uniquement la
// forme des entrées.
//
// Trois choses que la structure doit pouvoir dire, et que la version
// précédente ne pouvait pas :
//   1. un modèle a plusieurs emplacements de natures différentes (Seedance en
//      a cinq : deux images clés, des images, des vidéos et des sons) ;
//   2. un paramètre peut modifier une contrainte d'emplacement (chez Kling,
//      l'orientation du personnage fait passer le clip de 10 s à 30 s) ;
//   3. la durée facturée n'est pas toujours choisie — elle peut être imposée
//      par le modèle, ou mesurée sur le fichier envoyé.

import type { MediaKind } from './types';

const MB = 1024 * 1024;

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_MIME = ['video/mp4', 'video/quicktime'];
const AUDIO_MIME = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/mp4',
  'audio/ogg',
];

export type SlotMedia = 'image' | 'video' | 'audio';

/**
 * Nature d'un fichier d'après son type MIME.
 *
 * C'est le fichier qui décide, jamais l'étiquette de l'emplacement : celui de
 * Gemini Omni s'appelle `image_urls` mais accepte aussi vidéos et sons. Se
 * fier au nom du champ empêcherait de mesurer la durée d'une vidéo — et donc
 * de la facturer juste.
 */
export function mediaOfMime(mimeType: string): SlotMedia {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'image';
}

/** Un emplacement de fichier, tel que le fournisseur l'attend. */
export interface MediaSlotSpec {
  /** Clé exacte dans l'objet `input` de kie.ai. */
  key: string;
  /** L'API veut-elle une chaîne unique ou un tableau ? Seedance fait les deux. */
  wire: 'string' | 'array';
  /** Nature dominante, pour le libellé. Les types réellement admis sont dans `accept`. */
  media: SlotMedia;
  requirement: 'optional' | 'required';
  maxCount: number;
  maxBytes: number;
  /** Types MIME acceptés — sert aussi à l'attribut `accept` du champ fichier. */
  accept: string[];
  label: string;
  /** Contraintes en clair, affichées sous la zone de dépôt. */
  hint: string;
  /** Bornes de durée du fichier ENVOYÉ, en secondes (vidéo / audio). */
  minSeconds?: number;
  maxSeconds?: number;
  /** Somme des durées de tous les fichiers de l'emplacement. */
  totalMaxSeconds?: number;
  /** La durée de ce fichier fixe celle du rendu — donc le prix. */
  drivesDuration?: boolean;
}

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
  /** Choisir cette valeur redéfinit une contrainte d'un emplacement. */
  constrains?: { slot: string; maxSeconds: number };
}

export type ParamSpec =
  | {
      kind: 'choice';
      key: string;
      label: string;
      hint?: string;
      default: string;
      options: ChoiceOption[];
    }
  | { kind: 'toggle'; key: string; label: string; hint?: string; default: boolean };

export type ParamValues = Record<string, string | boolean>;

/**
 * Comment la durée du rendu est déterminée. Ce n'est pas toujours un choix :
 * Veo impose la sienne, Kling la tient de la vidéo qu'on lui donne. Afficher
 * partout les mêmes boutons ferait croire à un réglage inexistant — et
 * facturerait une durée que le fournisseur ignore.
 */
export type DurationSpec =
  | { kind: 'none' }
  | { kind: 'fixed'; seconds: number }
  | { kind: 'choice'; values: number[]; default: number }
  | { kind: 'range'; min: number; max: number; step: number; default: number }
  | { kind: 'fromMedia'; slot: string };

export interface ModelMode {
  id: string;
  label: string;
  /** Une phrase : ce que ce mode fait, du point de vue du créateur. */
  description: string;
  slots: MediaSlotSpec[];
  /**
   * Nom du mode chez le fournisseur, quand il en attend un explicitement.
   *
   * Veo devine le mode d'après la présence d'images si on ne lui dit rien —
   * mais il ne peut pas distinguer « deux images = début et fin » de « deux
   * images = références ». Sans cette valeur, un mode sur deux produirait
   * autre chose que ce que le créateur a demandé, après débit.
   */
  apiMode?: string;
  /** Au moins un fichier requis parmi les emplacements — tous optionnels seuls. */
  requiresAnySlot?: boolean;
  params?: ParamSpec[];
}

export interface ModelCapabilities {
  promptRequirement: 'required' | 'optional';
  promptMaxLength: number;
  /** Formats acceptés PAR L'API (le catalogue n'en propose qu'un sous-ensemble). */
  apiRatios: string[];
  duration: DurationSpec;
  modes: ModelMode[];
  /** Paramètres communs à tous les modes du modèle. */
  params: ParamSpec[];
  /**
   * Où poser le visage d'un avatar : quel mode, quel emplacement.
   *
   * L'emplacement doit traiter l'image comme une RÉFÉRENCE de personnage, pas
   * comme une image du film : chez Veo c'est `references`, chez Nano Banana
   * `image_input`. Un emplacement qui attend la première image du plan — le
   * « Personnage » de Kling — n'est pas éligible : il reproduirait le portrait
   * sur fond blanc au lieu de s'en inspirer. D'où l'absence volontaire de ce
   * champ sur `kling-2-6`.
   *
   * Sélectionner un avatar dans l'atelier bascule sur ce mode : sans ça,
   * choisir un avatar en mode Texte ne ferait rien de visible et le créateur
   * paierait une génération sans son personnage.
   */
  characterRef?: { mode: string; slot: string };
}

/* ── Fabriques, pour ne pas recopier les mêmes contraintes ──────────────── */

function textMode(description: string): ModelMode {
  return { id: 'text', label: 'Texte', description, slots: [] };
}

function imageSlot(
  over: Partial<MediaSlotSpec> & Pick<MediaSlotSpec, 'key' | 'requirement'>,
): MediaSlotSpec {
  return {
    wire: 'array',
    media: 'image',
    maxCount: 1,
    maxBytes: 30 * MB,
    accept: IMAGE_MIME,
    label: 'Image de référence',
    hint: 'JPG, PNG ou WEBP — 30 Mo maximum.',
    ...over,
  };
}

/* ── La table ───────────────────────────────────────────────────────────── */

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'nano-banana-2': {
    promptRequirement: 'required',
    promptMaxLength: 20_000,
    apiRatios: [
      'auto',
      '1:1',
      '2:3',
      '3:2',
      '1:4',
      '4:1',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '1:8',
      '8:1',
      '9:16',
      '16:9',
      '21:9',
    ],
    duration: { kind: 'none' },
    params: [],
    characterRef: { mode: 'image', slot: 'image_input' },
    modes: [
      textMode('Décrivez l’image, le modèle la crée de zéro.'),
      {
        id: 'image',
        label: 'Images',
        description:
          'Transformez une photo, ou combinez plusieurs images en une seule scène — jusqu’à 14.',
        slots: [
          imageSlot({
            key: 'image_input',
            requirement: 'required',
            maxCount: 14,
            label: 'Images de départ',
            hint: 'Jusqu’à 14 images. JPG, PNG ou WEBP — 30 Mo chacune.',
          }),
        ],
      },
    ],
  },

  'gpt-image-2': {
    promptRequirement: 'required',
    promptMaxLength: 20_000,
    apiRatios: [
      'auto',
      '1:1',
      '3:2',
      '2:3',
      '4:3',
      '3:4',
      '16:9',
      '9:16',
      '2:1',
      '1:2',
      '3:1',
      '1:3',
      '21:9',
      '9:21',
      '5:4',
      '4:5',
    ],
    duration: { kind: 'none' },
    params: [],
    characterRef: { mode: 'image', slot: 'input_urls' },
    modes: [
      textMode('Décrivez l’image, le modèle la crée de zéro.'),
      {
        id: 'image',
        label: 'Images',
        description: 'Le modèle reprend le sujet de vos images et applique votre description.',
        slots: [
          imageSlot({
            key: 'input_urls',
            requirement: 'required',
            maxCount: 6,
            label: 'Images de départ',
            hint: 'JPG, PNG ou WEBP — 30 Mo chacune.',
          }),
        ],
      },
    ],
  },

  'veo-3-1': {
    promptRequirement: 'required',
    // Longueur non documentée côté Veo : plafond prudent, jamais dépassé par
    // le champ de saisie de toute façon.
    promptMaxLength: 5_000,
    apiRatios: ['16:9', '9:16'],
    // L'endpoint Veo n'expose aucun paramètre de durée : le clip a une
    // longueur imposée.
    duration: { kind: 'fixed', seconds: 8 },
    params: [
      {
        kind: 'choice',
        key: 'resolution',
        label: 'Définition',
        // Seul réglage de qualité ouvert au créateur de tout le catalogue : ici
        // l'écart de coût est de 5 crédits kie.ai, assez faible pour être
        // vendu. Ailleurs (2K, 4K) il double ou triple la facture.
        hint: 'La 1080p coûte un peu plus cher et rend mieux sur grand écran.',
        default: '720p',
        options: [
          // Les indices tiennent dans une pastille de piste : la phrase
          // complète est juste en dessous, dans le `hint` du paramètre.
          { value: '720p', label: '720p', hint: 'Pour TikTok' },
          { value: '1080p', label: '1080p', hint: 'Plus net' },
        ],
      },
    ],
    // `references` et non `frames` : les images clés SONT des images du film,
    // le visage d'un avatar y apparaîtrait tel quel, cadré tête-épaules sur
    // fond blanc. En référence, le modèle en reprend le personnage sans en
    // faire un plan.
    characterRef: { mode: 'references', slot: 'imageUrls' },
    modes: [
      {
        ...textMode('Décrivez la scène et le mouvement de caméra, le modèle filme.'),
        apiMode: 'TEXT_2_VIDEO',
      },
      {
        id: 'frames',
        label: 'Images clés',
        description:
          'Une image : la vidéo se construit autour d’elle. Deux : la première ouvre le plan, la seconde le referme, et le modèle compose la transition.',
        apiMode: 'FIRST_AND_LAST_FRAMES_2_VIDEO',
        slots: [
          imageSlot({
            key: 'imageUrls',
            requirement: 'required',
            maxCount: 2,
            maxBytes: 10 * MB,
            label: 'Départ, puis fin (facultative)',
            hint: 'JPG, PNG ou WEBP — 10 Mo maximum. L’ordre compte : la première image ouvre le plan.',
          }),
        ],
      },
      {
        id: 'references',
        label: 'Références',
        description:
          'Jusqu’à trois images dont le modèle reprend les éléments — un personnage, un décor, un objet — sans en faire des images du film.',
        // Indisponible sur la variante Quality de Veo : c'est le passage en
        // Lite qui l'a ouvert. Revenir en Quality supprimerait ce mode.
        apiMode: 'REFERENCE_2_VIDEO',
        slots: [
          imageSlot({
            key: 'imageUrls',
            requirement: 'required',
            maxCount: 3,
            maxBytes: 10 * MB,
            label: 'Images de référence',
            hint: 'JPG, PNG ou WEBP — 3 images maximum, 10 Mo chacune.',
          }),
        ],
      },
    ],
  },

  'kling-2-6': {
    // Seul modèle du catalogue dont le prompt est facultatif : le mouvement
    // vient de la vidéo, pas du texte. Le texte ne fait qu'ajuster le décor.
    promptRequirement: 'optional',
    promptMaxLength: 2_500,
    apiRatios: [],
    // La durée n'est ni choisie ni imposée : elle suit la vidéo de référence.
    // C'est ce qui rend les 30 s facturables — on mesure au lieu de deviner.
    duration: { kind: 'fromMedia', slot: 'video_urls' },
    params: [],
    // PAS de `characterRef` — décision produit, pas oubli.
    //
    // L'emplacement « Personnage » attend l'image de DÉPART du clip : le
    // mouvement de la vidéo est reporté sur elle telle quelle. Y injecter un
    // visage d'avatar, cadré tête-épaules sur fond blanc, produirait huit
    // secondes de portrait sur fond blanc — pas une scène. Les avatars restent
    // disponibles sur les cinq autres modèles, où le visage sert de RÉFÉRENCE
    // et non de première image.
    modes: [
      {
        id: 'motion',
        label: 'Transfert de mouvement',
        description:
          'Le mouvement et les expressions de la vidéo sont reportés sur le personnage de l’image. Les deux fichiers sont indispensables.',
        slots: [
          imageSlot({
            key: 'input_urls',
            requirement: 'required',
            maxBytes: 10 * MB,
            accept: ['image/jpeg', 'image/png'],
            label: 'Personnage',
            hint: 'JPG ou PNG — 10 Mo max, au moins 300 px de côté.',
          }),
          {
            key: 'video_urls',
            wire: 'array',
            media: 'video',
            requirement: 'required',
            maxCount: 1,
            maxBytes: 100 * MB,
            accept: VIDEO_MIME,
            label: 'Mouvement à reproduire',
            hint: 'MP4 ou MOV — 100 Mo max. La durée du clip généré sera celle de cette vidéo.',
            minSeconds: 3,
            maxSeconds: 10,
            drivesDuration: true,
          },
        ],
        params: [
          {
            kind: 'choice',
            key: 'character_orientation',
            label: 'Orientation du personnage',
            hint: 'Détermine aussi la longueur maximale de la vidéo de référence.',
            default: 'image',
            options: [
              // « De l'image » / « De la vidéo » plutôt que la phrase entière :
              // le sujet est déjà donné par le libellé du paramètre juste
              // au-dessus, et une pastille de piste n'a pas la largeur d'une
              // proposition complète.
              {
                value: 'image',
                label: 'De l’image',
                hint: 'Vidéo 10 s max',
                constrains: { slot: 'video_urls', maxSeconds: 10 },
              },
              {
                value: 'video',
                label: 'De la vidéo',
                hint: 'Vidéo 30 s max',
                constrains: { slot: 'video_urls', maxSeconds: 30 },
              },
            ],
          },
        ],
      },
    ],
  },

  'seedance-2-5': {
    promptRequirement: 'required',
    promptMaxLength: 30_000,
    apiRatios: ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
    duration: { kind: 'range', min: 1, max: 30, step: 1, default: 5 },
    params: [
      {
        kind: 'toggle',
        key: 'generate_audio',
        label: 'Générer le son',
        hint: 'Le modèle compose une bande sonore synchronisée avec l’image.',
        default: true,
      },
    ],
    characterRef: { mode: 'references', slot: 'reference_image_urls' },
    modes: [
      textMode('Décrivez la séquence — jusqu’à 30 secondes d’un seul tenant.'),
      {
        id: 'frames',
        label: 'Images clés',
        description:
          'Le modèle part de votre première image et, si vous en donnez une seconde, y aboutit.',
        slots: [
          imageSlot({
            key: 'first_frame_url',
            wire: 'string',
            requirement: 'required',
            accept: [...IMAGE_MIME, 'image/gif'],
            label: 'Première image',
            hint: 'JPG, PNG, WEBP ou GIF — 30 Mo maximum.',
          }),
          imageSlot({
            key: 'last_frame_url',
            wire: 'string',
            requirement: 'optional',
            accept: [...IMAGE_MIME, 'image/gif'],
            label: 'Dernière image',
            hint: 'Facultative : sans elle, le modèle choisit sa fin.',
          }),
        ],
      },
      {
        id: 'references',
        label: 'Références',
        description:
          'Donnez personnages, décors, mouvements ou musique ; le prompt peut y renvoyer avec @Image1, @Image2…',
        requiresAnySlot: true,
        slots: [
          imageSlot({
            key: 'reference_image_urls',
            requirement: 'optional',
            maxCount: 4,
            label: 'Images de référence',
            hint: 'Jusqu’à 4 images. JPG, PNG ou WEBP — 30 Mo chacune.',
          }),
          {
            key: 'reference_video_urls',
            wire: 'array',
            media: 'video',
            requirement: 'optional',
            maxCount: 3,
            maxBytes: 200 * MB,
            accept: VIDEO_MIME,
            label: 'Vidéos de référence',
            hint: 'Jusqu’à 3 vidéos, 30 s cumulées. MP4 ou MOV — 200 Mo chacune.',
            totalMaxSeconds: 30,
          },
          {
            key: 'reference_audio_urls',
            wire: 'array',
            media: 'audio',
            requirement: 'optional',
            maxCount: 3,
            maxBytes: 15 * MB,
            accept: AUDIO_MIME,
            label: 'Sons de référence',
            hint: 'Jusqu’à 3 pistes, 30 s cumulées. MP3, WAV, AAC ou OGG — 15 Mo chacune.',
            totalMaxSeconds: 30,
          },
        ],
      },
    ],
  },

  'gemini-omni-flash': {
    promptRequirement: 'required',
    promptMaxLength: 20_000,
    apiRatios: ['16:9', '9:16'],
    duration: { kind: 'choice', values: [4, 6, 8, 10], default: 8 },
    params: [],
    // Le plus faible des cinq sur la permanence du visage — l'écran d'avatar le
    // dit, plutôt que de laisser le créateur conclure à un bug.
    characterRef: { mode: 'image', slot: 'image_urls' },
    modes: [
      textMode('Le brouillon le plus rapide : une description suffit.'),
      {
        id: 'image',
        label: 'Références',
        description:
          'Image, vidéo ou voix : le modèle part de vos fichiers et applique votre description. Avec une vidéo, il transforme le décor, l’action ou le point de vue en gardant la scène cohérente.',
        slots: [
          imageSlot({
            key: 'image_urls',
            requirement: 'required',
            maxCount: 4,
            maxBytes: 10 * MB,
            // `image_urls` est le champ de fichiers GÉNÉRIQUE de cet endpoint,
            // malgré son nom — voir la note en fin de bloc.
            accept: [...IMAGE_MIME, ...VIDEO_MIME, ...AUDIO_MIME],
            label: 'Fichiers de départ',
            hint: 'Images, vidéo ou son — 10 Mo par fichier, 4 au maximum.',
            // Avec une vidéo en entrée, le modèle décide seul de la longueur du
            // rendu : le sélecteur de durée devient sans effet, et la facture
            // suit la durée du fichier fourni.
            drivesDuration: true,
            maxSeconds: 30,
          }),
        ],
      },
    ],
    // ⚠️ Point à confirmer sur le premier appel réel.
    //
    // La référence API de `gemini-omni-video` ne déclare qu'un champ de
    // fichiers, `image_urls`, avec des types MIME image. Mais :
    //   - sa description est générique (« Please provide the URL of the
    //     uploaded file ») et ne nomme aucun format ;
    //   - la note sous `duration` — « when video input is provided, the output
    //     duration is determined by the model automatically » — n'a de sens que
    //     si l'endpoint accepte une vidéo ;
    //   - la page produit de kie.ai annonce explicitement quatre entrées pour
    //     Gemini Omni Flash : texte, image, vidéo et voix.
    // Conclusion retenue : `image_urls` est le champ de fichiers générique, mal
    // nommé par le générateur de documentation. La CLÉ, elle, est certaine ;
    // seuls les types acceptés relèvent de cette lecture. Si kie.ai refuse une
    // vidéo, la correction tient dans la liste `accept` ci-dessus.
    //
    // Le plafond de 30 s est une décision Deoflow, pas une contrainte de l'API :
    // sans lui, un fichier long mais léger produirait une facture surprise sur
    // un modèle payé à la seconde.
  },
};

/* ── Accès et dérivations ───────────────────────────────────────────────── */

export function capabilitiesFor(slug: string): ModelCapabilities | undefined {
  return MODEL_CAPABILITIES[slug];
}

/** Mode demandé s'il existe pour ce modèle, sinon le premier. */
export function modeFor(slug: string, modeId?: string | null): ModelMode | undefined {
  const caps = capabilitiesFor(slug);
  if (!caps) return undefined;
  return caps.modes.find((m) => m.id === modeId) ?? caps.modes[0];
}

/**
 * Mode et emplacement qui reçoivent le visage d'un avatar, résolus.
 *
 * Renvoie `null` si le modèle n'en déclare pas, ou si la déclaration désigne un
 * mode ou un emplacement qui n'existe pas — ce dernier cas est un défaut de
 * programmation, attrapé par le test de `capabilities.avatar.test.ts`, mais
 * mieux vaut ici un avatar indisponible qu'une génération facturée sans lui.
 */
export function characterRefFor(slug: string): { mode: ModelMode; slot: MediaSlotSpec } | null {
  const caps = capabilitiesFor(slug);
  if (!caps?.characterRef) return null;
  const mode = caps.modes.find((m) => m.id === caps.characterRef?.mode);
  const slot = mode?.slots.find((s) => s.key === caps.characterRef?.slot);
  return mode && slot ? { mode, slot } : null;
}

/** Le modèle peut-il recevoir un avatar ? */
export function acceptsAvatar(slug: string): boolean {
  return characterRefFor(slug) !== null;
}

/** Paramètres applicables : ceux du modèle, puis ceux du mode. */
export function paramsFor(caps: ModelCapabilities, mode: ModelMode | undefined): ParamSpec[] {
  return [...caps.params, ...(mode?.params ?? [])];
}

export function defaultParams(caps: ModelCapabilities, mode: ModelMode | undefined): ParamValues {
  const values: ParamValues = {};
  for (const param of paramsFor(caps, mode)) values[param.key] = param.default;
  return values;
}

/**
 * Emplacements du mode, après application des paramètres qui les contraignent.
 *
 * Chez Kling, passer l'orientation sur « comme dans la vidéo » porte la vidéo
 * de référence de 10 s à 30 s. Exprimer ça dans la table plutôt que dans le
 * composant garde la règle testable et évite un cas particulier dans l'écran.
 */
export function effectiveSlots(
  mode: ModelMode | undefined,
  values: ParamValues = {},
): MediaSlotSpec[] {
  if (!mode) return [];
  const overrides = new Map<string, number>();
  for (const param of mode.params ?? []) {
    if (param.kind !== 'choice') continue;
    const chosen = param.options.find((o) => o.value === values[param.key]);
    if (chosen?.constrains) overrides.set(chosen.constrains.slot, chosen.constrains.maxSeconds);
  }
  return mode.slots.map((slot) => {
    const maxSeconds = overrides.get(slot.key);
    return maxSeconds === undefined ? slot : { ...slot, maxSeconds };
  });
}

/**
 * Vrai quand AUCUN mode ne permet de se passer de ce média — donc quand
 * l'appel au fournisseur échouera à coup sûr sans lui. Garde-fou repris côté
 * serveur ; les exigences propres à un mode sont vérifiées en amont.
 */
export function alwaysRequires(slug: string, media: SlotMedia): boolean {
  const caps = capabilitiesFor(slug);
  if (!caps || caps.modes.length === 0) return false;
  return caps.modes.every((mode) =>
    mode.slots.some((slot) => slot.media === media && slot.requirement === 'required'),
  );
}

/**
 * Emplacements dont le fichier déposé fixe la durée du rendu — donc le prix.
 *
 * Deux modèles s'en servent, pour la même raison : leur sortie suit le média
 * d'entrée. Chez Kling c'est la règle du modèle ; chez Gemini Omni, c'est ce
 * que dit la note « when video input is provided, the output duration is
 * determined by the model automatically ». Dans les deux cas, mesurer vaut
 * mieux que deviner : c'est ce qui permet d'annoncer un coût exact.
 */
export function durationDrivingSlots(mode: ModelMode | undefined): MediaSlotSpec[] {
  return (mode?.slots ?? []).filter((slot) => slot.drivesDuration === true);
}

/** Nombre de secondes facturé au minimum — sert au « à partir de » des cartes. */
export function minBillableSeconds(slug: string): number {
  const duration = capabilitiesFor(slug)?.duration;
  switch (duration?.kind) {
    case 'fixed':
      return duration.seconds;
    case 'choice':
      return Math.min(...duration.values);
    case 'range':
      return duration.min;
    case 'fromMedia': {
      const slot = capabilitiesFor(slug)
        ?.modes.flatMap((m) => m.slots)
        .find((s) => s.key === duration.slot);
      return slot?.minSeconds ?? 1;
    }
    default:
      return 0;
  }
}

/** Durée à afficher sur une fiche modèle, sans chiffre inventé. */
export function durationLabel(slug: string): string | null {
  const duration = capabilitiesFor(slug)?.duration;
  switch (duration?.kind) {
    case 'fixed':
      return `${duration.seconds} s (imposée par le modèle)`;
    case 'choice':
      return `${duration.values.join(' · ')} secondes`;
    case 'range':
      return `de ${duration.min} à ${duration.max} secondes`;
    case 'fromMedia':
      return 'celle de votre vidéo de référence';
    default:
      return null;
  }
}

/**
 * Résumé d'une ligne des entrées attendues, pour les cartes du catalogue :
 * savoir qu'un modèle réclame une vidéo AVANT de cliquer évite d'arriver sur
 * un écran qu'on ne peut pas remplir.
 */
export function inputSummary(slug: string, kind: MediaKind): string {
  const caps = capabilitiesFor(slug);
  if (!caps) return 'Texte';

  if (alwaysRequires(slug, 'video')) return 'Image + vidéo requises';
  if (alwaysRequires(slug, 'image')) return 'Image requise';

  // Ce que le modèle accepte se lit dans les types MIME, pas dans le nom de
  // l'emplacement : `image_urls` chez Gemini Omni admet aussi vidéos et sons.
  const medias = new Set(
    caps.modes.flatMap((m) => m.slots).flatMap((s) => s.accept.map(mediaOfMime)),
  );
  if (medias.size === 0) return 'Texte seul';

  const labels: Record<SlotMedia, string> = { image: 'images', video: 'vidéos', audio: 'sons' };
  const listed = (['image', 'video', 'audio'] as const)
    .filter((m) => medias.has(m))
    .map((m) => labels[m]);
  if (listed.length === 1 && medias.has('image')) {
    return kind === 'video' ? 'Texte ou image' : 'Texte ou images';
  }
  return `Texte, ${listed.slice(0, -1).join(', ')} ou ${listed[listed.length - 1]}`;
}
