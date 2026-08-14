/**
 * Transitions autorisées sur une demande de retrait, côté back-office.
 *
 * Extrait de la route pour une raison précise : c'est une matrice, et une
 * matrice se teste exhaustivement. Enfouie dans un gestionnaire HTTP, elle ne
 * se vérifie qu'à travers des requêtes, et les cas interdits — ceux qui
 * comptent — finissent par ne pas être écrits du tout.
 *
 * Le cycle réel :
 *
 *     PENDING ──► PROCESSING ──► COMPLETED
 *        │             │
 *        └─────────────┴───────► FAILED
 *
 * `COMPLETED`, `FAILED` et `CANCELLED` sont terminaux. Y revenir n'est pas
 * « corriger une erreur » : l'argent est déjà parti ou déjà rendu. Une reprise
 * se fait par une NOUVELLE demande, qui laisse une trace, pas en réécrivant
 * l'ancienne.
 */

export const ADMIN_WITHDRAWAL_TARGETS = ['PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type WithdrawalTarget = (typeof ADMIN_WITHDRAWAL_TARGETS)[number];

const ALLOWED_FROM: Record<WithdrawalTarget, ReadonlySet<string>> = {
  PROCESSING: new Set(['PENDING']),
  // On tolère PENDING → COMPLETED sans passer par PROCESSING : un seul
  // administrateur qui paie dans la foulée n'a aucune raison de cliquer deux
  // fois, et l'y forcer produirait surtout des demandes bloquées en cours.
  COMPLETED: new Set(['PENDING', 'PROCESSING']),
  FAILED: new Set(['PENDING', 'PROCESSING']),
};

export function canTransition(from: string, to: WithdrawalTarget): boolean {
  return ALLOWED_FROM[to].has(from);
}

/**
 * Les deux transitions qui déplacent de l'argent réel sont réservées au
 * SUPERADMIN. `PROCESSING` ne fait que dire « je m'en occupe » — c'est de la
 * coordination, pas un paiement.
 */
export function requiresSuperadmin(to: WithdrawalTarget): boolean {
  return to === 'COMPLETED' || to === 'FAILED';
}

/** Champ obligatoire selon la cible, ou `null` si rien n'est exigé. */
export function requiredFieldFor(
  to: WithdrawalTarget,
): 'providerPayoutId' | 'failureReason' | null {
  // Une référence obligatoire sur COMPLETED n'est pas de la paperasse : la
  // colonne est `@unique`, donc c'est elle — et elle seule — qui empêche
  // d'enregistrer deux fois le même versement. La rendre facultative
  // rendrait ce garde-fou contournable en l'omettant.
  if (to === 'COMPLETED') return 'providerPayoutId';
  if (to === 'FAILED') return 'failureReason';
  return null;
}
