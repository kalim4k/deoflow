/**
 * Parrainage — attribution du code, rattachement du filleul, gain de commission.
 *
 * L'attribution est CONSERVATRICE par construction : elle ne s'écrit qu'une
 * fois, sur un compte qui n'a pas encore de parrain, et jamais vers soi-même.
 * Toutes les portes d'entrée passent par `attachPendingReferral()`, qui est
 * idempotent — on peut donc l'appeler depuis plusieurs endroits sans avoir à
 * savoir lequel arrivera le premier.
 */
import 'server-only';
import { cookies } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { log } from '@/lib/server/observability/log';
import type { TxClient } from '@/lib/server/withdrawals/lock';
import {
  COMMISSION_RATE_BPS,
  REFERRAL_ALPHABET,
  REFERRAL_CODE_LENGTH,
  commissionFor,
  isReferralCodeShaped,
  normalizeReferralCode,
} from '@/lib/deoflow/referrals';

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
export const REFERRAL_COOKIE = `${COOKIE_PREFIX}-ref`;

/**
 * Fenêtre pendant laquelle un compte tout neuf peut encore être rattaché.
 *
 * Elle existe pour la seule voie qui ne passe pas par notre route d'inscription
 * — la connexion Google, dont le gestionnaire de retour est un fichier protégé.
 * Le rattachement s'y fait au premier `/api/auth/me`, quelques secondes après
 * la création du compte.
 *
 * Le bornage est l'important : sans lui, un utilisateur de longue date qui
 * clique un jour sur le lien d'un ami se retrouverait rétroactivement parrainé,
 * et TOUS ses achats à venir seraient commissionnés. Un parrainage récompense
 * l'acquisition d'un nouveau client, pas la capture d'un client déjà acquis.
 */
const ATTACH_WINDOW_MS = 60 * 60 * 1000;

/**
 * Ce compte est-il assez récent pour être encore rattaché ?
 *
 * Exposé pour que `/api/auth/me` puisse écarter le cas courant — un habitué
 * qui se reconnecte — SANS ouvrir la moindre requête : sa date de création est
 * déjà chargée par cette route.
 */
export function isWithinAttachWindow(createdAt: Date | null | undefined): boolean {
  if (!createdAt) return false;
  return Date.now() - createdAt.getTime() <= ATTACH_WINDOW_MS;
}

/* ── Code public ────────────────────────────────────────────────────────── */

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REFERRAL_CODE_LENGTH));
  let out = '';
  for (const byte of bytes) {
    // Le modulo biaise très légèrement vers le début de l'alphabet (256 n'est
    // pas un multiple de 31). Sans conséquence : le code n'est pas un secret,
    // il désigne publiquement un compte.
    out += REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length];
  }
  return out;
}

/**
 * Code du parrain, créé à la demande.
 *
 * Paresseux : la plupart des comptes ne parrainent jamais. En générer un à
 * l'inscription remplirait l'espace de noms de codes qui ne serviront pas.
 *
 * La collision est traitée par la contrainte d'unicité, pas par une lecture
 * préalable : deux ouvertures simultanées de la page passeraient toutes les
 * deux un `findFirst` vide avant que l'une n'écrive.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode as string;
    } catch (err) {
      // P2002 = unicité violée. Deux cas possibles, distingués par une
      // relecture : le code était pris (on retente), ou c'est cet
      // utilisateur-ci qui vient d'en obtenir un en parallèle (on le rend).
      if (!isUniqueViolation(err)) throw err;
      const fresh = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (fresh?.referralCode) return fresh.referralCode;
    }
  }
  throw new Error('referral: impossible d’attribuer un code après 5 tentatives');
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/* ── Rattachement du filleul ────────────────────────────────────────────── */

/**
 * Rattache l'utilisateur au parrain porté par son cookie, si tout concorde.
 *
 * Silencieux et sans effet quand quoi que ce soit cloche — un parrainage raté
 * n'est pas une erreur d'inscription, et ne doit jamais empêcher quelqu'un de
 * créer son compte.
 *
 * Renvoie l'identifiant du parrain retenu, ou `null`.
 */
export async function attachPendingReferral(userId: string): Promise<string | null> {
  // Défensif ICI plutôt qu'à chaque appel : tous les appelants sont des routes
  // d'authentification, et aucune ne doit refuser une inscription parce que le
  // registre de parrainage a hoqueté.
  try {
    return await attach(userId);
  } catch (err) {
    log.error('referral: rattachement impossible', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function attach(userId: string): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(REFERRAL_COOKIE)?.value;
  // Aucun cookie : le cas de très loin le plus courant (chacun des `/me` de
  // tous les comptes du site). On sort en silence, sans rien journaliser.
  if (!raw) return null;

  const code = normalizeReferralCode(raw);
  if (!isReferralCodeShaped(code))
    return refuse(userId, 'code mal formé', { code: raw.slice(0, 12) });

  const [referee, referrer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referredById: true, createdAt: true, referralCode: true },
    }),
    prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, status: true } }),
  ]);

  if (!referee) return refuse(userId, 'filleul introuvable', { code });
  if (!referrer) return refuse(userId, 'aucun compte ne porte ce code', { code });
  // Déjà parrainé : le premier contact l'emporte, définitivement.
  if (referee.referredById) {
    log.info('referral: déjà parrainé, on garde le premier', {
      userId,
      referrerId: referee.referredById,
    });
    return referee.referredById;
  }
  // On ne se parraine pas soi-même — la fraude la plus évidente du programme.
  if (referrer.id === referee.id) return refuse(userId, 'auto-parrainage', { code });
  // Un compte suspendu ne doit pas continuer d'encaisser.
  if (referrer.status !== 'ACTIVE') return refuse(userId, 'parrain suspendu', { code });
  // Hors fenêtre : voir `ATTACH_WINDOW_MS`. C'est le refus le plus probable en
  // pratique — un compte qui existait déjà avant le clic.
  const ageMinutes = Math.round((Date.now() - referee.createdAt.getTime()) / 60_000);
  if (Date.now() - referee.createdAt.getTime() > ATTACH_WINDOW_MS) {
    return refuse(userId, 'compte trop ancien pour être parrainé', { code, ageMinutes });
  }

  // `updateMany` avec `referredById: null` dans le filtre : deux appels
  // concurrents (inscription + premier /me) ne peuvent pas se marcher dessus,
  // le second ne trouve plus de ligne à mettre à jour.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, referredById: null },
    data: { referredById: referrer.id, referredAt: new Date() },
  });

  if (count > 0) {
    log.info('referral: filleul rattaché', { userId, referrerId: referrer.id });
  }
  return referrer.id;
}

/**
 * Journalise POURQUOI un rattachement n'a pas eu lieu, et rend `null`.
 *
 * Un parrainage qui échoue est silencieux par conception — il ne doit jamais
 * gêner une inscription. Le revers, c'est qu'il est alors indiagnosticable : on
 * ne voit qu'un compteur qui reste à zéro. Cette trace est le seul endroit qui
 * dise ce qui s'est passé.
 */
function refuse(userId: string, reason: string, extra: Record<string, unknown> = {}): null {
  log.info('referral: rattachement refusé', { userId, reason, ...extra });
  return null;
}

/** Efface le cookie une fois le rattachement joué — il n'a plus rien à porter. */
export async function clearReferralCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(REFERRAL_COOKIE, '', { path: '/', maxAge: 0 });
}

/* ── Gain de commission ─────────────────────────────────────────────────── */

export interface AccrueInput {
  /** Filleul dont l'achat vient d'être confirmé. */
  refereeId: string;
  orderId: string;
  /** Montant payé, FCFA. */
  amountFcfa: number;
}

/**
 * Inscrit la commission due au parrain — À L'INTÉRIEUR de la transaction qui
 * règle l'achat.
 *
 * Trois propriétés tiennent la justesse de l'argent :
 *
 *   1. **Aucune écriture sur la ligne du parrain.** La transaction appelante
 *      détient le verrou de l'ACHETEUR, pas celui du parrain. Incrémenter un
 *      solde ici se ferait sans verrou : deux filleuls payant en même temps
 *      liraient la même valeur et un gain serait perdu. On insère une ligne,
 *      qui ne lit rien.
 *   2. **`orderId` est unique en base.** Un règlement rejoué ne peut pas payer
 *      deux fois la même commande, même si la réclamation par `updateMany`
 *      venait à changer.
 *   3. **Le taux est figé sur la ligne.** Changer le barème demain ne réécrit
 *      pas ce qui a été gagné hier.
 *
 * Ne lève jamais : une commission ratée ne doit pas annuler la transaction qui
 * accorde ses crédits à l'acheteur. Il a payé, il est servi — quoi qu'il
 * arrive au registre de parrainage.
 */
export async function accrueCommission(tx: TxClient, input: AccrueInput): Promise<number> {
  try {
    const referee = await tx.user.findUnique({
      where: { id: input.refereeId },
      select: { referredById: true },
    });
    const referrerId = referee?.referredById;
    if (!referrerId) return 0;

    const amount = commissionFor(input.amountFcfa, COMMISSION_RATE_BPS);
    if (amount <= 0) return 0;

    await tx.referralCommission.create({
      data: {
        referrerId,
        refereeId: input.refereeId,
        orderId: input.orderId,
        orderAmount: input.amountFcfa,
        rateBps: COMMISSION_RATE_BPS,
        amount,
        status: 'EARNED',
      },
    });

    log.info('referral: commission acquise', { orderId: input.orderId, referrerId, amount });
    return amount;
  } catch (err) {
    // Le doublon est le cas NORMAL d'un rejeu : la commission existe déjà,
    // il n'y a rien à faire et rien à signaler.
    if (isUniqueViolation(err)) return 0;
    log.error('referral: commission non enregistrée', {
      orderId: input.orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/* ── Lecture ────────────────────────────────────────────────────────────── */

export interface ReferralStats {
  /** Filleuls rattachés. */
  referrals: number;
  /** Filleuls ayant acheté au moins une fois. */
  buyers: number;
  /**
   * Part des filleuls qui ont acheté, en points de base (2500 = 25 %).
   *
   * En points de base et non en pourcentage flottant : la même unité que le
   * barème, et aucun `0.30000000000000004` à afficher.
   */
  conversionBps: number;
  /** Chiffre d'affaires produit par les filleuls, FCFA. */
  volumeFcfa: number;
  /** Commissions acquises depuis le début, FCFA. */
  earnedFcfa: number;
  /** Demandes de retrait en attente de validation, FCFA. */
  pendingFcfa: number;
  /** Retraits effectivement versés, FCFA. */
  paidFcfa: number;
  /** Disponible pour une nouvelle demande maintenant, FCFA. */
  availableFcfa: number;
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const [referrals, earned, buyers, pending, paid] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.referralCommission.aggregate({
      where: { referrerId: userId, status: { in: ['EARNED', 'PAID'] } },
      _sum: { amount: true, orderAmount: true },
    }),
    prisma.referralCommission.findMany({
      where: { referrerId: userId, status: { in: ['EARNED', 'PAID'] } },
      distinct: ['refereeId'],
      select: { refereeId: true },
    }),
    // En attente de validation — l'argent est promis, pas encore parti.
    prisma.withdrawal.aggregate({
      where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
      _sum: { amount: true },
    }),
    prisma.withdrawal.aggregate({
      where: { userId, status: 'COMPLETED' },
      _sum: { amount: true },
    }),
  ]);

  const earnedFcfa = earned._sum.amount ?? 0;
  const pendingFcfa = pending._sum.amount ?? 0;
  const paidFcfa = paid._sum.amount ?? 0;
  const buyerCount = buyers.length;

  return {
    referrals,
    buyers: buyerCount,
    // Sans filleul, le taux n'est pas « 0 % » mais « pas encore mesurable ».
    // Zéro est la seule valeur honnête à afficher, et l'écran dira pourquoi.
    conversionBps: referrals > 0 ? Math.round((buyerCount / referrals) * 10_000) : 0,
    volumeFcfa: earned._sum.orderAmount ?? 0,
    earnedFcfa,
    pendingFcfa,
    paidFcfa,
    // Les deux sont retranchés : une demande en attente réserve son montant,
    // sans quoi on pourrait demander deux fois le même argent avant que la
    // première ne soit traitée. Jamais négatif — un versement manuel saisi en
    // back-office peut dépasser le gain.
    availableFcfa: Math.max(0, earnedFcfa - pendingFcfa - paidFcfa),
  };
}

export interface CommissionRow {
  id: string;
  amount: number;
  orderAmount: number;
  rateBps: number;
  status: string;
  createdAt: string;
  /** Filleul, réduit à une initiale — son email ne regarde pas le parrain. */
  referee: string;
}

export async function listCommissions(userId: string, take = 20): Promise<CommissionRow[]> {
  const rows = await prisma.referralCommission.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { referee: { select: { email: true, name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    orderAmount: row.orderAmount,
    rateBps: row.rateBps,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    referee: maskIdentity(row.referee),
  }));
}

/**
 * Un parrain n'a pas à connaître l'adresse de ses filleuls.
 *
 * Il lui faut de quoi distinguer deux lignes, pas de quoi les démarcher. On
 * rend donc la première lettre et le domaine masqué : « a•••@gmail.com ».
 */
function maskIdentity(referee: { email: string; name: string | null }): string {
  if (referee.name && referee.name.trim().length > 0) {
    const first = referee.name.trim().split(/\s+/)[0] ?? '';
    return first.length > 1 ? `${first[0]}${'•'.repeat(Math.min(first.length - 1, 4))}` : first;
  }
  const [local = '', domain = ''] = referee.email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

export type { Prisma };
