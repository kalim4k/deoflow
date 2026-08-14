import { describe, it, expect } from 'vitest';
import {
  applyCredit,
  applyDebit,
  InsufficientCreditsError,
  INITIAL_STATE,
  removeGeneration,
  upsertGeneration,
  upsertPurchase,
  type CreditEntry,
  type DeoflowState,
} from './store';
import type { Generation, Purchase } from './types';

// L'arithmétique du solde est la seule règle métier réellement sensible de la
// couche simulée : un solde négatif signifierait une génération offerte. Elle
// est donc écrite en fonctions pures, et testée ici.

function entry(overrides: Partial<CreditEntry> = {}): CreditEntry {
  return {
    id: 'tx_1',
    credits: 10,
    movement: 'PURCHASE',
    label: 'Pack Créateur',
    createdAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen_1',
    kind: 'image',
    modelSlug: 'nano-banana-2',
    modelName: 'Nano Banana 2',
    prompt: 'portrait studio',
    ratio: '1:1',
    durationSeconds: null,
    credits: 1,
    status: 'RUNNING',
    previewUrl: '',
    failureReason: null,
    createdAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('applyCredit', () => {
  it('ajoute les crédits et enregistre un mouvement positif', () => {
    const next = applyCredit(INITIAL_STATE, entry({ credits: 120, amountFcfa: 10000 }));

    expect(next.credits).toBe(120);
    expect(next.transactions).toHaveLength(1);
    expect(next.transactions[0]?.credits).toBe(120);
    expect(next.transactions[0]?.amountFcfa).toBe(10000);
  });

  it('laisse l’état d’origine intact', () => {
    const before: DeoflowState = { ...INITIAL_STATE, credits: 5 };
    applyCredit(before, entry({ credits: 50 }));

    expect(before.credits).toBe(5);
    expect(before.transactions).toHaveLength(0);
  });

  it('refuse un nombre de crédits nul ou négatif', () => {
    expect(() => applyCredit(INITIAL_STATE, entry({ credits: 0 }))).toThrow();
    expect(() => applyCredit(INITIAL_STATE, entry({ credits: -5 }))).toThrow();
  });
});

describe('applyDebit', () => {
  const funded: DeoflowState = { ...INITIAL_STATE, credits: 20 };

  it('retire les crédits et enregistre un mouvement négatif', () => {
    const next = applyDebit(funded, entry({ credits: 5, movement: 'GENERATION' }));

    expect(next.credits).toBe(15);
    expect(next.transactions[0]?.credits).toBe(-5);
    expect(next.transactions[0]?.movement).toBe('GENERATION');
  });

  it('autorise un débit qui vide exactement le solde', () => {
    const next = applyDebit(funded, entry({ credits: 20, movement: 'GENERATION' }));
    expect(next.credits).toBe(0);
  });

  it('refuse un débit supérieur au solde et n’écrit rien', () => {
    expect(() => applyDebit(funded, entry({ credits: 21, movement: 'GENERATION' }))).toThrow(
      InsufficientCreditsError,
    );
    expect(funded.credits).toBe(20);
    expect(funded.transactions).toHaveLength(0);
  });

  it('indique combien de crédits manquent', () => {
    try {
      applyDebit(funded, entry({ credits: 32, movement: 'GENERATION' }));
      expect.unreachable('le débit aurait dû échouer');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientCreditsError);
      expect((err as InsufficientCreditsError).missing).toBe(12);
    }
  });

  it('refuse un débit à solde vide', () => {
    expect(() => applyDebit(INITIAL_STATE, entry({ credits: 1, movement: 'GENERATION' }))).toThrow(
      InsufficientCreditsError,
    );
  });
});

describe('upsertGeneration', () => {
  it('ajoute une génération en tête de liste', () => {
    const next = upsertGeneration(INITIAL_STATE, generation());
    expect(next.generations).toHaveLength(1);
    expect(next.generations[0]?.id).toBe('gen_1');
  });

  it('remplace une génération existante sans la dupliquer', () => {
    const withPending = upsertGeneration(INITIAL_STATE, generation());
    const next = upsertGeneration(withPending, generation({ status: 'SUCCEEDED' }));

    expect(next.generations).toHaveLength(1);
    expect(next.generations[0]?.status).toBe('SUCCEEDED');
  });

  it('conserve l’ordre : la plus récente d’abord', () => {
    const first = upsertGeneration(INITIAL_STATE, generation({ id: 'gen_1' }));
    const second = upsertGeneration(first, generation({ id: 'gen_2' }));

    expect(second.generations.map((g) => g.id)).toEqual(['gen_2', 'gen_1']);
  });
});

describe('removeGeneration', () => {
  it('retire la génération ciblée et laisse les autres', () => {
    const state = upsertGeneration(
      upsertGeneration(INITIAL_STATE, generation({ id: 'gen_1' })),
      generation({ id: 'gen_2' }),
    );
    const next = removeGeneration(state, 'gen_1');

    expect(next.generations.map((g) => g.id)).toEqual(['gen_2']);
  });
});

describe('upsertPurchase', () => {
  const purchase: Purchase = {
    id: 'pur_1',
    packId: 'createur',
    packName: 'Pack Créateur',
    credits: 120,
    amountFcfa: 10000,
    method: 'TMONEY',
    phone: '90123456',
    status: 'PENDING',
    failureReason: null,
    createdAt: '2026-08-12T10:00:00.000Z',
  };

  it('passe un achat de PENDING à PAID sans le dupliquer', () => {
    const pending = upsertPurchase(INITIAL_STATE, purchase);
    const paid = upsertPurchase(pending, { ...purchase, status: 'PAID' });

    expect(paid.purchases).toHaveLength(1);
    expect(paid.purchases[0]?.status).toBe('PAID');
  });
});
