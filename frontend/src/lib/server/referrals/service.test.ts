import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Trois invariants portent tout l'argent du programme.
 *
 *   1. Une commande produit AU PLUS une commission. Le règlement d'achat a
 *      deux chemins concurrents (navigateur et cron), donc `accrueCommission`
 *      sera appelé deux fois sur la même commande tôt ou tard.
 *   2. On ne se parraine pas soi-même, et on ne change pas de parrain.
 *   3. Un parrainage raté n'empêche jamais quelqu'un de créer son compte ni
 *      de recevoir ses crédits.
 */
const h = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  const commissions: Array<Record<string, unknown>> = [];
  const cookieJar = new Map<string, string>();
  return { users, commissions, cookieJar };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = h.cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      if (value === '') h.cookieJar.delete(name);
      else h.cookieJar.set(name, value);
    },
  }),
}));

vi.mock('@/lib/server/prisma', () => {
  const client = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; referralCode?: string } }) => {
        if (where.id) return h.users.get(where.id) ?? null;
        return [...h.users.values()].find((u) => u.referralCode === where.referralCode) ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = h.users.get(where.id);
        if (!row) throw new Error('absent');
        if (typeof data.referralCode === 'string') {
          const taken = [...h.users.values()].some(
            (u) => u.referralCode === data.referralCode && u.id !== where.id,
          );
          if (taken) throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; referredById: null };
        data: Record<string, unknown>;
      }) => {
        const row = h.users.get(where.id);
        // Reproduit le filtre `referredById: null` : c'est lui qui rend le
        // rattachement idempotent face à deux appels concurrents.
        if (!row || row.referredById) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      count: async ({ where }: { where: { referredById: string } }) =>
        [...h.users.values()].filter((u) => u.referredById === where.referredById).length,
    },
  };
  return { prisma: client };
});

import { accrueCommission, attachPendingReferral, ensureReferralCode } from './service';
import { REFERRAL_COOKIE } from './service';
import { COMMISSION_RATE_BPS, isReferralCodeShaped } from '@/lib/deoflow/referrals';

/** Client de transaction minimal — `accrueCommission` reçoit toujours un `tx`. */
function makeTx() {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => h.users.get(where.id) ?? null,
    },
    referralCommission: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (h.commissions.some((c) => c.orderId === data.orderId)) {
          // La contrainte `orderId @unique` de la base, reproduite ici : c'est
          // la serrure qui rend le double-crédit impossible.
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        h.commissions.push(data);
        return data;
      },
    },
  } as never;
}

function addUser(id: string, over: Record<string, unknown> = {}) {
  h.users.set(id, {
    id,
    referralCode: null,
    referredById: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    ...over,
  });
}

beforeEach(() => {
  h.users.clear();
  h.commissions.length = 0;
  h.cookieJar.clear();
});

describe('code public', () => {
  it('attribue un code bien formé, une seule fois', async () => {
    addUser('u1');
    const first = await ensureReferralCode('u1');
    expect(isReferralCodeShaped(first)).toBe(true);

    // Stable : le lien déjà partagé par le créateur doit continuer de marcher.
    expect(await ensureReferralCode('u1')).toBe(first);
  });

  it('donne des codes différents à deux comptes', async () => {
    addUser('u1');
    addUser('u2');
    expect(await ensureReferralCode('u1')).not.toBe(await ensureReferralCode('u2'));
  });
});

describe('rattachement du filleul', () => {
  beforeEach(() => {
    addUser('parrain', { referralCode: 'AAAA1111' });
  });

  it('rattache un compte tout neuf porteur du cookie', async () => {
    addUser('filleul');
    h.cookieJar.set(REFERRAL_COOKIE, 'AAAA1111');

    expect(await attachPendingReferral('filleul')).toBe('parrain');
    expect(h.users.get('filleul')?.referredById).toBe('parrain');
  });

  it('REFUSE l’auto-parrainage', async () => {
    // La fraude la plus évidente du programme : s'inscrire avec son propre
    // lien pour toucher 30 % sur ses propres achats.
    h.cookieJar.set(REFERRAL_COOKIE, 'AAAA1111');
    expect(await attachPendingReferral('parrain')).toBeNull();
    expect(h.users.get('parrain')?.referredById).toBeNull();
  });

  it('le premier contact l’emporte définitivement', async () => {
    addUser('autre', { referralCode: 'BBBB2222' });
    addUser('filleul', { referredById: 'parrain' });
    h.cookieJar.set(REFERRAL_COOKIE, 'BBBB2222');

    // Sinon un filleul recliquant sur un autre lien réattribuerait ses achats.
    expect(await attachPendingReferral('filleul')).toBe('parrain');
    expect(h.users.get('filleul')?.referredById).toBe('parrain');
  });

  it('refuse un compte trop ancien', async () => {
    // Un habitué qui clique un jour sur le lien d'un ami n'est pas une
    // acquisition : le parrainage récompense un nouveau client, pas la
    // capture d'un client déjà gagné.
    addUser('ancien', { createdAt: new Date(Date.now() - 48 * 3600_000) });
    h.cookieJar.set(REFERRAL_COOKIE, 'AAAA1111');

    expect(await attachPendingReferral('ancien')).toBeNull();
    expect(h.users.get('ancien')?.referredById).toBeNull();
  });

  it('refuse un parrain suspendu', async () => {
    addUser('banni', { referralCode: 'CCCC3333', status: 'SUSPENDED' });
    addUser('filleul');
    h.cookieJar.set(REFERRAL_COOKIE, 'CCCC3333');

    expect(await attachPendingReferral('filleul')).toBeNull();
  });

  it('ignore un code inconnu, mal formé ou absent', async () => {
    addUser('filleul');

    expect(await attachPendingReferral('filleul')).toBeNull(); // aucun cookie

    h.cookieJar.set(REFERRAL_COOKIE, 'ZZZZ9999'); // inexistant
    expect(await attachPendingReferral('filleul')).toBeNull();

    h.cookieJar.set(REFERRAL_COOKIE, 'pas-un-code'); // forme invalide
    expect(await attachPendingReferral('filleul')).toBeNull();

    // Dans les trois cas, l'inscription doit se poursuivre normalement.
    expect(h.users.get('filleul')?.referredById).toBeNull();
  });
});

describe('gain de commission', () => {
  beforeEach(() => {
    addUser('parrain', { referralCode: 'AAAA1111' });
    addUser('filleul', { referredById: 'parrain' });
  });

  it('inscrit 30 % de l’achat au profit du parrain', async () => {
    const gained = await accrueCommission(makeTx(), {
      refereeId: 'filleul',
      orderId: 'ord_1',
      amountFcfa: 3_000,
    });

    expect(gained).toBe(900);
    expect(h.commissions).toHaveLength(1);
    expect(h.commissions[0]).toMatchObject({
      referrerId: 'parrain',
      refereeId: 'filleul',
      orderId: 'ord_1',
      orderAmount: 3_000,
      amount: 900,
      status: 'EARNED',
    });
  });

  it('FIGE le taux sur la ligne', async () => {
    // Changer le barème demain ne doit pas réécrire ce qui a été gagné hier.
    await accrueCommission(makeTx(), {
      refereeId: 'filleul',
      orderId: 'ord_1',
      amountFcfa: 3_000,
    });
    expect(h.commissions[0]).toMatchObject({ rateBps: COMMISSION_RATE_BPS });
  });

  it('ne paie JAMAIS deux fois la même commande', async () => {
    // Le règlement a deux chemins concurrents — le navigateur qui sonde et le
    // cron de rattrapage. Ils tomberont sur la même commande.
    const first = await accrueCommission(makeTx(), {
      refereeId: 'filleul',
      orderId: 'ord_1',
      amountFcfa: 9_000,
    });
    const second = await accrueCommission(makeTx(), {
      refereeId: 'filleul',
      orderId: 'ord_1',
      amountFcfa: 9_000,
    });

    expect(first).toBe(2_700);
    expect(second).toBe(0);
    expect(h.commissions).toHaveLength(1);
  });

  it('résiste à dix règlements simultanés de la même commande', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        accrueCommission(makeTx(), {
          refereeId: 'filleul',
          orderId: 'ord_race',
          amountFcfa: 30_000,
        }),
      ),
    );

    expect(h.commissions).toHaveLength(1);
    expect(results.filter((r) => r > 0)).toHaveLength(1);
    expect(results.reduce((a, b) => a + b, 0)).toBe(9_000);
  });

  it('ne fait rien pour un acheteur sans parrain', async () => {
    addUser('orphelin');
    expect(
      await accrueCommission(makeTx(), {
        refereeId: 'orphelin',
        orderId: 'ord_2',
        amountFcfa: 3_000,
      }),
    ).toBe(0);
    expect(h.commissions).toHaveLength(0);
  });

  it('ne lève JAMAIS — l’acheteur doit recevoir ses crédits quoi qu’il arrive', async () => {
    // La transaction appelante accorde les crédits payés. Une commission
    // ratée ne doit pas la faire échouer : l'acheteur a payé, il est servi.
    const brokenTx = {
      user: {
        findUnique: async () => {
          throw new Error('base injoignable');
        },
      },
      referralCommission: { create: async () => undefined },
    } as never;

    await expect(
      accrueCommission(brokenTx, { refereeId: 'filleul', orderId: 'ord_3', amountFcfa: 3_000 }),
    ).resolves.toBe(0);
  });

  it('n’inscrit rien pour un montant qui n’ouvre aucun droit', async () => {
    // 3 FCFA × 30 % = 0,9, arrondi à 0. Une ligne à zéro polluerait le
    // relevé du parrain sans rien lui apporter.
    expect(
      await accrueCommission(makeTx(), { refereeId: 'filleul', orderId: 'ord_4', amountFcfa: 3 }),
    ).toBe(0);
    expect(h.commissions).toHaveLength(0);
  });
});
