/**
 * Avatars — l'influenceur réutilisable du créateur.
 *
 * Un avatar est un COUPLE : un visage de référence et une description libre.
 * Le visage porte l'identité, le texte porte ce qu'un visage ne peut pas dire
 * — la taille, la corpulence, la garde-robe. Les deux sont réinjectés à chaque
 * génération qui le sélectionne, si bien que le créateur n'a plus à redécrire
 * son personnage.
 *
 * Aucun chemin de facturation propre : la génération du visage passe par
 * `createGeneration`, qui débite déjà dans une transaction verrouillée et
 * rembourse un échec de soumission. Une seule porte vers les crédits.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import {
  createGeneration,
  settleGeneration,
  GenerationRequestError,
} from '@/lib/server/generations/service';
import { buildPortraitPrompt, isAvatarModel, PORTRAIT_RATIO } from './portrait';

export class AvatarError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'AvatarError';
  }
}

export type AvatarStatus = 'PENDING' | 'READY' | 'FAILED';

export interface AvatarView {
  id: string;
  name: string;
  description: string;
  faceUrl: string | null;
  modelSlug: string;
  status: AvatarStatus;
  /** Génération du visage, pour sonder l'avancement depuis l'écran. */
  faceGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
}

type AvatarRow = Prisma.AvatarGetPayload<Record<string, never>>;

function toView(row: AvatarRow): AvatarView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    faceUrl: row.faceUrl,
    modelSlug: row.modelSlug,
    status: row.status as AvatarStatus,
    faceGenerationId: row.faceGenerationId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ── Création ───────────────────────────────────────────────────────────── */

export interface CreateAvatarInput {
  userId: string;
  name: string;
  description: string;
  modelSlug: string;
  /** Photo de départ, déjà déposée. Absente = création à partir du seul texte. */
  photoUrl?: string | null | undefined;
  /** Le créateur a déclaré disposer des droits sur cette photo. */
  photoRightsAck?: boolean | undefined;
  idempotencyKey?: string | null | undefined;
}

export async function createAvatar(input: CreateAvatarInput): Promise<AvatarView> {
  const name = input.name.trim();
  const description = input.description.trim();

  if (name.length === 0) throw new AvatarError('AVATAR_NAME_REQUIRED', 'Donnez un nom à l’avatar.');
  if (!isAvatarModel(input.modelSlug)) {
    throw new AvatarError('AVATAR_MODEL_INVALID', 'Ce modèle ne peut pas générer un visage.');
  }
  // Sans photo, le texte est la SEULE matière : un champ vide produirait un
  // visage au hasard, facturé.
  if (!input.photoUrl && description.length === 0) {
    throw new AvatarError(
      'AVATAR_DESCRIPTION_REQUIRED',
      'Décrivez votre personnage, ou partez d’une photo.',
    );
  }
  if (input.photoUrl && !input.photoRightsAck) {
    throw new AvatarError(
      'PHOTO_RIGHTS_REQUIRED',
      'Confirmez que vous disposez des droits sur cette photo.',
    );
  }

  const fromPhoto = Boolean(input.photoUrl);
  const generation = await createGeneration({
    userId: input.userId,
    modelSlug: input.modelSlug,
    // Le gabarit de portrait est imposé ici, hors de portée du créateur : un
    // « sur une plage » dans sa description donnerait un visage inutilisable,
    // et traînerait cette plage dans chacune de ses scènes.
    prompt: buildPortraitPrompt(description, fromPhoto),
    mode: fromPhoto ? 'image' : 'text',
    ratio: PORTRAIT_RATIO,
    ...(fromPhoto ? { media: photoSlot(input.modelSlug, input.photoUrl as string) } : {}),
    // La génération d'un visage n'est pas une création : elle ne figurera pas
    // dans la galerie.
    purpose: 'AVATAR',
    idempotencyKey: input.idempotencyKey ?? null,
  });

  const row = await prisma.avatar.create({
    data: {
      userId: input.userId,
      name,
      description,
      modelSlug: input.modelSlug,
      faceGenerationId: generation.id,
      // La ligne naît PENDING même si la génération a déjà échoué : `resolve()`
      // la rattrapera à la première lecture. Un seul chemin de vérité.
      status: 'PENDING',
      ...(input.photoRightsAck ? { photoRightsAckAt: new Date() } : {}),
    },
  });

  return toView(await resolve(row));
}

/** Emplacement d'image de départ du modèle de portrait. */
function photoSlot(modelSlug: string, photoUrl: string): Record<string, string[]> {
  // Les deux seuls modèles autorisés, dont les clés sont relevées dans
  // `capabilities.ts`. `isAvatarModel()` a déjà écarté le reste.
  return { [modelSlug === 'gpt-image-2' ? 'input_urls' : 'image_input']: [photoUrl] };
}

/* ── Résolution paresseuse ──────────────────────────────────────────────── */

/**
 * Fait passer un avatar `PENDING` à `READY` ou `FAILED` en réglant sa génération.
 *
 * Paresseux plutôt que planifié : la génération d'un visage prend une dizaine
 * de secondes, et le créateur peut fermer son onglet entre-temps. Un cron
 * serait un rouage de plus pour un état qu'on peut simplement constater au
 * moment de le lire — et cette version est auto-réparatrice.
 *
 * RÉGLER, pas seulement lire. Une ligne de génération ne devient `SUCCEEDED`
 * que lorsque quelqu'un interroge kie.ai et recopie le résultat — c'est le rôle
 * de `settleGeneration`. Les écrans d'avatar sondent `/api/avatars`, jamais
 * `/api/generations/[id]` : sans cet appel, l'avatar attendrait un état que
 * personne n'écrit. L'image existerait chez le fournisseur, facturée, sans
 * jamais arriver ici.
 *
 * Renvoie la ligne inchangée si rien ne bouge : aucune écriture inutile.
 */
async function resolve(row: AvatarRow): Promise<AvatarRow> {
  if (row.status !== 'PENDING') return row;
  if (!row.faceGenerationId) return fail(row, 'aucune génération associée');

  const pending = await prisma.generation.findUnique({ where: { id: row.faceGenerationId } });

  // Génération supprimée : l'avatar resterait PENDING pour toujours. Mieux vaut
  // un échec lisible, avec le bouton « régénérer » qu'il déclenche.
  if (!pending) return fail(row, 'génération introuvable');

  // Idempotent, et sans appel réseau si la ligne est déjà close.
  const generation = await settleGeneration(pending);

  if (generation.status === 'FAILED') return fail(row, 'la génération a échoué');
  if (generation.status !== 'SUCCEEDED') return row;

  const first = Array.isArray(generation.assetUrls) ? generation.assetUrls[0] : null;
  if (typeof first !== 'string' || first.length === 0) {
    return fail(row, 'génération réussie sans image');
  }

  return prisma.avatar.update({
    where: { id: row.id },
    // Le visage est DÉNORMALISÉ ici : l'avatar doit survivre à un nettoyage de
    // la galerie, donc il ne peut pas dépendre de la ligne de génération.
    data: { faceUrl: first, status: 'READY' },
  });
}

function fail(row: AvatarRow, _reason: string): Promise<AvatarRow> {
  return prisma.avatar.update({ where: { id: row.id }, data: { status: 'FAILED' } });
}

/* ── Lecture ────────────────────────────────────────────────────────────── */

export async function listAvatars(userId: string): Promise<AvatarView[]> {
  const rows = await prisma.avatar.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  // En série serait plus économe en connexions, mais un créateur a une poignée
  // d'avatars et un seul est généralement en attente.
  const resolved = await Promise.all(rows.map(resolve));
  return resolved.map(toView);
}

export async function getAvatar(userId: string, id: string): Promise<AvatarView> {
  const row = await prisma.avatar.findFirst({ where: { id, userId } });
  // Introuvable, pas interdit : répondre « interdit » confirmerait l'existence
  // de l'avatar d'un autre.
  if (!row) throw new AvatarError('AVATAR_NOT_FOUND', 'Avatar introuvable', 404);
  return toView(await resolve(row));
}

/* ── Modification ───────────────────────────────────────────────────────── */

export interface UpdateAvatarInput {
  name?: string | undefined;
  description?: string | undefined;
}

/**
 * Renommer ou réécrire la description — GRATUIT : rien n'est régénéré.
 *
 * La nouvelle description s'appliquera aux générations suivantes ; celles déjà
 * produites gardent le prompt avec lequel elles ont été payées.
 */
export async function updateAvatar(
  userId: string,
  id: string,
  input: UpdateAvatarInput,
): Promise<AvatarView> {
  const existing = await prisma.avatar.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) throw new AvatarError('AVATAR_NOT_FOUND', 'Avatar introuvable', 404);

  const name = input.name?.trim();
  const description = input.description?.trim();
  if (name !== undefined && name.length === 0) {
    throw new AvatarError('AVATAR_NAME_REQUIRED', 'Donnez un nom à l’avatar.');
  }

  const row = await prisma.avatar.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
    },
  });
  return toView(row);
}

/**
 * Régénère le visage — PAYANT, au tarif du modèle choisi.
 *
 * L'ancien visage reste en place jusqu'à ce que le nouveau soit prêt : sinon un
 * créateur perdrait un avatar utilisable en échange d'une génération ratée.
 */
export async function regenerateFace(
  userId: string,
  id: string,
  modelSlug?: string,
): Promise<AvatarView> {
  const row = await prisma.avatar.findFirst({ where: { id, userId } });
  if (!row) throw new AvatarError('AVATAR_NOT_FOUND', 'Avatar introuvable', 404);

  const slug = modelSlug ?? row.modelSlug;
  if (!isAvatarModel(slug)) {
    throw new AvatarError('AVATAR_MODEL_INVALID', 'Ce modèle ne peut pas générer un visage.');
  }

  const generation = await createGeneration({
    userId,
    modelSlug: slug,
    prompt: buildPortraitPrompt(row.description, false),
    mode: 'text',
    ratio: PORTRAIT_RATIO,
    purpose: 'AVATAR',
  });

  const updated = await prisma.avatar.update({
    where: { id },
    data: { faceGenerationId: generation.id, modelSlug: slug, status: 'PENDING' },
  });
  return toView(await resolve(updated));
}

/* ── Suppression ────────────────────────────────────────────────────────── */

export async function deleteAvatar(userId: string, id: string): Promise<void> {
  // `deleteMany` plutôt que `delete` : le filtre sur `userId` et l'absence de
  // la ligne se traitent d'un coup, sans exception Prisma à intercepter.
  const { count } = await prisma.avatar.deleteMany({ where: { id, userId } });
  if (count === 0) throw new AvatarError('AVATAR_NOT_FOUND', 'Avatar introuvable', 404);
  // Les générations qui l'ont utilisé gardent leur image : `onDelete: SetNull`
  // détache la référence sans effacer l'historique.
}

/** Ré-exporté pour que les routes traduisent les deux familles d'erreur. */
export { GenerationRequestError };
