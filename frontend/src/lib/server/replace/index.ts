/**
 * Replace — ce qui se passe autour de l'appel à MiniMax H3.
 *
 * Avant (dans `createGeneration`, AVANT le débit) :
 *   1. `prepareReplaceSource` — mesure la vidéo chez Cloudinary, la coupe à la
 *      seconde pleine, choisit le format le plus proche ;
 *   2. `composeReplacePrompt` — analyse vidéo + personnage par Gemini, puis
 *      gabarit (`lib/deoflow/replacePrompt.ts`).
 *
 * Après (dans `settleGeneration`, une fois le rendu recopié) :
 *   3. `finalizeReplace` — recalage sur la durée de la source et son d'origine.
 *
 * Aucune de ces étapes ne fait échouer une génération déjà payée : seule la
 * première peut refuser, et elle le fait avant le débit.
 */
import 'server-only';
import { log } from '@/lib/server/observability/log';
import type { KieProvider } from '@/lib/server/ai/kie';
import { capabilitiesFor } from '@/lib/deoflow/capabilities';
import { buildReplacePrompt } from '@/lib/deoflow/replacePrompt';
import { analyzeReplace } from './analysis';
import {
  analysisImageUrl,
  closestRatio,
  finalizedResultUrls,
  parseOwnUrl,
  probeVideo,
  trimmedVideoUrl,
} from './media';

export const REPLACE_VIDEO_SLOT = 'reference_video_urls';
export const REPLACE_IMAGE_SLOT = 'reference_image_urls';

/** Refus AVANT débit, traduit en `GenerationRequestError` par le service. */
export class ReplaceInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ReplaceInputError';
  }
}

export interface PreparedSource {
  /** Médias à transmettre : la vidéo y est remplacée par sa version coupée. */
  media: Record<string, string[]>;
  /** Durée facturée et demandée au fournisseur. */
  durationSeconds: number;
  ratio: string | null;
}

/**
 * Mesure et coupe la vidéo source.
 *
 * La durée vient de Cloudinary, jamais du navigateur : c'est elle qu'on
 * facture, deux fois (entrée et rendu). La vidéo est coupée à la seconde
 * pleine inférieure, si bien que kie.ai reçoit exactement ce qui est débité.
 */
export async function prepareReplaceSource(
  modelSlug: string,
  media: Record<string, string[]>,
  probe: typeof probeVideo = probeVideo,
): Promise<PreparedSource> {
  const caps = capabilitiesFor(modelSlug);
  const slot = caps?.modes.flatMap((m) => m.slots).find((s) => s.key === REPLACE_VIDEO_SLOT);
  const url = media[REPLACE_VIDEO_SLOT]?.[0];
  const ref = url ? parseOwnUrl(url) : null;
  if (!caps || !slot || !ref || ref.resourceType !== 'video') {
    throw new ReplaceInputError(
      'MEDIA_URL_INVALID',
      'La vidéo doit être envoyée depuis Deoflow pour être mesurée.',
    );
  }

  let measured;
  try {
    measured = await probe(ref.publicId);
  } catch (err) {
    log.error('replace: mesure de la vidéo impossible', {
      publicId: ref.publicId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new ReplaceInputError(
      'MEDIA_PROBE_FAILED',
      'Impossible de lire la durée de la vidéo. Réessayez dans un instant.',
      503,
    );
  }

  const min = slot.minSeconds ?? 1;
  const max = slot.maxSeconds ?? Infinity;
  // Même règle que l'atelier (`billedMediaSeconds`, arrondi inférieur), mais
  // écrite sur la mesure de Cloudinary : 0,01 s de tolérance, puis la seconde
  // pleine. Une vidéo trop longue est coupée à `max` plutôt que refusée — le
  // navigateur l'aurait déjà signalée, et ce serait refuser un fichier utile.
  const whole = Math.floor(Math.round(measured.duration * 100) / 100);
  if (whole < min) {
    throw new ReplaceInputError(
      'MEDIA_TOO_SHORT',
      `La vidéo dure ${measured.duration.toFixed(1)} s : il en faut au moins ${min}.`,
    );
  }
  const seconds = Math.min(whole, max);

  return {
    media: { ...media, [REPLACE_VIDEO_SLOT]: [trimmedVideoUrl(ref.publicId, seconds)] },
    durationSeconds: seconds,
    ratio: closestRatio(measured.width, measured.height, caps.apiRatios),
  };
}

export interface ComposeInput {
  provider: KieProvider;
  media: Record<string, string[]>;
  seconds: number;
  /** Ce que le créateur a écrit dans l'atelier. */
  note: string;
  avatarDescription: string | null;
}

/** Analyse puis gabarit. Toujours un prompt : sans analyse, le gabarit générique. */
export async function composeReplacePrompt(
  input: ComposeInput,
  analyze: typeof analyzeReplace = analyzeReplace,
): Promise<{ prompt: string; analyzed: boolean }> {
  const videoUrl = input.media[REPLACE_VIDEO_SLOT]?.[0];
  const imageRef = parseOwnUrl(input.media[REPLACE_IMAGE_SLOT]?.[0] ?? '');
  const analysis = videoUrl
    ? await analyze(input.provider, {
        videoUrl,
        imageUrl: imageRef?.resourceType === 'image' ? analysisImageUrl(imageRef.publicId) : null,
        seconds: input.seconds,
      })
    : null;

  return {
    prompt: buildReplacePrompt({
      seconds: input.seconds,
      avatarDescription: input.avatarDescription,
      note: input.note,
      analysis,
    }),
    analyzed: analysis !== null,
  };
}

export interface FinalizeReplaceInput {
  generationId: string;
  /** Médias enregistrés sur la génération — la vidéo y est déjà coupée. */
  inputs: unknown;
  durationSeconds: number | null;
  /** Le rendu recopié chez nous. */
  stored: { secureUrl: string; publicId: string; duration?: number | undefined };
}

const FINALIZE_TIMEOUT_MS = 40_000;

/**
 * Adresse finale du rendu : recalé sur la durée de la source, avec son son.
 *
 * Chaque candidat est DEMANDÉ une fois ici : Cloudinary fabrique la
 * transformation à la première demande, et on préfère que ce soit maintenant
 * — et vérifié — plutôt qu'au premier affichage dans la galerie. Le premier
 * qui répond est retenu ; si aucun ne répond, le rendu brut reste servi.
 */
export async function finalizeReplace(input: FinalizeReplaceInput): Promise<string> {
  const media = (input.inputs ?? {}) as Record<string, unknown>;
  const sourceUrl = Array.isArray(media[REPLACE_VIDEO_SLOT])
    ? (media[REPLACE_VIDEO_SLOT] as unknown[])[0]
    : null;
  const source = typeof sourceUrl === 'string' ? parseOwnUrl(sourceUrl) : null;
  const seconds = input.durationSeconds;

  if (!source || !seconds || !input.stored.duration) {
    log.warn('replace: recalage impossible, rendu brut conservé', {
      generationId: input.generationId,
      hasSource: Boolean(source),
      seconds,
      rendered: input.stored.duration ?? null,
    });
    return input.stored.secureUrl;
  }

  const candidates = finalizedResultUrls({
    result: { resourceType: 'video', publicId: input.stored.publicId },
    renderedSeconds: input.stored.duration,
    sourcePublicId: source.publicId,
    seconds,
  });

  for (const [index, url] of candidates.entries()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FINALIZE_TIMEOUT_MS) });
      // Le corps est lu pour que la transformation aille à son terme.
      await res.arrayBuffer();
      if (res.ok) {
        if (index > 0) {
          log.warn('replace: son d’origine indisponible, rendu recalé seul', {
            generationId: input.generationId,
          });
        }
        return url;
      }
      log.warn('replace: transformation refusée', {
        generationId: input.generationId,
        candidate: index,
        status: res.status,
        reason: res.headers.get('x-cld-error'),
      });
    } catch (err) {
      log.warn('replace: transformation injoignable', {
        generationId: input.generationId,
        candidate: index,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return input.stored.secureUrl;
}
