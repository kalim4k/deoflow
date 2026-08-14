import { describe, it, expect } from 'vitest';
import {
  ADMIN_WITHDRAWAL_TARGETS,
  canTransition,
  requiredFieldFor,
  requiresSuperadmin,
  type WithdrawalTarget,
} from './withdrawal-transitions';

/**
 * La matrice est testée EXHAUSTIVEMENT, cas interdits compris.
 *
 * Les transitions autorisées se remarquent tout de suite si elles cassent — un
 * administrateur ne peut plus payer. Les transitions interdites, elles, ne se
 * remarquent jamais : elles produisent un second versement du même montant,
 * qu'on découvre sur le relevé.
 */
const ALL_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;

const AUTHORISED: ReadonlyArray<readonly [string, WithdrawalTarget]> = [
  ['PENDING', 'PROCESSING'],
  ['PENDING', 'COMPLETED'],
  ['PENDING', 'FAILED'],
  ['PROCESSING', 'COMPLETED'],
  ['PROCESSING', 'FAILED'],
];

describe('matrice des transitions', () => {
  it.each(AUTHORISED)('%s → %s est autorisé', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it('tout le reste est refusé', () => {
    const allowed = new Set(AUTHORISED.map(([from, to]) => `${from}→${to}`));
    for (const from of ALL_STATUSES) {
      for (const to of ADMIN_WITHDRAWAL_TARGETS) {
        const expected = allowed.has(`${from}→${to}`);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it('les états terminaux ne se rouvrent pas', () => {
    // L'argent est déjà parti, ou déjà rendu. Une reprise passe par une
    // NOUVELLE demande — qui laisse une trace au lieu d'en effacer une.
    for (const terminal of ['COMPLETED', 'FAILED', 'CANCELLED']) {
      for (const to of ADMIN_WITHDRAWAL_TARGETS) {
        expect(canTransition(terminal, to), `${terminal} → ${to}`).toBe(false);
      }
    }
  });

  it('re-marquer « versé » un versement déjà versé est refusé', () => {
    // Le cas du double-clic, ou de deux onglets. C'est LE cas qui coûte de
    // l'argent.
    expect(canTransition('COMPLETED', 'COMPLETED')).toBe(false);
  });

  it('un statut inconnu ne passe nulle part', () => {
    for (const to of ADMIN_WITHDRAWAL_TARGETS) {
      expect(canTransition('DÉLIRE', to)).toBe(false);
    }
  });
});

describe('qui a le droit de quoi', () => {
  it('seul le SUPERADMIN solde une demande', () => {
    expect(requiresSuperadmin('COMPLETED')).toBe(true);
    expect(requiresSuperadmin('FAILED')).toBe(true);
  });

  it('prendre en charge reste ouvert à un ADMIN', () => {
    // « Je m'en occupe » est de la coordination, pas un paiement.
    expect(requiresSuperadmin('PROCESSING')).toBe(false);
  });

  it('toute cible qui touche à l’argent exige le SUPERADMIN', () => {
    // Filet pour une cible ajoutée plus tard : si elle ferme la demande, elle
    // doit être protégée. Le test échoue tant qu'on ne l'a pas classée.
    for (const target of ADMIN_WITHDRAWAL_TARGETS) {
      if (target === 'PROCESSING') continue;
      expect(requiresSuperadmin(target), target).toBe(true);
    }
  });
});

describe('champs obligatoires', () => {
  it('marquer versé exige la référence de transaction', () => {
    // C'est elle qui, portée par une contrainte `@unique`, empêche
    // d'enregistrer deux fois le même versement. Facultative, le garde-fou se
    // contournerait en l'omettant.
    expect(requiredFieldFor('COMPLETED')).toBe('providerPayoutId');
  });

  it('marquer en échec exige un motif', () => {
    expect(requiredFieldFor('FAILED')).toBe('failureReason');
  });

  it('prendre en charge n’exige rien', () => {
    expect(requiredFieldFor('PROCESSING')).toBeNull();
  });
});
