/**
 * Agrégats du back-office.
 *
 * Séparé de la route pour être testable sans requête HTTP : ce sont des
 * chiffres d'argent, et la seule façon de prouver qu'un agrégat est juste est
 * de le confronter à un jeu de lignes connu.
 *
 * Deux règles tenues partout ici :
 *
 *   1. **Tout est calculé en SQL** (`groupBy` / `aggregate`). Charger les
 *      lignes pour les additionner en JavaScript marche sur une base de
 *      démonstration et meurt à dix mille commandes.
 *
 *   2. **Une métrique, une source, et toujours la même.** Le chiffre
 *      d'affaires vient de `Order`, jamais de `CreditTransaction.amountFcfa` —
 *      `Order` est l'enregistrement canonique d'un achat (`purchases/service.ts`
 *      crée la commande puis la réclame par `updateMany` avant de créditer).
 *      Les crédits viennent de `CreditTransaction`, dont la somme signée
 *      redonne `User.credits` par construction. Prendre tantôt l'une tantôt
 *      l'autre ferait diverger deux écrans censés dire la même chose.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { CREDIT_FCFA, MARGIN } from '@/lib/deoflow/pricing';

export const STATS_PERIODS = ['7d', '30d', 'all'] as const;
export type StatsPreset = (typeof STATS_PERIODS)[number];
/** `custom` n'est pas un préréglage : il naît d'un couple de dates. */
export type StatsPeriod = StatsPreset | 'custom';

const DAY_MS = 24 * 60 * 60 * 1000;

export function parsePeriod(raw: string | null): StatsPreset {
  return (STATS_PERIODS as readonly string[]).includes(raw ?? '') ? (raw as StatsPreset) : '30d';
}

/** Début de la fenêtre, ou `null` pour « depuis toujours ». */
export function periodStart(period: StatsPreset, now: Date = new Date()): Date | null {
  if (period === 'all') return null;
  return new Date(now.getTime() - (period === '7d' ? 7 : 30) * DAY_MS);
}

/**
 * Fenêtre résolue. `null` d'un côté = borne ouverte.
 *
 * Les préréglages produisent `until: null` (jusqu'à maintenant) ; seule une
 * plage personnalisée peut fermer la borne haute.
 */
export interface StatsRange {
  period: StatsPeriod;
  since: Date | null;
  until: Date | null;
}

/** Plage explicite refusée — la route répond 400 plutôt que d'inventer une fenêtre. */
export class StatsRangeError extends Error {
  readonly code = 'STATS_RANGE_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'StatsRangeError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `YYYY-MM-DD` → instant UTC.
 *
 * Les bornes sont posées sur la journée ENTIÈRE : `from` à 00:00:00.000 et
 * `to` à 23:59:59.999. Un administrateur qui choisit « au 14 août » veut
 * évidemment inclure le 14 août ; borner à minuit amputerait la dernière
 * journée de la fenêtre, et l'erreur passerait inaperçue — un jour de chiffre
 * d'affaires en moins ressemble à un jour creux.
 *
 * UTC et non l'heure locale du serveur : le Togo est à UTC+0, donc la journée
 * calendaire de l'exploitant coïncide exactement. Depuis un autre fuseau, les
 * bornes se décaleraient de l'écart correspondant.
 */
function dayBound(iso: string, edge: 'start' | 'end'): Date | null {
  if (!DATE_RE.test(iso)) return null;
  const d = new Date(`${iso}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
  if (Number.isNaN(d.getTime())) return null;

  // Vérification aller-retour, indispensable : JavaScript ne rejette pas les
  // jours hors calendrier, il les fait DÉBORDER. `2026-02-31` devient le
  // 3 mars, `2026-04-31` le 1er mai. Sans ce contrôle, une date inexistante
  // produirait une fenêtre décalée de quelques jours — silencieusement, et sur
  // des chiffres d'argent.
  if (d.toISOString().slice(0, 10) !== iso) return null;

  return d;
}

/**
 * Résout la fenêtre demandée.
 *
 * Deux traitements volontairement différents :
 *
 *   - un `period` inconnu retombe sur 30 jours. C'est un nom de préréglage mal
 *     orthographié : un paramètre d'affichage ne doit pas casser un écran.
 *   - une date explicite invalide LÈVE. L'administrateur a désigné une fenêtre
 *     précise ; lui en servir une autre en silence, sur des chiffres d'argent,
 *     est pire qu'une erreur affichée.
 */
export function resolveStatsRange(
  params: { period?: string | null; from?: string | null; to?: string | null },
  now: Date = new Date(),
): StatsRange {
  const rawFrom = params.from?.trim() || null;
  const rawTo = params.to?.trim() || null;

  if (rawFrom || rawTo) {
    const since = rawFrom ? dayBound(rawFrom, 'start') : null;
    const until = rawTo ? dayBound(rawTo, 'end') : null;

    if (rawFrom && !since) throw new StatsRangeError(`Date de début invalide : ${rawFrom}`);
    if (rawTo && !until) throw new StatsRangeError(`Date de fin invalide : ${rawTo}`);
    if (since && until && since > until) {
      throw new StatsRangeError('La date de début est postérieure à la date de fin.');
    }

    return { period: 'custom', since, until };
  }

  const preset = parsePeriod(params.period ?? null);
  return { period: preset, since: periodStart(preset, now), until: null };
}

/**
 * Coût fournisseur, en FCFA, de crédits consommés chez nous.
 *
 * Un crédit Deoflow vaut `1/MARGIN` crédit kie.ai, et un crédit kie.ai s'achète
 * au même tarif que le nôtre (`CREDIT_FCFA`). Le calcul passe donc par les deux
 * constantes plutôt que par le facteur 1 qu'elles donnent aujourd'hui : le jour
 * où la marge bouge, la marge affichée doit bouger avec elle.
 */
export function providerCostFcfa(creditsConsumed: number): number {
  return Math.round((creditsConsumed / MARGIN) * CREDIT_FCFA);
}

export interface AdminStats {
  period: StatsPeriod;
  /** Début de fenêtre en ISO, `null` si « depuis toujours ». */
  since: string | null;
  /** Fin de fenêtre en ISO, `null` si « jusqu'à maintenant ». */
  until: string | null;
  revenue: {
    grossFcfa: number;
    orders: number;
    /** Panier moyen. 0 quand il n'y a aucune commande — pas une division par zéro. */
    averageFcfa: number;
  };
  credits: {
    sold: number;
    consumed: number;
    refunded: number;
    adjusted: number;
    /** Crédits vendus et pas encore consommés, TOUTES périodes confondues. */
    outstanding: number;
  };
  generations: {
    total: number;
    succeeded: number;
    failed: number;
    running: number;
    /** Échecs / (échecs + succès), en points de base. Les générations encore
     *  en cours sont exclues : elles n'ont pas encore échoué. */
    failureRateBps: number;
  };
  economics: {
    /** Coût kie.ai des crédits consommés sur la période. */
    providerCostFcfa: number;
    /** Encaissé moins coût fournisseur sur la même fenêtre. */
    marginFcfa: number;
  };
  users: {
    total: number;
    new: number;
    /** Comptes ayant payé au moins une commande, depuis toujours. */
    buyers: number;
    /** Comptes ayant lancé au moins une génération sur la période. */
    active: number;
  };
  withdrawals: {
    pendingCount: number;
    pendingFcfa: number;
    processingFcfa: number;
    paidFcfa: number;
  };
  commissions: {
    earnedFcfa: number;
    /** Nombre de rattachements de parrainage, depuis toujours. */
    referrals: number;
  };
}

type StatsClient = Pick<
  PrismaClient,
  'order' | 'creditTransaction' | 'generation' | 'user' | 'withdrawal' | 'referralCommission'
>;

/** Somme d'un `_sum` Prisma, qui vaut `null` quand aucune ligne ne correspond. */
function sum(value: number | null | undefined): number {
  return value ?? 0;
}

export async function computeAdminStats(
  prisma: StatsClient,
  input: StatsPeriod | StatsRange,
  now: Date = new Date(),
): Promise<AdminStats> {
  // Un préréglage passé directement reste accepté : c'est la forme qu'utilisent
  // les tests et la plupart des appels. Une plage résolue passe telle quelle.
  const range = typeof input === 'string' ? resolveStatsRange({ period: input }, now) : input;
  const { period, since, until } = range;

  const inPeriod =
    since || until
      ? { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) }
      : undefined;

  const [
    orders,
    movements,
    lifetimeMovements,
    generations,
    totalUsers,
    newUsers,
    buyerRows,
    activeRows,
    withdrawalRows,
    commissionSum,
    referralCount,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { status: 'PAID', ...(inPeriod ? { paidAt: inPeriod } : {}) },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.creditTransaction.groupBy({
      by: ['movement'],
      where: inPeriod ? { createdAt: inPeriod } : {},
      _sum: { credits: true },
    }),
    // L'encours n'a pas de période : c'est une dette envers les créateurs à
    // l'instant T, pas un flux. Le restreindre à 30 jours donnerait un chiffre
    // qui ne veut rien dire.
    prisma.creditTransaction.aggregate({ _sum: { credits: true } }),
    prisma.generation.groupBy({
      by: ['status'],
      // Les visages d'avatar sont du matériel de travail, pas de la production.
      // Les compter gonflerait le volume et fausserait le taux d'échec.
      where: { purpose: 'CREATION', ...(inPeriod ? { createdAt: inPeriod } : {}) },
      _count: true,
    }),
    prisma.user.count(),
    prisma.user.count({ where: inPeriod ? { createdAt: inPeriod } : {} }),
    prisma.order.groupBy({ by: ['userId'], where: { status: 'PAID', userId: { not: null } } }),
    prisma.generation.groupBy({
      by: ['userId'],
      where: inPeriod ? { createdAt: inPeriod } : {},
    }),
    prisma.withdrawal.groupBy({ by: ['status'], _sum: { amount: true }, _count: true }),
    prisma.referralCommission.aggregate({
      where: { status: { in: ['EARNED', 'PAID'] } },
      _sum: { amount: true },
    }),
    prisma.user.count({ where: { referredById: { not: null } } }),
  ]);

  const byMovement = (name: string): number =>
    sum(movements.find((m) => m.movement === name)?._sum.credits);

  // `credits` est signé : les consommations sont négatives. On les rend
  // positives pour l'affichage, mais jamais dans un total.
  const sold = byMovement('PURCHASE');
  const consumed = Math.abs(byMovement('GENERATION'));
  const refunded = byMovement('REFUND');
  const adjusted = byMovement('ADMIN_ADJUSTMENT');

  const byStatus = (name: string): number =>
    generations.find((g) => g.status === name)?._count ?? 0;

  const succeeded = byStatus('SUCCEEDED');
  const failed = byStatus('FAILED');
  const settled = succeeded + failed;
  const running = byStatus('PENDING') + byStatus('RUNNING');

  const withdrawalBy = (name: string) => withdrawalRows.find((w) => w.status === name);
  const pending = withdrawalBy('PENDING');

  const grossFcfa = sum(orders._sum.amount);
  const cost = providerCostFcfa(consumed);

  return {
    period,
    since: since?.toISOString() ?? null,
    until: until?.toISOString() ?? null,
    revenue: {
      grossFcfa,
      orders: orders._count,
      averageFcfa: orders._count > 0 ? Math.round(grossFcfa / orders._count) : 0,
    },
    credits: {
      sold,
      consumed,
      refunded,
      adjusted,
      outstanding: sum(lifetimeMovements._sum.credits),
    },
    generations: {
      total: generations.reduce((acc, g) => acc + g._count, 0),
      succeeded,
      failed,
      running,
      failureRateBps: settled > 0 ? Math.round((failed / settled) * 10_000) : 0,
    },
    economics: { providerCostFcfa: cost, marginFcfa: grossFcfa - cost },
    users: {
      total: totalUsers,
      new: newUsers,
      buyers: buyerRows.length,
      active: activeRows.length,
    },
    withdrawals: {
      pendingCount: pending?._count ?? 0,
      pendingFcfa: sum(pending?._sum.amount),
      processingFcfa: sum(withdrawalBy('PROCESSING')?._sum.amount),
      paidFcfa: sum(withdrawalBy('COMPLETED')?._sum.amount),
    },
    commissions: {
      earnedFcfa: sum(commissionSum._sum.amount),
      referrals: referralCount,
    },
  };
}
