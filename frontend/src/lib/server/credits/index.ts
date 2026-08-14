/**
 * Mouvements de crédits — le seul chemin autorisé vers `User.credits`.
 *
 * Le solde est dénormalisé sur `User` pour être lu en une requête, mais la
 * vérité est le journal `CreditTransaction`. Les deux sont écrits ensemble,
 * ici et nulle part ailleurs : un `prisma.user.update({ credits })` isolé
 * ferait diverger le solde du journal, et la divergence ne se verrait qu'au
 * moment d'un litige — c'est-à-dire trop tard.
 *
 * ⚠️ Chaque appel doit se faire À L'INTÉRIEUR d'une transaction déjà tenue
 * par `lockUserTx(tx, userId)`. Sans ce verrou, deux générations lancées
 * simultanément lisent le même solde et dépensent deux fois le même crédit.
 * `withUserCredits()` ci-dessous fait les deux d'un coup — préférez-le.
 */
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { lockUserTx, type TxClient } from '@/lib/server/withdrawals/lock';

export type CreditMovement = 'PURCHASE' | 'GENERATION' | 'REFUND' | 'ADMIN_ADJUSTMENT';

/** Solde insuffisant — traduit en 402 par les routes appelantes. */
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS';
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`Solde insuffisant : ${required} crédits requis, ${available} disponibles.`);
    this.name = 'InsufficientCreditsError';
  }
}

export interface MovementInput {
  userId: string;
  /** Toujours POSITIF — le sens vient de `debit` ou `credit`. */
  credits: number;
  movement: CreditMovement;
  label: string;
  amountFcfa?: number;
  generationId?: string;
  orderId?: string;
}

async function apply(tx: TxClient, input: MovementInput, sign: 1 | -1): Promise<number> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new Error('Un mouvement de crédits doit être un entier strictement positif.');
  }

  const user = await tx.user.findUnique({
    where: { id: input.userId },
    select: { credits: true },
  });
  if (!user) throw new Error(`Utilisateur introuvable : ${input.userId}`);

  const delta = sign * input.credits;
  const balanceAfter = user.credits + delta;
  if (balanceAfter < 0) {
    throw new InsufficientCreditsError(input.credits, user.credits);
  }

  await tx.user.update({ where: { id: input.userId }, data: { credits: balanceAfter } });
  await tx.creditTransaction.create({
    data: {
      userId: input.userId,
      credits: delta,
      movement: input.movement,
      label: input.label,
      balanceAfter,
      ...(input.amountFcfa !== undefined ? { amountFcfa: input.amountFcfa } : {}),
      ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
      ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
    },
  });

  return balanceAfter;
}

/** Consomme des crédits. Lève `InsufficientCreditsError` si le solde ne couvre pas. */
export function debitCredits(tx: TxClient, input: MovementInput): Promise<number> {
  return apply(tx, input, -1);
}

/** Ajoute des crédits (achat, remboursement, ajustement administrateur). */
export function creditCredits(tx: TxClient, input: MovementInput): Promise<number> {
  return apply(tx, input, 1);
}

/**
 * Ouvre une transaction sérialisable verrouillée sur l'utilisateur et y
 * exécute `fn`.
 *
 * C'est la même construction que les retraits : `pg_advisory_xact_lock` met
 * les demandes d'un même utilisateur en file, si bien que la seconde voit le
 * débit de la première au lieu de lire un solde périmé. Le verrou est libéré
 * au commit comme au rollback.
 */
export function withUserCredits<T>(userId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await lockUserTx(tx, userId);
      return fn(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Solde courant, sans transaction — lecture seule. */
export async function getBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return user?.credits ?? 0;
}
