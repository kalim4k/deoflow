/**
 * Parrainage — constantes et calculs partagés navigateur / serveur.
 *
 * Le barème vit ici et nulle part ailleurs : la page d'affiliation l'affiche,
 * le serveur l'applique. Deux copies dériveraient, et c'est la promesse faite
 * au parrain qui deviendrait fausse.
 */

/** Taux de commission, en points de base. 2500 = 25 %. */
export const COMMISSION_RATE_BPS = 2_500;

/** Paramètre d'URL du lien de parrainage. */
export const REFERRAL_PARAM = 'ref';

/**
 * Durée de vie de l'attribution après le clic.
 *
 * Trente jours : le filleul clique depuis TikTok, regarde, revient s'inscrire
 * plus tard depuis son navigateur. Une fenêtre courte perdrait ces gens-là, et
 * le parrain conclurait — à raison — que le programme ne paie pas.
 */
export const REFERRAL_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * Longueur du code public. Huit caractères d'un alphabet de 31 lettres, soit
 * ~10^12 combinaisons : assez pour que deviner le code d'un autre ne serve à
 * rien, assez court pour se dicter au téléphone.
 */
export const REFERRAL_CODE_LENGTH = 8;

/**
 * Alphabet Crockford base32 — ni I, ni L, ni O, ni U.
 *
 * Les trois premières se confondent avec 1 et 0 quand le code est lu sur une
 * capture d'écran ; la quatrième est écartée parce qu'elle fabrique des mots
 * malheureux. Même alphabet que les codes de vérification par email : un
 * utilisateur n'a qu'un seul jeu de caractères à reconnaître.
 */
export const REFERRAL_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Commission due sur un achat, arrondie à l'entier inférieur. */
export function commissionFor(amountFcfa: number, rateBps = COMMISSION_RATE_BPS): number {
  if (!Number.isFinite(amountFcfa) || amountFcfa <= 0) return 0;
  // `floor` et non `round` : l'arrondi se fait en faveur de la maison, une
  // seule fois, plutôt que de créer un franc à partir de rien à chaque achat.
  return Math.floor((amountFcfa * rateBps) / 10_000);
}

/** Taux en pourcentage, pour l'affichage. */
export function ratePercent(rateBps = COMMISSION_RATE_BPS): number {
  return rateBps / 100;
}

/**
 * Lien à partager.
 *
 * Il pointe sur l'accueil, pas sur `/signup` : un visiteur qui arrive par le
 * partage d'un créateur doit d'abord comprendre ce qu'est le produit. Le code
 * est capté dès la première page, quelle qu'elle soit.
 */
export function referralLink(origin: string, code: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
}

/**
 * Un code lu dans une URL est-il plausible ?
 *
 * Appliqué AVANT toute requête en base : une chaîne de 4 000 caractères venue
 * d'un lien forgé n'a pas à devenir un cookie, ni un `WHERE`.
 */
export function isReferralCodeShaped(raw: string): boolean {
  return (
    raw.length === REFERRAL_CODE_LENGTH && [...raw].every((c) => REFERRAL_ALPHABET.includes(c))
  );
}

/** Normalise une saisie utilisateur (majuscules, espaces retirés). */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}
