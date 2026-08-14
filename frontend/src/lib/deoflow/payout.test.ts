import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PAYOUT_METHODS,
  PAYOUT_METHOD_IDS,
  findPayoutMethod,
  isValidPayoutPhone,
  normalizePhone,
  payoutMethodLabel,
} from './payout';

describe('moyens de versement', () => {
  it('couvre les deux opérateurs togolais', () => {
    // Deoflow encaisse et verse au Togo. La liste du starter ne connaissait
    // que le Sénégal : une demande de retrait y était impossible à formuler.
    const ids = PAYOUT_METHODS.map((m) => m.id);
    expect(ids).toContain('MIXX_BY_YAS'); // ex-T-Money, Togocom
    expect(ids).toContain('MOOV_MONEY'); // Flooz
  });

  it('garde les opérateurs de la sous-région', () => {
    const ids = PAYOUT_METHODS.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['WAVE', 'ORANGE_MONEY', 'MTN_MOMO']));
  });

  it('n’a ni doublon d’identifiant ni doublon de libellé', () => {
    expect(new Set(PAYOUT_METHODS.map((m) => m.id)).size).toBe(PAYOUT_METHODS.length);
    expect(new Set(PAYOUT_METHODS.map((m) => m.label)).size).toBe(PAYOUT_METHODS.length);
  });

  it('donne à chacun un indicatif utilisable comme exemple', () => {
    for (const method of PAYOUT_METHODS) {
      expect(method.dialCode, method.id).toMatch(/^\+\d{1,4}$/);
    }
  });

  it('expose la liste sous la forme attendue par Zod', () => {
    expect(PAYOUT_METHOD_IDS).toHaveLength(PAYOUT_METHODS.length);
    expect(PAYOUT_METHOD_IDS[0]).toBe(PAYOUT_METHODS[0].id);
  });

  it('retrouve un moyen, et retombe sur l’identifiant sinon', () => {
    expect(findPayoutMethod('WAVE')?.label).toBe('Wave');
    expect(findPayoutMethod('INCONNU')).toBeUndefined();
    expect(payoutMethodLabel('INCONNU')).toBe('INCONNU');
  });
});

/**
 * Le formulaire valide AVANT l'envoi avec les mêmes règles que la route. Deux
 * listes qui divergent, c'est un créateur qui remplit tout puis se fait
 * refuser sur un moyen que l'écran lui a proposé.
 */
describe('accord entre le formulaire et la route', () => {
  const route = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'withdrawals', 'route.ts'),
    'utf8',
  );

  it('la route lit la liste partagée au lieu de la recopier', () => {
    expect(route).toContain('PAYOUT_METHOD_IDS');
    expect(route).not.toMatch(/z\.enum\(\[\s*'WAVE'/);
  });

  it('le motif de téléphone est le même des deux côtés', () => {
    // La route impose E.164 ; le formulaire doit refuser exactement pareil.
    expect(route).toContain('^\\+\\d{10,15}$');
  });
});

describe('numéro de téléphone', () => {
  it('accepte un numéro togolais complet', () => {
    expect(isValidPayoutPhone('+22890123456')).toBe(true);
  });

  it('tolère les espaces et les séparateurs à la saisie', () => {
    // Les gens écrivent « +228 90 12 34 56 » — le refuser serait pédant.
    expect(normalizePhone('+228 90 12 34 56')).toBe('+22890123456');
    expect(isValidPayoutPhone('+228 90 12 34 56')).toBe(true);
    expect(isValidPayoutPhone('+228-90-12-34-56')).toBe(true);
  });

  it('refuse un numéro sans indicatif', () => {
    // Sans indicatif, l'argent ne part nulle part.
    expect(isValidPayoutPhone('90123456')).toBe(false);
    expect(isValidPayoutPhone('0090123456')).toBe(false);
  });

  it('refuse ce qui n’est pas un numéro', () => {
    for (const bad of ['', '+', '+0', 'abc', '+228abcdefgh', '+1234567890123456']) {
      expect(isValidPayoutPhone(bad), bad).toBe(false);
    }
  });
});
