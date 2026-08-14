/**
 * Cycle de vie d'une génération.
 *
 * L'ordre des opérations est la partie qui compte, parce qu'un appel à kie.ai
 * est facturé et qu'un crédit mal rendu ne se voit pas :
 *
 *   1. débit + insertion en PENDING, dans une transaction verrouillée ;
 *   2. appel au fournisseur, HORS transaction (un aller-retour réseau de
 *      plusieurs secondes ne doit pas tenir un verrou de base) ;
 *   3. RUNNING si la tâche est acceptée, sinon échec + REMBOURSEMENT.
 *
 * Débiter d'abord et rembourser ensuite, plutôt que l'inverse, garantit qu'on
 * ne lance jamais un appel payant sans provision. La contrepartie — un
 * remboursement à ne pas oublier — est concentrée dans `settle()` et
 * `failGeneration()`, les deux seuls endroits qui referment une génération.
 *
 * Le coût est TOUJOURS recalculé ici depuis le catalogue. Le client peut
 * afficher ce qu'il veut, il ne décide pas de ce qu'on lui prend.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { log } from '@/lib/server/observability/log';
import {
  InsufficientCreditsError,
  creditCredits,
  debitCredits,
  withUserCredits,
} from '@/lib/server/credits';
import {
  KieError,
  createTask,
  getTask,
  tryCreateKieProvider,
  type GenerateRequest,
} from '@/lib/server/ai/kie';
import { copyResultsToStorage } from '@/lib/server/generations/assets';
import { findModel } from '@/lib/deoflow/catalog';
import { hasVideoInput, priceCredits } from '@/lib/deoflow/pricing';
import {
  capabilitiesFor,
  effectiveSlots,
  minBillableSeconds,
  modeFor,
  type ParamValues,
} from '@/lib/deoflow/capabilities';
import { composePrompt } from '@/lib/deoflow/avatarPrompt';

export { InsufficientCreditsError };

export class GenerationRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'GenerationRequestError';
  }
}

export interface CreateGenerationInput {
  userId: string;
  modelSlug: string;
  // `| undefined` explicite : sous `exactOptionalPropertyTypes`, un champ
  // simplement optionnel refuserait la valeur `undefined` que produit la
  // validation Zod pour une clé absente.
  mode?: string | null | undefined;
  prompt: string;
  ratio?: string | null | undefined;
  durationSeconds?: number | null | undefined;
  params?: ParamValues | undefined;
  media?: Record<string, string[]> | undefined;
  idempotencyKey?: string | null | undefined;
  /**
   * Avatar à incarner. Le serveur relit sa description en base et recompose le
   * prompt lui-même : le navigateur affiche le résultat, il ne le dicte pas.
   * Même principe que le prix.
   */
  avatarId?: string | null | undefined;
  /**
   * `AVATAR` pour la génération d'un visage : elle n'apparaîtra pas dans la
   * galerie. Réservé à `lib/server/avatars/service.ts` — une route publique ne
   * doit pas pouvoir masquer ses propres générations.
   */
  purpose?: 'CREATION' | 'AVATAR' | undefined;
}

/**
 * Coût réel d'une génération, calculé côté serveur.
 *
 * Pour une vidéo dont la durée vient du fichier envoyé (Kling, Gemini Omni
 * avec une vidéo en entrée), la durée transmise par le client est plafonnée
 * par ce que l'emplacement autorise : sans ce plafond, un client modifié
 * annoncerait 1 seconde et en ferait produire 30.
 */
export function quoteGeneration(input: CreateGenerationInput): {
  credits: number;
  durationSeconds: number | null;
} {
  const model = findModel(input.modelSlug);
  const caps = capabilitiesFor(input.modelSlug);
  if (!model || !caps || !model.active) {
    throw new GenerationRequestError('MODEL_UNKNOWN', `Modèle inconnu : ${input.modelSlug}`);
  }
  const withVideo = hasVideoInput(input.media ?? undefined);

  if (model.kind === 'image') {
    const credits = priceCredits(input.modelSlug, {
      hasVideoInput: withVideo,
      params: input.params ?? {},
    });
    if (credits === null) {
      throw new GenerationRequestError('MODEL_UNKNOWN', `Sans tarif : ${input.modelSlug}`);
    }
    return { credits, durationSeconds: null };
  }

  const mode = modeFor(input.modelSlug, input.mode);
  const requested = input.durationSeconds ?? minBillableSeconds(input.modelSlug);

  let seconds = requested;
  switch (caps.duration.kind) {
    case 'fixed':
      seconds = caps.duration.seconds;
      break;
    case 'choice':
      if (!caps.duration.values.includes(requested)) {
        // Durée hors catalogue : on ne devine pas, on refuse. Accepter
        // reviendrait à facturer une valeur que le fournisseur ignorera.
        throw new GenerationRequestError('DURATION_INVALID', `Durée refusée : ${requested} s`);
      }
      break;
    case 'range':
      if (requested < caps.duration.min || requested > caps.duration.max) {
        throw new GenerationRequestError('DURATION_INVALID', `Durée refusée : ${requested} s`);
      }
      break;
    default:
      break;
  }

  // Un emplacement qui porte la durée impose son propre plafond — et ce
  // plafond dépend des paramètres : chez Kling, « comme dans la vidéo » fait
  // passer la limite de 10 s à 30 s. D'où `effectiveSlots` plutôt que les
  // emplacements bruts : les lire sans appliquer les paramètres facturerait
  // un clip de 30 secondes au prix de 10.
  const driving = effectiveSlots(mode, input.params ?? {}).filter((slot) => slot.drivesDuration);
  const cap = Math.max(0, ...driving.map((slot) => slot.maxSeconds ?? 0));
  if (cap > 0) seconds = Math.min(Math.max(seconds, 1), cap);

  // Le prix vient du coût fournisseur, jamais d'un chiffre annoncé par le
  // navigateur : la présence d'une vidéo de référence se lit sur les URLs que
  // NOUS avons produites au moment de l'envoi.
  const credits = priceCredits(input.modelSlug, {
    seconds,
    hasVideoInput: withVideo,
    params: input.params ?? {},
  });
  if (credits === null) {
    throw new GenerationRequestError('MODEL_UNKNOWN', `Sans tarif : ${input.modelSlug}`);
  }
  return { credits, durationSeconds: seconds };
}

/** Contrôle des emplacements avant tout débit : refuser coûte zéro crédit. */
function assertMediaComplete(input: CreateGenerationInput): void {
  const mode = modeFor(input.modelSlug, input.mode);
  if (!mode) throw new GenerationRequestError('MODE_UNKNOWN', `Mode inconnu : ${input.mode}`);

  const slots = effectiveSlots(mode, input.params ?? {});
  for (const slot of slots) {
    const count = (input.media?.[slot.key] ?? []).length;
    if (slot.requirement === 'required' && count === 0) {
      throw new GenerationRequestError('MEDIA_REQUIRED', `Fichier manquant : ${slot.label}.`);
    }
    if (count > slot.maxCount) {
      throw new GenerationRequestError(
        'MEDIA_TOO_MANY',
        `${slot.label} : ${slot.maxCount} fichier(s) au maximum.`,
      );
    }
  }
  if (mode.requiresAnySlot && slots.every((s) => (input.media?.[s.key] ?? []).length === 0)) {
    throw new GenerationRequestError('MEDIA_REQUIRED', 'Ajoutez au moins un fichier de référence.');
  }

  // Une URL non https ne sera pas téléchargeable par kie.ai — et un `blob:`
  // local encore moins. Mieux vaut le dire ici qu'après débit.
  for (const urls of Object.values(input.media ?? {})) {
    for (const url of urls) {
      if (!url.startsWith('https://')) {
        throw new GenerationRequestError(
          'MEDIA_URL_INVALID',
          'Les fichiers doivent être en https.',
        );
      }
    }
  }
}

/* ── Avatars ────────────────────────────────────────────────────────────── */

interface ResolvedAvatar {
  id: string;
  name: string;
  description: string;
  faceUrl: string;
}

/**
 * Relit l'avatar en base, ou lève.
 *
 * Le navigateur n'envoie qu'un identifiant : le nom, la description et l'URL du
 * visage viennent tous d'ici. Sans cela, un client modifié se réclamerait d'un
 * avatar en injectant le prompt de son choix — et surtout l'image de son choix
 * dans un emplacement de référence.
 *
 * `userId` est dans le `where` : un avatar qui n'est pas le vôtre est
 * introuvable, pas interdit.
 */
async function resolveAvatar(input: CreateGenerationInput): Promise<ResolvedAvatar | null> {
  if (!input.avatarId) return null;

  const avatar = await prisma.avatar.findFirst({
    where: { id: input.avatarId, userId: input.userId },
    select: { id: true, name: true, description: true, faceUrl: true, status: true },
  });
  if (!avatar) {
    throw new GenerationRequestError('AVATAR_NOT_FOUND', 'Avatar introuvable', 404);
  }
  if (avatar.status !== 'READY' || !avatar.faceUrl) {
    throw new GenerationRequestError(
      'AVATAR_NOT_READY',
      'Le visage de cet avatar n’est pas encore prêt.',
    );
  }
  if (!capabilitiesFor(input.modelSlug)?.characterRef) {
    throw new GenerationRequestError('AVATAR_UNSUPPORTED', 'Ce modèle n’accepte pas d’avatar.');
  }

  return { ...avatar, faceUrl: avatar.faceUrl };
}

/**
 * Pose le visage en TÊTE de l'emplacement de référence du modèle.
 *
 * En tête parce que plusieurs modèles pondèrent la première référence plus
 * fortement — chez Seedance, c'est même elle que `@Image1` désigne.
 *
 * Le doublon est écarté : l'atelier a déjà placé le visage dans l'emplacement
 * pour le montrer au créateur, et l'envoyer deux fois consommerait deux des
 * trois places de Veo pour la même image.
 */
function withAvatarFace(
  input: CreateGenerationInput,
  avatar: ResolvedAvatar,
): Record<string, string[]> {
  const ref = capabilitiesFor(input.modelSlug)?.characterRef;
  if (!ref) return input.media ?? {};

  const media = { ...(input.media ?? {}) };
  const existing = (media[ref.slot] ?? []).filter((url) => url !== avatar.faceUrl);
  media[ref.slot] = [avatar.faceUrl, ...existing];
  return media;
}

export type GenerationRow = Prisma.GenerationGetPayload<Record<string, never>>;

/**
 * Débite, enregistre, puis soumet au fournisseur.
 *
 * Renvoie la ligne créée. Un échec de soumission est déjà remboursé au moment
 * où l'appelant la reçoit — la ligne porte alors `status: 'FAILED'`.
 */
export async function createGeneration(input: CreateGenerationInput): Promise<GenerationRow> {
  const model = findModel(input.modelSlug);
  if (!model)
    throw new GenerationRequestError('MODEL_UNKNOWN', `Modèle inconnu : ${input.modelSlug}`);

  if (input.idempotencyKey) {
    const existing = await prisma.generation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    // Rejeu d'un double-clic : on rend la génération déjà lancée plutôt que
    // d'en facturer une seconde.
    if (existing) return existing;
  }

  // L'avatar est résolu AVANT le débit : un avatar inconnu, pas encore prêt ou
  // appartenant à quelqu'un d'autre doit coûter zéro crédit.
  const avatar = await resolveAvatar(input);

  const withAvatar: CreateGenerationInput = avatar
    ? {
        ...input,
        // Le mode est IMPOSÉ par la table des capacités, pas par la requête :
        // un avatar envoyé en mode Texte irait dans un emplacement que le mode
        // ne possède pas, et le fournisseur générerait sans le personnage —
        // après débit.
        mode: capabilitiesFor(input.modelSlug)?.characterRef?.mode ?? input.mode,
        prompt: composePrompt(avatar, input.prompt),
        media: withAvatarFace(input, avatar),
      }
    : input;

  assertMediaComplete(withAvatar);
  const { credits, durationSeconds } = quoteGeneration(withAvatar);

  const provider = tryCreateKieProvider();
  if (!provider) {
    throw new GenerationRequestError(
      'PROVIDER_NOT_CONFIGURED',
      'La génération n’est pas configurée sur ce serveur.',
      503,
    );
  }

  const mode = modeFor(withAvatar.modelSlug, withAvatar.mode);

  // Étape 1 — débit et insertion, atomiques et sérialisés par utilisateur.
  const row = await withUserCredits(input.userId, async (tx) => {
    const created = await tx.generation.create({
      data: {
        userId: input.userId,
        modelSlug: model.slug,
        modelName: model.name,
        kind: model.kind,
        mode: mode?.id ?? 'text',
        // Le prompt ENVOYÉ, description de l'avatar comprise : c'est lui qu'il
        // faudra relire pour diagnostiquer une génération dans six mois, même
        // si l'avatar a changé de description depuis.
        prompt: withAvatar.prompt,
        ratio: withAvatar.ratio ?? null,
        durationSeconds,
        params: (withAvatar.params ?? {}) as Prisma.InputJsonValue,
        inputs: (withAvatar.media ?? {}) as Prisma.InputJsonValue,
        credits,
        status: 'PENDING',
        purpose: input.purpose ?? 'CREATION',
        avatarId: avatar?.id ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    await debitCredits(tx, {
      userId: input.userId,
      credits,
      movement: 'GENERATION',
      label: `${model.name} — ${model.kind === 'video' ? `${durationSeconds} s` : 'image'}`,
      generationId: created.id,
    });

    return created;
  });

  // Étape 2 — soumission au fournisseur, hors transaction : un aller-retour
  // de plusieurs secondes ne doit pas tenir un verrou de base ouvert.
  const request: GenerateRequest = {
    modelSlug: model.slug,
    prompt: withAvatar.prompt,
    ...(mode ? { mode: mode.id } : {}),
    ...(withAvatar.ratio ? { aspectRatio: withAvatar.ratio } : {}),
    ...(durationSeconds !== null ? { durationSeconds } : {}),
    ...(withAvatar.params ? { params: withAvatar.params } : {}),
    ...(withAvatar.media ? { media: withAvatar.media } : {}),
  };

  try {
    const handle = await createTask(provider, request);
    return await prisma.generation.update({
      where: { id: row.id },
      data: { status: 'RUNNING', providerTaskId: handle.taskId, providerFamily: handle.family },
    });
  } catch (err) {
    const code = err instanceof KieError ? err.code : 'PROVIDER_UNAVAILABLE';
    const message = err instanceof Error ? err.message : 'Soumission impossible';
    log.error('generation: soumission refusée', { generationId: row.id, code, message });
    // Rien n'a pu être produit : le créateur récupère ses crédits.
    return failGeneration(row.id, code, message);
  }
}

/** Referme une génération en échec et rembourse, une seule fois. */
export async function failGeneration(
  generationId: string,
  code: string,
  reason: string,
): Promise<GenerationRow> {
  const row = await prisma.generation.findUnique({ where: { id: generationId } });
  if (!row) throw new GenerationRequestError('GENERATION_UNKNOWN', 'Génération introuvable', 404);
  if (row.status === 'FAILED' || row.status === 'SUCCEEDED') return row;

  return withUserCredits(row.userId, async (tx) => {
    // Relecture SOUS VERROU : deux sondages simultanés pourraient sinon
    // rembourser deux fois la même génération.
    const fresh = await tx.generation.findUnique({ where: { id: generationId } });
    if (!fresh || fresh.status === 'FAILED' || fresh.status === 'SUCCEEDED') {
      return fresh ?? row;
    }

    await creditCredits(tx, {
      userId: fresh.userId,
      credits: fresh.credits,
      movement: 'REFUND',
      label: `Remboursement — ${fresh.modelName}`,
      generationId: fresh.id,
    });

    return tx.generation.update({
      where: { id: fresh.id },
      data: {
        status: 'FAILED',
        failureCode: code,
        failureReason: reason.slice(0, 500),
        completedAt: new Date(),
      },
    });
  });
}

/**
 * Interroge le fournisseur et referme la génération si elle est terminée.
 *
 * Appelé par le sondage côté client. Idempotent : une génération déjà close
 * est renvoyée telle quelle sans nouvel appel réseau.
 */
export async function settleGeneration(row: GenerationRow): Promise<GenerationRow> {
  if (row.status === 'SUCCEEDED' || row.status === 'FAILED') return row;
  if (!row.providerTaskId || !row.providerFamily) return row;

  const provider = tryCreateKieProvider();
  if (!provider) return row;

  let state;
  try {
    state = await getTask(provider, {
      taskId: row.providerTaskId,
      family: row.providerFamily === 'veo' ? 'veo' : 'jobs',
    });
  } catch (err) {
    // Le fournisseur est injoignable : la tâche court peut-être toujours.
    // Ne rien fermer, ne rien rembourser — le prochain sondage retentera.
    log.warn('generation: sondage impossible', {
      generationId: row.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return row;
  }

  if (state.status === 'RUNNING') return row;

  if (state.status === 'FAILED') {
    return failGeneration(row.id, state.code ?? 'PROVIDER_FAILED', state.message);
  }

  if (state.urls.length === 0) {
    return failGeneration(
      row.id,
      'PROVIDER_EMPTY_RESULT',
      'Le fournisseur n’a renvoyé aucun fichier.',
    );
  }

  // Réussite : on recopie avant que les URLs du fournisseur n'expirent.
  const { stored } = await copyResultsToStorage(state.urls, `generations/${row.userId}/${row.id}`);
  if (stored.length === 0) {
    // Le rendu existe chez kie.ai mais on n'a pas su le conserver. Le
    // créateur ne doit pas payer notre panne de stockage.
    return failGeneration(
      row.id,
      'ASSET_COPY_FAILED',
      'Le résultat n’a pas pu être enregistré. Vos crédits ont été rendus.',
    );
  }

  return prisma.generation.update({
    where: { id: row.id },
    data: {
      status: 'SUCCEEDED',
      sourceUrls: state.urls as Prisma.InputJsonValue,
      assetUrls: stored as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}
