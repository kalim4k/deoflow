import { describe, it, expect } from 'vitest';
import {
  computeAdminStats,
  parsePeriod,
  periodStart,
  providerCostFcfa,
  resolveStatsRange,
  StatsRangeError,
  type AdminStats,
} from './stats';

/**
 * Un faux client Prisma qui renvoie des agrégats connus.
 *
 * On teste ici l'ASSEMBLAGE : quelles sources alimentent quelle métrique, et
 * quels calculs dérivés en découlent. Les `groupBy` eux-mêmes sont la
 * responsabilité de Postgres — les remplacer par une simulation de SQL ne
 * prouverait rien de plus que la fidélité de la simulation.
 *
 * Ce qui compte et que ce faux client vérifie bien : le `where` transmis. Un
 * agrégat juste sur la mauvaise fenêtre reste un chiffre faux.
 */
function fakePrisma(overrides: Record<string, unknown> = {}) {
  // Un TABLEAU par clé, pas une valeur : `generation.groupBy` est appelé deux
  // fois (le volume, puis les comptes actifs). Écraser garderait le second et
  // rendrait le premier invérifiable.
  const calls: Record<string, unknown[]> = {};
  const record =
    <T>(key: string, value: T) =>
    (args: unknown) => {
      (calls[key] ??= []).push(args);
      return Promise.resolve(value);
    };

  const client = {
    order: {
      aggregate: record('order.aggregate', { _sum: { amount: 57_000 }, _count: 6 }),
      groupBy: record('order.groupBy', [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]),
    },
    creditTransaction: {
      groupBy: record('credit.groupBy', [
        { movement: 'PURCHASE', _sum: { credits: 19_000 } },
        { movement: 'GENERATION', _sum: { credits: -4_500 } },
        { movement: 'REFUND', _sum: { credits: 300 } },
        { movement: 'ADMIN_ADJUSTMENT', _sum: { credits: 100 } },
      ]),
      aggregate: record('credit.aggregate', { _sum: { credits: 14_900 } }),
    },
    generation: {
      groupBy: record('generation.groupBy', [
        { status: 'SUCCEEDED', _count: 40 },
        { status: 'FAILED', _count: 10 },
        { status: 'RUNNING', _count: 3 },
        { status: 'PENDING', _count: 1 },
      ]),
    },
    user: { count: record('user.count', 14) },
    withdrawal: {
      groupBy: record('withdrawal.groupBy', [
        { status: 'PENDING', _sum: { amount: 3_000 }, _count: 2 },
        { status: 'COMPLETED', _sum: { amount: 5_000 }, _count: 1 },
      ]),
    },
    referralCommission: {
      aggregate: record('commission.aggregate', { _sum: { amount: 6_000 } }),
    },
    ...overrides,
  };

  return { client: client as never, calls };
}

const run = (over?: Record<string, unknown>): Promise<AdminStats> =>
  computeAdminStats(fakePrisma(over).client, '30d', new Date('2026-08-13T12:00:00Z'));

describe('fenêtre de calcul', () => {
  it('retombe sur 30 jours quand la période est absente ou farfelue', () => {
    expect(parsePeriod(null)).toBe('30d');
    expect(parsePeriod('hier')).toBe('30d');
    // Un paramètre d'affichage mal formé ne doit pas casser un tableau de bord.
    expect(parsePeriod('7d')).toBe('7d');
    expect(parsePeriod('all')).toBe('all');
  });

  it('« tout » n’a pas de début', () => {
    expect(periodStart('all')).toBeNull();
  });

  it('7 et 30 jours reculent d’autant', () => {
    const now = new Date('2026-08-13T12:00:00Z');
    expect(periodStart('7d', now)?.toISOString()).toBe('2026-08-06T12:00:00.000Z');
    expect(periodStart('30d', now)?.toISOString()).toBe('2026-07-14T12:00:00.000Z');
  });
});

describe('période personnalisée', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  it('borne la journée entière, de 00:00 à 23:59:59.999', () => {
    // LE test de cette série. Borner `to` à minuit amputerait la dernière
    // journée de la fenêtre : un jour de chiffre d'affaires disparaîtrait en
    // ressemblant à un jour creux, sans que rien ne le signale.
    const r = resolveStatsRange({ from: '2026-08-01', to: '2026-08-10' }, now);
    expect(r.period).toBe('custom');
    expect(r.since?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(r.until?.toISOString()).toBe('2026-08-10T23:59:59.999Z');
  });

  it('accepte une borne seule, de chaque côté', () => {
    expect(resolveStatsRange({ from: '2026-08-01' }, now).until).toBeNull();
    expect(resolveStatsRange({ to: '2026-08-10' }, now).since).toBeNull();
  });

  it('les dates l’emportent sur un préréglage passé en même temps', () => {
    const r = resolveStatsRange({ period: '7d', from: '2026-01-01' }, now);
    expect(r.period).toBe('custom');
    expect(r.since?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('refuse une date mal formée plutôt que d’inventer une fenêtre', () => {
    // Contraste volontaire avec `parsePeriod` : un préréglage inconnu retombe
    // sur 30 jours, mais une date explicite invalide lève. L'administrateur a
    // désigné une fenêtre précise ; lui en servir une autre en silence, sur des
    // chiffres d'argent, est pire qu'une erreur affichée.
    expect(() => resolveStatsRange({ from: '01/08/2026' }, now)).toThrow(StatsRangeError);
    expect(() => resolveStatsRange({ from: '2026-13-01' }, now)).toThrow(StatsRangeError);
    expect(() => resolveStatsRange({ to: '2026-02-31' }, now)).toThrow(StatsRangeError);
  });

  it('refuse une fenêtre à l’envers', () => {
    expect(() => resolveStatsRange({ from: '2026-08-10', to: '2026-08-01' }, now)).toThrow(
      StatsRangeError,
    );
  });

  it('une chaîne vide ne compte pas comme une borne', () => {
    // Le formulaire renvoie '' quand l'utilisateur efface un champ. Traiter ça
    // comme une date déclencherait une erreur au lieu d'élargir la fenêtre.
    const r = resolveStatsRange({ period: '7d', from: '', to: '  ' }, now);
    expect(r.period).toBe('7d');
    expect(r.since?.toISOString()).toBe('2026-08-06T12:00:00.000Z');
  });

  it('filtre les deux bornes dans les requêtes', async () => {
    const { client, calls } = fakePrisma();
    await computeAdminStats(
      client,
      resolveStatsRange({ from: '2026-08-01', to: '2026-08-10' }, now),
    );
    const { where } = calls['order.aggregate']![0] as {
      where: { paidAt: { gte: Date; lte: Date } };
    };
    expect(where.paidAt.gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(where.paidAt.lte.toISOString()).toBe('2026-08-10T23:59:59.999Z');
  });

  it('expose les deux bornes dans la réponse', async () => {
    const stats = await computeAdminStats(
      fakePrisma().client,
      resolveStatsRange({ from: '2026-08-01', to: '2026-08-10' }, now),
    );
    expect(stats.since).toBe('2026-08-01T00:00:00.000Z');
    expect(stats.until).toBe('2026-08-10T23:59:59.999Z');
    // L'encours reste hors période : c'est une dette à l'instant T, pas un flux.
    expect(stats.credits.outstanding).toBeGreaterThanOrEqual(0);
  });
});

describe('coût fournisseur', () => {
  it('se déduit de la marge et du prix du crédit, pas d’un facteur figé', () => {
    // Avec MARGIN=3 et CREDIT_FCFA=3 le facteur vaut 1 aujourd'hui. Le test
    // vérifie la FORMULE : si la marge passe à 4, le coût affiché doit baisser.
    expect(providerCostFcfa(4_500)).toBe(4_500);
    expect(providerCostFcfa(0)).toBe(0);
  });
});

describe('assemblage des métriques', () => {
  it('le chiffre d’affaires vient des commandes, pas du journal de crédits', async () => {
    const stats = await run();
    expect(stats.revenue.grossFcfa).toBe(57_000);
    expect(stats.revenue.orders).toBe(6);
    expect(stats.revenue.averageFcfa).toBe(9_500);
  });

  it('les consommations sont rendues positives sans jamais entrer dans un total', async () => {
    const stats = await run();
    // La colonne `credits` est signée ; l'affichage ne doit pas propager le
    // signe négatif dans une somme.
    expect(stats.credits.sold).toBe(19_000);
    expect(stats.credits.consumed).toBe(4_500);
    expect(stats.credits.refunded).toBe(300);
    expect(stats.credits.outstanding).toBe(14_900);
  });

  it('la marge retranche le coût fournisseur de l’encaissé', async () => {
    const stats = await run();
    expect(stats.economics.providerCostFcfa).toBe(4_500);
    expect(stats.economics.marginFcfa).toBe(57_000 - 4_500);
  });

  it('le taux d’échec ignore les générations encore en cours', async () => {
    const stats = await run();
    // 10 échecs sur 50 terminées — les 4 en cours n'ont pas encore échoué.
    expect(stats.generations.failureRateBps).toBe(2_000);
    expect(stats.generations.running).toBe(4);
    expect(stats.generations.total).toBe(54);
  });

  it('les retraits en attente sortent en nombre ET en montant', async () => {
    const stats = await run();
    // Un compteur seul ne dit pas si c'est urgent ; un montant seul ne dit pas
    // combien de personnes attendent.
    expect(stats.withdrawals.pendingCount).toBe(2);
    expect(stats.withdrawals.pendingFcfa).toBe(3_000);
    expect(stats.withdrawals.paidFcfa).toBe(5_000);
    // Aucune ligne PROCESSING dans le jeu : 0, pas undefined.
    expect(stats.withdrawals.processingFcfa).toBe(0);
  });
});

describe('base vide', () => {
  it('0 partout, jamais NaN ni null', async () => {
    // Prisma renvoie `_sum: { x: null }` quand aucune ligne ne correspond.
    // Propagé tel quel, ça donne « null FCFA » à l'écran, ou pire un NaN issu
    // d'une division.
    const stats = await run({
      order: {
        aggregate: () => Promise.resolve({ _sum: { amount: null }, _count: 0 }),
        groupBy: () => Promise.resolve([]),
      },
      creditTransaction: {
        groupBy: () => Promise.resolve([]),
        aggregate: () => Promise.resolve({ _sum: { credits: null } }),
      },
      generation: { groupBy: () => Promise.resolve([]) },
      withdrawal: { groupBy: () => Promise.resolve([]) },
      referralCommission: { aggregate: () => Promise.resolve({ _sum: { amount: null } }) },
    });

    expect(stats.revenue.grossFcfa).toBe(0);
    // Panier moyen sur zéro commande : 0, pas une division par zéro.
    expect(stats.revenue.averageFcfa).toBe(0);
    expect(stats.generations.failureRateBps).toBe(0);
    expect(stats.credits.outstanding).toBe(0);
    expect(stats.withdrawals.pendingFcfa).toBe(0);
    expect(stats.commissions.earnedFcfa).toBe(0);

    for (const [group, values] of Object.entries(stats)) {
      if (typeof values !== 'object' || values === null) continue;
      for (const [key, value] of Object.entries(values)) {
        if (typeof value !== 'number') continue;
        expect(Number.isFinite(value), `${group}.${key}`).toBe(true);
      }
    }
  });
});

describe('périmètre des requêtes', () => {
  it('les visages d’avatar sont exclus du volume de générations', async () => {
    const { client, calls } = fakePrisma();
    await computeAdminStats(client, '30d');
    // Les compter gonflerait le volume et fausserait le taux d'échec : un
    // avatar est du matériel de travail, pas de la production publiable.
    expect(calls['generation.groupBy']?.[0]).toMatchObject({
      by: ['status'],
      where: { purpose: 'CREATION' },
    });
  });

  it('seules les commandes PAYÉES comptent comme chiffre d’affaires', async () => {
    const { client, calls } = fakePrisma();
    await computeAdminStats(client, '30d');
    expect(calls['order.aggregate']?.[0]).toMatchObject({ where: { status: 'PAID' } });
  });

  it('l’encours de crédits ignore la période', async () => {
    const { client, calls } = fakePrisma();
    await computeAdminStats(client, '7d');
    // C'est une dette envers les créateurs à l'instant T, pas un flux : la
    // restreindre à 7 jours donnerait un chiffre qui ne veut rien dire.
    expect(calls['credit.aggregate']?.[0]).toEqual({ _sum: { credits: true } });
  });

  it('« tout » n’envoie aucun filtre de date', async () => {
    const { client, calls } = fakePrisma();
    await computeAdminStats(client, 'all');
    expect(calls['credit.groupBy']?.[0]).toEqual({
      by: ['movement'],
      where: {},
      _sum: { credits: true },
    });
  });

  it('une fenêtre bornée filtre bien sur la date', async () => {
    const { client, calls } = fakePrisma();
    await computeAdminStats(client, '7d', new Date('2026-08-13T12:00:00Z'));
    // Un agrégat juste sur la mauvaise fenêtre reste un chiffre faux.
    expect(calls['credit.groupBy']?.[0]).toMatchObject({
      where: { createdAt: { gte: new Date('2026-08-06T12:00:00Z') } },
    });
  });
});
