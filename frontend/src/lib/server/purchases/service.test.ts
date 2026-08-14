import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Le règlement d'un achat est le seul endroit de l'application où une erreur
 * de concurrence CRÉE de l'argent.
 *
 * Maketou n'ayant pas de webhook, deux chemins mènent au même règlement — le
 * sondage du navigateur et le cron de rattrapage — et rien n'empêche qu'ils
 * tombent ensemble sur la même commande.
 *
 * Le verrou consultatif de `withUserCredits()` est ici volontairement neutralisé
 * (une transaction Prisma simulée ne peut pas le poser). Ce que ces tests
 * prouvent est donc plus fort : la réclamation par `updateMany` suffit à elle
 * seule à garantir un crédit unique, sans dépendre du verrou.
 */
const h = vi.hoisted(() => {
  const orders = new Map<string, Record<string, unknown>>();
  const users = new Map<
    string,
    { id: string; email: string; name: string | null; credits: number }
  >();
  const journal: Array<Record<string, unknown>> = [];
  const poll = { value: 'PAID' as 'PAID' | 'PENDING' | 'FAILED', calls: 0 };
  const charge = { fail: null as Error | null, calls: 0 };
  return { orders, users, journal, poll, charge };
});

vi.mock('@/lib/server/prisma', () => {
  const client: Record<string, unknown> = {
    order: {
      findUnique: async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => {
        if (where.id) return h.orders.get(where.id) ?? null;
        return (
          [...h.orders.values()].find((o) => o.idempotencyKey === where.idempotencyKey) ?? null
        );
      },
      findMany: async () => [...h.orders.values()],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `ord_${h.orders.size + 1}`;
        const row = { id, paymentUrl: null, providerChargeId: null, ...data };
        h.orders.set(id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(h.orders.get(where.id) ?? {}, data),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status?: string | { in: string[] } };
        data: Record<string, unknown>;
      }) => {
        // Atomique : le corps s'exécute sans point d'attente, donc deux appels
        // « simultanés » ne peuvent pas tous deux réclamer la même ligne.
        const row = h.orders.get(where.id);
        if (!row) return { count: 0 };
        const allowed =
          typeof where.status === 'object' ? where.status.in : [where.status as string];
        if (where.status !== undefined && !allowed.includes(row.status as string)) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => h.users.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { credits: number } }) =>
        Object.assign(h.users.get(where.id) ?? {}, data),
    },
    creditTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.journal.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return { prisma: client };
});

// Le verrou consultatif est du SQL brut — inopérant sur un client simulé.
vi.mock('@/lib/server/withdrawals/lock', () => ({ lockUserTx: vi.fn(async () => {}) }));

vi.mock('@/lib/server/payments/maketou', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/payments/maketou')>();
  return {
    ...actual,
    getMaketouProvider: () => ({
      name: 'maketou',
      charge: async () => {
        h.charge.calls++;
        if (h.charge.fail) throw h.charge.fail;
        return {
          providerChargeId: `cart_${h.charge.calls}`,
          paymentUrl: `https://pay.maketou.net/cart_${h.charge.calls}`,
          status: 'PENDING' as const,
        };
      },
      pollCharge: async () => {
        h.poll.calls++;
        return h.poll.value;
      },
    }),
  };
});

import { PurchaseError, reconcilePurchases, settlePurchase, startPurchase } from './service';

function seedUser(credits = 0) {
  h.users.set('u1', { id: 'u1', email: 'kalim@example.com', name: 'Kalim Bigard', credits });
}

function seedOrder(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'ord_seed',
    userId: 'u1',
    provider: 'maketou',
    amount: 3000,
    currency: 'XOF',
    status: 'PENDING',
    providerChargeId: 'cart_seed',
    metadata: { packId: 'createur', credits: 1000 },
    createdAt: new Date(),
    ...overrides,
  };
  h.orders.set(String(row.id), row);
  return row;
}

beforeEach(() => {
  h.orders.clear();
  h.users.clear();
  h.journal.length = 0;
  h.poll.value = 'PAID';
  h.poll.calls = 0;
  h.charge.fail = null;
  h.charge.calls = 0;
  process.env.APP_URL = 'https://deoflow.app';
});

describe('démarrage', () => {
  it('lit le prix dans le catalogue, jamais dans la requête', async () => {
    seedUser();
    const result = await startPurchase({ userId: 'u1', packId: 'createur' });

    // 3000 crédits × 3 FCFA — la valeur vient de CREDIT_PACKS.
    expect(result.amountFcfa).toBe(9000);
    expect(result.credits).toBe(3000);
    expect(h.orders.get(result.orderId)).toMatchObject({
      amount: 9000,
      status: 'PENDING',
      provider: 'maketou',
      metadata: { packId: 'createur', credits: 3000 },
    });
  });

  it('refuse un pack inconnu', async () => {
    seedUser();
    await expect(startPurchase({ userId: 'u1', packId: 'gratuit' })).rejects.toBeInstanceOf(
      PurchaseError,
    );
    expect(h.charge.calls).toBe(0);
  });

  it('rejoue la même clé d’idempotence sans rouvrir de panier', async () => {
    seedUser();
    const first = await startPurchase({ userId: 'u1', packId: 'starter', idempotencyKey: 'k1' });
    const second = await startPurchase({ userId: 'u1', packId: 'starter', idempotencyKey: 'k1' });

    expect(second.orderId).toBe(first.orderId);
    expect(second.paymentUrl).toBe(first.paymentUrl);
    // Un double-clic ne doit pas facturer deux paniers chez Maketou.
    expect(h.charge.calls).toBe(1);
  });

  it('ferme la commande quand le panier n’a pas pu être ouvert', async () => {
    seedUser();
    h.charge.fail = new Error('Maketou down');

    await expect(startPurchase({ userId: 'u1', packId: 'pro' })).rejects.toThrow();
    // Sans URL de paiement, l'acheteur ne peut rien payer : laisser la commande
    // ouverte 24 h la ferait interroger pour rien par le rattrapage.
    expect([...h.orders.values()][0]).toMatchObject({ status: 'FAILED' });
  });
});

describe('règlement', () => {
  it('accorde les crédits et journalise le mouvement', async () => {
    seedUser(50);
    seedOrder();

    const outcome = await settlePurchase('ord_seed');

    expect(outcome).toMatchObject({ status: 'PAID', credits: 1000, alreadySettled: false });
    expect(h.users.get('u1')?.credits).toBe(1050);
    expect(h.journal).toHaveLength(1);
    expect(h.journal[0]).toMatchObject({
      credits: 1000,
      movement: 'PURCHASE',
      amountFcfa: 3000,
      orderId: 'ord_seed',
      balanceAfter: 1050,
    });
    expect(h.orders.get('ord_seed')).toMatchObject({ status: 'PAID' });
  });

  it('DEUX RÈGLEMENTS SIMULTANÉS n’accordent les crédits qu’une fois', async () => {
    // Le cas réel : le navigateur sonde au moment précis où le cron passe.
    seedUser(0);
    seedOrder();

    const [a, b] = await Promise.all([settlePurchase('ord_seed'), settlePurchase('ord_seed')]);

    expect(h.users.get('u1')?.credits).toBe(1000);
    // Le journal est le juge de paix : deux lignes signifieraient que le solde
    // et le journal ont divergé, c'est-à-dire de l'argent créé.
    expect(h.journal).toHaveLength(1);

    const settled = [a, b].filter((o) => o.status === 'PAID' && !o.alreadySettled);
    expect(settled).toHaveLength(1);
  });

  it('dix règlements simultanés n’accordent les crédits qu’une fois', async () => {
    seedUser(0);
    seedOrder();

    await Promise.all(Array.from({ length: 10 }, () => settlePurchase('ord_seed')));

    expect(h.users.get('u1')?.credits).toBe(1000);
    expect(h.journal).toHaveLength(1);
  });

  it('règle une commande déjà passée EXPIRED', async () => {
    // `order-expiration` peut passer entre le paiement et sa confirmation. Si
    // Maketou dit « payé », nous devons les crédits — notre horloge n'y change
    // rien, et refuser reviendrait à garder l'argent sans livrer.
    seedUser(0);
    seedOrder({ status: 'EXPIRED' });

    const outcome = await settlePurchase('ord_seed');

    expect(outcome).toMatchObject({ status: 'PAID', alreadySettled: false });
    expect(h.users.get('u1')?.credits).toBe(1000);
  });

  it('ne recrédite jamais une commande déjà PAID', async () => {
    seedUser(1000);
    seedOrder({ status: 'PAID' });

    const outcome = await settlePurchase('ord_seed');

    expect(outcome).toMatchObject({ status: 'PAID', alreadySettled: true });
    expect(h.users.get('u1')?.credits).toBe(1000);
    expect(h.journal).toHaveLength(0);
    // Inutile d'interroger Maketou pour une commande close.
    expect(h.poll.calls).toBe(0);
  });

  it('laisse la commande ouverte tant que le paiement est en attente', async () => {
    seedUser(0);
    seedOrder();
    h.poll.value = 'PENDING';

    expect(await settlePurchase('ord_seed')).toEqual({ status: 'PENDING' });
    expect(h.orders.get('ord_seed')).toMatchObject({ status: 'PENDING' });
    expect(h.journal).toHaveLength(0);
  });

  it('marque l’échec sans rien créditer', async () => {
    seedUser(0);
    seedOrder();
    h.poll.value = 'FAILED';

    expect(await settlePurchase('ord_seed')).toMatchObject({ status: 'FAILED' });
    expect(h.orders.get('ord_seed')).toMatchObject({ status: 'FAILED' });
    expect(h.users.get('u1')?.credits).toBe(0);
  });

  it('accorde ce qui a été promis à l’achat, pas le tarif du jour', async () => {
    // Le pack « createur » vaut 3000 crédits aujourd'hui. Une commande passée
    // quand il en valait 1000 doit rendre 1000 : c'est ce que l'acheteur a payé.
    seedUser(0);
    seedOrder({ metadata: { packId: 'createur', credits: 1000 } });

    await settlePurchase('ord_seed');
    expect(h.users.get('u1')?.credits).toBe(1000);
  });

  it('refuse une commande d’un autre fournisseur', async () => {
    seedUser(0);
    seedOrder({ provider: 'bictorys' });
    await expect(settlePurchase('ord_seed')).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});

describe('rattrapage', () => {
  it('règle les commandes laissées ouvertes', async () => {
    seedUser(0);
    seedOrder({ id: 'ord_a' });
    seedOrder({ id: 'ord_b' });

    const result = await reconcilePurchases({});

    expect(result).toMatchObject({ scanned: 2, settled: 2 });
    expect(h.users.get('u1')?.credits).toBe(2000);
  });

  it('un incident sur une commande n’interrompt pas les suivantes', async () => {
    seedUser(0);
    seedOrder({ id: 'ord_a', metadata: null }); // malformée → lève
    seedOrder({ id: 'ord_b' });

    const result = await reconcilePurchases({});

    expect(result.scanned).toBe(2);
    expect(result.settled).toBe(1);
    expect(h.users.get('u1')?.credits).toBe(1000);
  });
});
