import { describe, it, expect, vi } from 'vitest';
import { InsufficientCreditsError, creditCredits, debitCredits } from './index';
import type { TxClient } from '@/lib/server/withdrawals/lock';

/**
 * Faux client de transaction. On ne teste pas Prisma : on teste que le solde
 * et le journal restent d'accord, ce qui est l'invariant de ce module.
 */
function fakeTx(startingBalance: number) {
  const state = { credits: startingBalance };
  const journal: Array<Record<string, unknown>> = [];

  const tx = {
    user: {
      findUnique: vi.fn(async () => (state.credits === null ? null : { credits: state.credits })),
      update: vi.fn(async ({ data }: { data: { credits: number } }) => {
        state.credits = data.credits;
        return state;
      }),
    },
    creditTransaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        journal.push(data);
        return data;
      }),
    },
  } as unknown as TxClient;

  return { tx, state, journal };
}

const base = { userId: 'u1', movement: 'GENERATION' as const, label: 'Test' };

describe('débit', () => {
  it('retire les crédits et journalise le solde résultant', async () => {
    const { tx, state, journal } = fakeTx(50);

    const after = await debitCredits(tx, { ...base, credits: 12 });

    expect(after).toBe(38);
    expect(state.credits).toBe(38);
    // Le journal porte le mouvement SIGNÉ : additionner la colonne doit
    // toujours redonner le solde.
    expect(journal[0]).toMatchObject({ credits: -12, balanceAfter: 38 });
  });

  it('refuse de passer sous zéro et n’écrit rien', async () => {
    const { tx, state, journal } = fakeTx(3);

    await expect(debitCredits(tx, { ...base, credits: 10 })).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    );
    // Le refus doit être total : un solde entamé sans ligne de journal serait
    // une perte silencieuse pour le créateur.
    expect(state.credits).toBe(3);
    expect(journal).toHaveLength(0);
  });

  it('autorise un débit qui tombe exactement à zéro', async () => {
    const { tx } = fakeTx(7);
    expect(await debitCredits(tx, { ...base, credits: 7 })).toBe(0);
  });
});

describe('crédit', () => {
  it('ajoute les crédits et journalise', async () => {
    const { tx, journal } = fakeTx(10);

    const after = await creditCredits(tx, {
      ...base,
      credits: 120,
      movement: 'PURCHASE',
      amountFcfa: 10_000,
    });

    expect(after).toBe(130);
    expect(journal[0]).toMatchObject({ credits: 120, balanceAfter: 130, amountFcfa: 10_000 });
  });

  it('rend exactement ce qui avait été pris', async () => {
    // Un remboursement partiel passerait inaperçu : on vérifie l'aller-retour.
    const { tx, state } = fakeTx(40);
    await debitCredits(tx, { ...base, credits: 24 });
    await creditCredits(tx, { ...base, credits: 24, movement: 'REFUND' });
    expect(state.credits).toBe(40);
  });
});

describe('valeurs refusées', () => {
  it('rejette un montant nul, négatif ou décimal', async () => {
    const { tx } = fakeTx(100);
    for (const credits of [0, -5, 1.5]) {
      await expect(debitCredits(tx, { ...base, credits })).rejects.toThrow();
    }
  });
});
