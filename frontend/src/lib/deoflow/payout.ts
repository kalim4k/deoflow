/**
 * Moyens de versement des commissions d'affiliation.
 *
 * Source unique, partagée par le formulaire et par la validation de la route :
 * deux listes finiraient par diverger, et le créateur découvrirait le décalage
 * en voyant sa demande refusée après l'avoir remplie.
 *
 * Le starter n'en connaissait que trois, tous sénégalais. Deoflow encaisse et
 * verse au Togo, où les deux opérateurs réels sont Mixx by Yas (ex-T-Money,
 * Togocom) et Moov Money (Flooz). Les autres restent disponibles pour les
 * filleuls de la sous-région.
 */

export interface PayoutMethod {
  id: string;
  label: string;
  /** Pays d'usage, affiché en second pour lever l'ambiguïté des marques. */
  country: string;
  /** Indicatif proposé par défaut dans le champ téléphone. */
  dialCode: string;
}

export const PAYOUT_METHODS = [
  { id: 'MIXX_BY_YAS', label: 'Mixx by Yas', country: 'Togo', dialCode: '+228' },
  { id: 'MOOV_MONEY', label: 'Moov Money', country: 'Togo', dialCode: '+228' },
  { id: 'WAVE', label: 'Wave', country: 'Sénégal · Côte d’Ivoire', dialCode: '+221' },
  { id: 'ORANGE_MONEY', label: 'Orange Money', country: 'Afrique de l’Ouest', dialCode: '+225' },
  { id: 'MTN_MOMO', label: 'MTN MoMo', country: 'Afrique de l’Ouest', dialCode: '+233' },
] as const satisfies readonly PayoutMethod[];

export type PayoutMethodId = (typeof PAYOUT_METHODS)[number]['id'];

/**
 * Les identifiants seuls, dans la forme que Zod attend.
 *
 * `z.enum` exige un tuple non vide de littéraux ; le `as` le lui donne sans
 * recopier la liste — c'est le seul endroit où le typage force la main.
 */
export const PAYOUT_METHOD_IDS = PAYOUT_METHODS.map((m) => m.id) as unknown as [
  PayoutMethodId,
  ...PayoutMethodId[],
];

export function findPayoutMethod(id: string): PayoutMethod | undefined {
  return PAYOUT_METHODS.find((m) => m.id === id);
}

/** Libellé d'affichage, avec repli sur l'identifiant brut. */
export function payoutMethodLabel(id: string): string {
  return findPayoutMethod(id)?.label ?? id;
}

/**
 * Format attendu par la route : E.164, indicatif compris.
 *
 * Le même motif que le schéma serveur, pour que le formulaire refuse AVANT
 * l'envoi ce que la route refuserait après.
 */
export const PHONE_PATTERN = /^\+\d{10,15}$/;

export function isValidPayoutPhone(raw: string): boolean {
  return PHONE_PATTERN.test(raw.replace(/[\s.-]/g, ''));
}

/** Retire espaces et séparateurs — les gens écrivent « +228 90 12 34 56 ». */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s.-]/g, '');
}
