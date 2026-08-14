import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createCommissionBalanceComputer } from './balance';

/**
 * Ce fichier existe à cause d'un défaut hérité du starter.
 *
 * `createDefaultBalanceComputer` additionne les commandes `PAID` de
 * l'utilisateur et les compte comme des GAINS. Juste pour une marketplace, où
 * une commande payée est de l'argent qui entre chez le vendeur. Chez Deoflow,
 * une commande payée est un ACHAT DE CRÉDITS : de l'argent qui SORT de la
 * poche de l'utilisateur. Branché tel quel, n'importe quel compte pouvait
 * demander le retrait de ce qu'il venait de dépenser.
 *
 * Le test de la route de retrait ne l'aurait jamais vu : il remplace
 * `validateWithdrawalRequest` par un mock, donc aucun calcul de solde n'y est
 * exercé. La vérification doit vivre ici.
 */
function fakePrisma(opts: {
  commissions?: number | null;
  withdrawals?: number | null;
  onOrderFindMany?: () => void;
}) {
  return {
    referralCommission: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: opts.commissions ?? null } }),
    },
    withdrawal: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: opts.withdrawals ?? null } }),
    },
    // Piège : si le calcul lit encore les commandes, le test le saura.
    order: {
      findMany: vi.fn().mockImplementation(() => {
        opts.onOrderFindMany?.();
        return Promise.resolve([]);
      }),
      aggregate: vi.fn().mockImplementation(() => {
        opts.onOrderFindMany?.();
        return Promise.resolve({ _sum: { amount: 0 } });
      }),
    },
  } as unknown as PrismaClient;
}

describe('solde retirable', () => {
  it('NE compte PAS les achats de crédits de l’utilisateur', async () => {
    let readOrders = false;
    const prisma = fakePrisma({
      commissions: 0,
      withdrawals: 0,
      onOrderFindMany: () => {
        readOrders = true;
      },
    });

    const balance = await createCommissionBalanceComputer(prisma)('u1');

    expect(balance).toBe(0);
    // C'EST le défaut corrigé : toucher à la table des commandes ici, c'est
    // rouvrir la porte au retrait de l'argent dépensé.
    expect(readOrders, 'le solde lit encore les commandes').toBe(false);
  });

  it('vaut les commissions acquises moins ce qui est déjà demandé', async () => {
    const prisma = fakePrisma({ commissions: 7_500, withdrawals: 2_000 });
    expect(await createCommissionBalanceComputer(prisma)('u1')).toBe(5_500);
  });

  it('compte les retraits PENDING comme réservés', async () => {
    // Une demande en attente n'est pas encore partie, mais elle est promise.
    // L'ignorer laisserait demander deux fois le même argent.
    const prisma = fakePrisma({ commissions: 3_000, withdrawals: 3_000 });
    expect(await createCommissionBalanceComputer(prisma)('u1')).toBe(0);

    const args = (prisma.withdrawal.aggregate as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { where: { status: { in: string[] } } };
    expect(args.where.status.in).toContain('PENDING');
    expect(args.where.status.in).toContain('PROCESSING');
    expect(args.where.status.in).toContain('COMPLETED');
  });

  it('ne descend jamais sous zéro', async () => {
    // Un versement manuel saisi en back-office peut dépasser le gain.
    // Afficher « −500 F » n'aiderait personne, et un montant négatif
    // passerait les bornes du garde-fou de retrait.
    const prisma = fakePrisma({ commissions: 1_000, withdrawals: 5_000 });
    expect(await createCommissionBalanceComputer(prisma)('u1')).toBe(0);
  });

  it('traite une somme vide comme zéro', async () => {
    // `_sum` vaut `null` quand aucune ligne ne correspond — un compte tout
    // neuf. `null - null` donnerait `NaN`, qui passerait toutes les
    // comparaisons du garde-fou sans en satisfaire aucune.
    const prisma = fakePrisma({ commissions: null, withdrawals: null });
    expect(await createCommissionBalanceComputer(prisma)('u1')).toBe(0);
  });

  it('n’additionne que les commissions du bon utilisateur', async () => {
    const prisma = fakePrisma({ commissions: 500, withdrawals: 0 });
    await createCommissionBalanceComputer(prisma)('u1');

    const args = (prisma.referralCommission.aggregate as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { where: { referrerId: string; status: { in: string[] } } };
    expect(args.where.referrerId).toBe('u1');
    // `PAID` compte avec `EARNED` : sa contrepartie, le retrait `COMPLETED`,
    // est soustraite juste après. L'exclure retrancherait deux fois.
    expect(args.where.status.in).toEqual(expect.arrayContaining(['EARNED', 'PAID']));
    expect(args.where.status.in).not.toContain('REVERSED');
  });

  it('lit dans la transaction quand on lui en donne une', async () => {
    // La route de retrait transmet son `tx` pour que la lecture se fasse SOUS
    // le verrou consultatif. Sans ça, deux demandes simultanées liraient
    // toutes deux le solde d'avant la réservation de l'autre.
    const prisma = fakePrisma({ commissions: 0, withdrawals: 0 });
    const tx = fakePrisma({ commissions: 9_000, withdrawals: 0 });

    const balance = await createCommissionBalanceComputer(prisma)('u1', tx as never);

    expect(balance).toBe(9_000);
    expect(prisma.referralCommission.aggregate).not.toHaveBeenCalled();
  });
});
