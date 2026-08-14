/**
 * Achat de crédits — création du panier Maketou, puis règlement.
 *
 * Deux chemins mènent au règlement d'une même commande :
 *   - le navigateur, qui sonde tant que l'acheteur regarde l'écran ;
 *   - le cron `purchase-reconcile`, qui rattrape les autres.
 *
 * Sans webhook chez Maketou, le second n'est pas un filet de sécurité : sur
 * mobile, la confirmation Tmoney se fait dans l'application de l'opérateur et
 * revenir au navigateur n'a rien d'automatique. **Le cas majoritaire passe par
 * le cron.**
 *
 * Ces deux chemins peuvent donc tomber en même temps sur la même commande.
 * C'est le seul endroit de l'application où une erreur de concurrence crée de
 * l'argent — d'où la réclamation par `updateMany` décrite dans `settle()`.
 */
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { creditCredits, withUserCredits } from '@/lib/server/credits';
import { createLogger } from '@/lib/server/logger';
import {
  MaketouError,
  MaketouUnconfiguredError,
  getMaketouProvider,
} from '@/lib/server/payments/maketou';
import { accrueCommission } from '@/lib/server/referrals/service';
import { findPack } from '@/lib/deoflow/packs';

const logger = createLogger();

export const PURCHASE_PROVIDER = 'maketou';

/**
 * Durée de vie d'une commande d'achat.
 *
 * Généreuse à dessein : `order-expiration` bascule en `EXPIRED` toute commande
 * `PENDING` échue, et un paiement mobile money peut prendre de longues minutes
 * — le temps de trouver son téléphone, son code, du réseau. Le règlement
 * accepte de toute façon `EXPIRED` (voir `settle()`), donc cette durée n'est
 * qu'une hygiène d'affichage, pas une limite d'encaissement.
 */
const ORDER_TTL_MS = 24 * 60 * 60 * 1000;

/** Au-delà, on cesse d'interroger Maketou sur une commande jamais aboutie. */
const RECONCILE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// ───────────────────────────────────────────────────────────────────────
// Erreurs
// ───────────────────────────────────────────────────────────────────────

export class PurchaseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PurchaseError';
  }
}

// ───────────────────────────────────────────────────────────────────────
// Métadonnées portées par la commande
// ───────────────────────────────────────────────────────────────────────

interface PurchaseMeta {
  packId: string;
  credits: number;
}

/**
 * Le nombre de crédits est figé À L'ACHAT, jamais relu dans le catalogue au
 * moment du règlement.
 *
 * Même raison que `Generation.credits` : entre le paiement et sa confirmation,
 * un pack peut avoir changé de contenu. L'acheteur doit recevoir ce qui lui a
 * été promis au moment où il a payé.
 */
function readMeta(metadata: Prisma.JsonValue | null): PurchaseMeta | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const bag = metadata as Record<string, unknown>;
  const packId = typeof bag.packId === 'string' ? bag.packId : null;
  const credits = typeof bag.credits === 'number' ? bag.credits : null;
  if (!packId || credits === null || !Number.isInteger(credits) || credits <= 0) return null;
  return { packId, credits };
}

// ───────────────────────────────────────────────────────────────────────
// Démarrage
// ───────────────────────────────────────────────────────────────────────

export interface StartPurchaseInput {
  userId: string;
  packId: string;
  /** En-tête `Idempotency-Key` — un double-clic ne doit pas créer deux paniers. */
  idempotencyKey?: string | null;
}

export interface StartPurchaseResult {
  orderId: string;
  paymentUrl: string;
  packId: string;
  credits: number;
  amountFcfa: number;
}

export async function startPurchase(input: StartPurchaseInput): Promise<StartPurchaseResult> {
  const pack = findPack(input.packId);
  if (!pack) {
    throw new PurchaseError('PACK_UNKNOWN', `Pack inconnu : ${input.packId}`, 400);
  }

  const key = input.idempotencyKey?.trim() || null;
  if (key) {
    // Rejeu : renvoyer le panier déjà ouvert plutôt qu'en créer un second.
    const existing = await prisma.order.findUnique({ where: { idempotencyKey: key } });
    if (existing?.paymentUrl && existing.userId === input.userId) {
      const meta = readMeta(existing.metadata);
      return {
        orderId: existing.id,
        paymentUrl: existing.paymentUrl,
        packId: meta?.packId ?? pack.id,
        credits: meta?.credits ?? pack.credits,
        amountFcfa: existing.amount,
      };
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, name: true },
  });
  if (!user) throw new PurchaseError('USER_NOT_FOUND', 'Utilisateur introuvable', 404);

  const provider = resolveProvider();

  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      // Le prix vient du catalogue serveur. Le corps de la requête ne porte
      // qu'un `packId` : le navigateur n'annonce jamais ce qu'il va payer.
      amount: pack.priceFcfa,
      currency: 'XOF',
      status: 'PENDING',
      provider: PURCHASE_PROVIDER,
      customerEmail: user.email,
      ...(user.name ? { customerName: user.name } : {}),
      metadata: { packId: pack.id, credits: pack.credits },
      ...(key ? { idempotencyKey: key } : {}),
      expiresAt: new Date(Date.now() + ORDER_TTL_MS),
    },
  });

  const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  const returnUrl = `${appUrl}/wallet/topup/confirmation?order=${order.id}`;

  try {
    const charge = await provider.charge({
      amount: pack.priceFcfa,
      currency: 'XOF',
      customer: { email: user.email, ...(user.name ? { name: user.name } : {}) },
      metadata: { packId: pack.id },
      // Maketou n'a qu'une URL de retour : elle sert les deux issues, et
      // l'écran de confirmation lit le vrai statut auprès de notre serveur.
      successUrl: returnUrl,
      failureUrl: returnUrl,
      externalRef: order.id,
    });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { providerChargeId: charge.providerChargeId, paymentUrl: charge.paymentUrl },
    });

    return {
      orderId: updated.id,
      paymentUrl: charge.paymentUrl,
      packId: pack.id,
      credits: pack.credits,
      amountFcfa: pack.priceFcfa,
    };
  } catch (err) {
    // Le panier n'a pas d'URL : l'acheteur ne peut pas atteindre la page de
    // paiement, donc rien ne sera payé. Fermer la commande tout de suite évite
    // de la laisser traîner 24 h dans le rattrapage.
    await prisma.order
      .updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } })
      .catch(() => undefined);

    logger.error('maketou.checkout.failed', {
      orderId: order.id,
      packId: pack.id,
      err: err instanceof Error ? err.message : String(err),
    });

    if (err instanceof MaketouError) {
      throw new PurchaseError(err.code, err.message, err.status === 401 ? 503 : err.status);
    }
    throw err;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Règlement
// ───────────────────────────────────────────────────────────────────────

export type SettleOutcome =
  | { status: 'PAID'; credits: number; balanceAfter: number | null; alreadySettled: boolean }
  | { status: 'PENDING' }
  | { status: 'FAILED'; code: string };

export async function settlePurchase(orderId: string): Promise<SettleOutcome> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.provider !== PURCHASE_PROVIDER) {
    throw new PurchaseError('ORDER_NOT_FOUND', 'Commande introuvable', 404);
  }

  const meta = readMeta(order.metadata);
  if (!order.userId || !meta) {
    throw new PurchaseError('ORDER_MALFORMED', 'Commande sans pack exploitable', 500);
  }

  if (order.status === 'PAID') {
    return { status: 'PAID', credits: meta.credits, balanceAfter: null, alreadySettled: true };
  }
  if (order.status === 'FAILED') return { status: 'FAILED', code: 'PAYMENT_FAILED' };
  if (!order.providerChargeId) return { status: 'FAILED', code: 'CHECKOUT_NEVER_STARTED' };

  const status = await resolveProvider().pollCharge(order.providerChargeId);

  if (status === 'PENDING') return { status: 'PENDING' };

  if (status === 'FAILED') {
    await prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'FAILED' },
    });
    return { status: 'FAILED', code: 'PAYMENT_FAILED' };
  }

  return grant(order.id, order.userId, order.amount, meta);
}

/**
 * Accorde les crédits, une fois et une seule.
 *
 * `withUserCredits()` ouvre une transaction sérialisable tenue par
 * `pg_advisory_xact_lock(userId)` : deux règlements concurrents de la même
 * commande se mettent en file au lieu de lire tous les deux un solde périmé.
 *
 * Puis `updateMany` sert de jeton d'exclusivité. Le premier arrivé fait passer
 * la ligne de PENDING/EXPIRED à PAID et obtient `count === 1` ; le second ne
 * trouve plus rien à mettre à jour, obtient `count === 0`, et ne crédite pas.
 * C'est la réclamation AVANT le crédit qui rend l'opération sûre — l'inverse
 * (créditer puis marquer) laisserait une fenêtre de double-crédit.
 *
 * Un échec de sérialisation (P2034) fait échouer toute la transaction sans
 * rien accorder ; le cron repassera dans les cinq minutes. Ne pas rattraper
 * ici : une reprise silencieuse serait plus difficile à auditer qu'un retard.
 */
function grant(
  orderId: string,
  userId: string,
  amountFcfa: number,
  meta: PurchaseMeta,
): Promise<SettleOutcome> {
  return withUserCredits(userId, async (tx) => {
    const claimed = await tx.order.updateMany({
      // `EXPIRED` est là volontairement : `order-expiration` a pu passer entre
      // le paiement et sa confirmation. Si Maketou dit « payé », nous devons
      // les crédits — quel que soit l'état de notre propre horloge.
      where: { id: orderId, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'PAID', paidAt: new Date() },
    });

    if (claimed.count === 0) {
      return { status: 'PAID', credits: meta.credits, balanceAfter: null, alreadySettled: true };
    }

    const balanceAfter = await creditCredits(tx, {
      userId,
      credits: meta.credits,
      movement: 'PURCHASE',
      label: `Achat de ${meta.credits} crédits`,
      amountFcfa,
      orderId,
    });

    // La commission de parrainage naît ICI, dans la transaction qui vient de
    // réclamer la commande. Elle hérite donc de la même garantie
    // exactement-une-fois : si la transaction échoue, elle n'a jamais existé.
    //
    // Elle n'écrit AUCUN solde sur la ligne du parrain — le verrou tenu est
    // celui de l'acheteur, pas le sien. Voir `accrueCommission`.
    await accrueCommission(tx, { refereeId: userId, orderId, amountFcfa });

    logger.info('maketou.purchase.settled', { orderId, credits: meta.credits, balanceAfter });
    return { status: 'PAID', credits: meta.credits, balanceAfter, alreadySettled: false };
  });
}

// ───────────────────────────────────────────────────────────────────────
// Rattrapage
// ───────────────────────────────────────────────────────────────────────

export interface ReconcileResult {
  scanned: number;
  settled: number;
  failed: number;
  skipped: number;
}

/**
 * Interroge Maketou pour toutes les commandes encore ouvertes.
 *
 * C'est le chemin principal, pas un secours : voir l'en-tête du module.
 */
export async function reconcilePurchases(
  opts: { batchSize?: number } = {},
): Promise<ReconcileResult> {
  const batchSize = opts.batchSize ?? 50;

  const candidates = await prisma.order.findMany({
    where: {
      provider: PURCHASE_PROVIDER,
      status: { in: ['PENDING', 'EXPIRED'] },
      providerChargeId: { not: null },
      createdAt: { gte: new Date(Date.now() - RECONCILE_WINDOW_MS) },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    select: { id: true },
  });

  const result: ReconcileResult = { scanned: candidates.length, settled: 0, failed: 0, skipped: 0 };

  for (const candidate of candidates) {
    try {
      const outcome = await settlePurchase(candidate.id);
      if (outcome.status === 'PAID' && !outcome.alreadySettled) result.settled++;
      else if (outcome.status === 'FAILED') result.failed++;
      else result.skipped++;
    } catch (err) {
      // Un hoquet réseau ne doit JAMAIS conclure à un échec de paiement : la
      // commande reste ouverte et repassera au tour suivant. La marquer en
      // échec ici reviendrait à refuser des crédits déjà payés.
      result.skipped++;
      logger.warn('maketou.reconcile.error', {
        orderId: candidate.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ───────────────────────────────────────────────────────────────────────

function resolveProvider(): ReturnType<typeof getMaketouProvider> {
  try {
    return getMaketouProvider();
  } catch (err) {
    if (err instanceof MaketouUnconfiguredError) {
      throw new PurchaseError(err.code, err.message, 503);
    }
    throw err;
  }
}
