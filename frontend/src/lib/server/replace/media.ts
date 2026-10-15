/**
 * Cloudinary au service de Replace : mesurer, couper, recaler.
 *
 * Trois opérations, toutes par adresse transformée — aucun fichier ne transite
 * par nos fonctions, ce qui compte sur Vercel :
 *
 *   1. MESURER la vidéo source (API d'administration). C'est la durée sur
 *      laquelle on facture : celle qu'annonce le navigateur ne vaut rien.
 *   2. COUPER la source à la seconde pleine (`du_N`) avant de la donner à
 *      kie.ai. Référence et rendu ont alors la même durée, et kie.ai ne peut
 *      pas facturer plus que ce qu'on a débité.
 *   3. RECALER le rendu : MiniMax rend un peu plus long que demandé (6,58 s
 *      pour 6 s lors de l'essai), donc le mouvement dérive de 7 % par rapport
 *      au son. On l'accélère d'autant (`e_accelerate`, en pourcentage ENTIER —
 *      Cloudinary refuse les décimales), on le coupe à N secondes et on
 *      remplace sa bande-son par celle de la source (`l_audio`).
 *
 * Chaque transformation a été vérifiée sur le compte réel avant d'être écrite
 * ici (octobre 2026) : son final identique à la source à 0,94 de corrélation,
 * durée 6,05 s pour 6 s visées.
 */
import 'server-only';
import { getCloudinary } from '@/lib/server/upload/cloudinary-client';

export interface CloudinaryRef {
  resourceType: 'image' | 'video';
  publicId: string;
}

/**
 * Lit une adresse de livraison de NOTRE compte Cloudinary.
 *
 * `null` pour toute autre adresse : la durée facturée vient de l'API
 * d'administration, qui ne connaît que nos fichiers. Une vidéo hébergée
 * ailleurs ne peut être ni mesurée ni coupée — donc ni facturée juste.
 *
 * Les segments de transformation (`du_6/…`) sont ignorés : l'identifiant suit
 * toujours le segment de version (`v123/`), présent dans toutes nos adresses.
 */
export function parseOwnUrl(
  url: string,
  cloudName: string = process.env.CLOUDINARY_CLOUD_NAME ?? '',
): CloudinaryRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  const [cloud, resourceType, delivery, ...rest] = segments;
  if (!cloudName || cloud !== cloudName || delivery !== 'upload') return null;
  if (resourceType !== 'image' && resourceType !== 'video') return null;

  const version = rest.findIndex((s) => /^v\d+$/.test(s));
  if (version === -1 || version === rest.length - 1) return null;

  const publicId = decodeURIComponent(rest.slice(version + 1).join('/')).replace(
    /\.[a-z0-9]+$/i,
    '',
  );
  return publicId ? { resourceType, publicId } : null;
}

export interface VideoProbe {
  duration: number;
  width: number;
  height: number;
}

/**
 * Durée et dimensions mesurées par Cloudinary.
 *
 * ⚠️ `media_metadata: true` est indispensable : sans lui, l'API renvoie la
 * ressource SANS sa durée — constaté sur le compte réel.
 */
export async function probeVideo(publicId: string): Promise<VideoProbe> {
  const res = (await getCloudinary().api.resource(publicId, {
    resource_type: 'video',
    media_metadata: true,
  })) as unknown as Record<string, unknown>;

  const duration = Number(res.duration);
  const width = Number(res.width);
  const height = Number(res.height);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Durée illisible pour ${publicId}`);
  }
  return { duration, width, height };
}

function deliveryUrl(
  ref: CloudinaryRef,
  format: string,
  transformation: Record<string, unknown>[],
): string {
  return getCloudinary().url(ref.publicId, {
    resource_type: ref.resourceType,
    type: 'upload',
    format,
    secure: true,
    // Sans quoi le SDK ajoute `?_a=…` à chaque adresse : un paramètre de
    // statistiques sans intérêt, qui allonge les URLs stockées.
    urlAnalytics: false,
    transformation,
  });
}

/** La source coupée à `seconds` secondes, en MP4 — ce que reçoivent kie.ai et Gemini. */
export function trimmedVideoUrl(publicId: string, seconds: number): string {
  return deliveryUrl({ resourceType: 'video', publicId }, 'mp4', [{ duration: seconds }]);
}

/** L'image du personnage en JPEG raisonnable, pour l'analyse. */
export function analysisImageUrl(publicId: string): string {
  return deliveryUrl({ resourceType: 'image', publicId }, 'jpg', [{ width: 768, crop: 'limit' }]);
}

/**
 * Accélération (en %) qui ramène `rendered` secondes à `target`.
 * Entière et bornée à ce que Cloudinary accepte (−50 à 100).
 */
export function accelerationPercent(rendered: number, target: number): number {
  if (!(rendered > 0) || !(target > 0)) return 0;
  const pct = Math.round((rendered / target - 1) * 100);
  return Math.max(-50, Math.min(100, pct));
}

/** Le format proposé le plus proche des proportions de la vidéo. */
export function closestRatio(width: number, height: number, ratios: string[]): string | null {
  if (!(width > 0) || !(height > 0)) return null;
  const target = Math.log(width / height);
  let best: string | null = null;
  let bestGap = Infinity;
  for (const ratio of ratios) {
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) continue;
    const gap = Math.abs(Math.log(w / h) - target);
    if (gap < bestGap) {
      best = ratio;
      bestGap = gap;
    }
  }
  return best;
}

export interface FinalizeInput {
  /** Le rendu recopié chez nous. */
  result: CloudinaryRef;
  /** Sa durée réelle, mesurée à la recopie. */
  renderedSeconds: number;
  /** La vidéo source, pour sa bande-son. */
  sourcePublicId: string;
  /** Durée visée — celle de la source coupée, donc celle facturée. */
  seconds: number;
}

/**
 * Adresses du rendu final, de la meilleure à la plus sûre.
 *
 * L'appelant essaie chacune et garde la première qui répond : une source sans
 * piste son fait échouer la superposition audio, et un rendu inattendu peut
 * faire refuser l'accélération. Le rendu brut reste le dernier recours — la
 * génération a réussi, on ne la perd pas pour un recalage.
 */
export function finalizedResultUrls(input: FinalizeInput): string[] {
  const pct = accelerationPercent(input.renderedSeconds, input.seconds);
  // ⚠️ AUCUNE coupe (`du_`) sur l'image : Cloudinary l'applique AVANT
  // l'accélération, quel que soit l'ordre écrit. « accélérer 10 % puis couper
  // à 6 s » donnait 5,54 s d'image pour 6 s de son — la dernière demi-seconde
  // du mouvement perdue (constaté sur le compte réel). L'accélération seule
  // ramène déjà l'image à la bonne durée ; seule la piste son est coupée, dans
  // le composant du calque.
  const retime = pct !== 0 ? [{ effect: `accelerate:${pct}` }] : [];
  const withSourceAudio = deliveryUrl(input.result, 'mp4', [
    ...retime,
    { audio_codec: 'none' },
    // Dans un identifiant de calque, les « / » s'écrivent « : ».
    { overlay: `audio:${input.sourcePublicId.replaceAll('/', ':')}`, duration: input.seconds },
    { flags: 'layer_apply' },
  ]);
  const retimedOnly = deliveryUrl(input.result, 'mp4', retime);
  return [withSourceAudio, retimedOnly];
}
