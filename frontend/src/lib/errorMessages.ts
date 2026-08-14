import { ApiError } from './api';

/**
 * Traductions des codes d'erreur stables renvoyés par l'API.
 *
 * On branche sur `ApiError.code` — jamais sur `.message`, qui est un texte
 * susceptible de changer. Un code inconnu retombe sur le message du serveur,
 * puis sur un message générique.
 */
const MESSAGES: Record<string, string> = {
  // Authentification
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect.',
  EMAIL_NOT_VERIFIED: 'Votre email n’est pas encore vérifié. Saisissez le code reçu par email.',
  ACCOUNT_SUSPENDED: 'Ce compte est suspendu. Contactez le support.',
  INVALID_REFRESH: 'Votre session a expiré. Reconnectez-vous.',
  LOCKED_OUT: 'Trop de tentatives : le compte est temporairement bloqué. Réessayez plus tard.',
  CONFLICT: 'Cette action entre en conflit avec l’état actuel du compte.',

  // Mots de passe
  PASSWORD_TOO_SHORT: 'Mot de passe trop court (8 caractères minimum).',
  PASSWORD_BANNED: 'Ce mot de passe est trop courant. Choisissez-en un autre.',
  PASSWORD_PWNED: 'Ce mot de passe a fuité dans une brèche connue. Choisissez-en un autre.',
  PASSWORD_ALREADY_SET: 'Un mot de passe est déjà défini — utilisez « changer le mot de passe ».',

  // Vérification / réinitialisation
  VERIFICATION_CODE_INVALID: 'Code invalide. Vérifiez les 8 caractères saisis.',
  VERIFICATION_CODE_EXPIRED: 'Ce code a expiré. Demandez-en un nouveau.',

  // Limites de débit
  TOO_MANY_LOGIN_ATTEMPTS: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
  TOO_MANY_SIGNUP_ATTEMPTS: 'Trop d’inscriptions depuis cet appareil. Réessayez dans une heure.',
  TOO_MANY_VERIFY_ATTEMPTS: 'Trop de tentatives. Patientez 10 minutes avant de réessayer.',
  TOO_MANY_RESET_REQUESTS: 'Trop de demandes pour cet email. Réessayez dans une heure.',
  TOO_MANY_RESET_ATTEMPTS: 'Trop de tentatives. Patientez 10 minutes avant de réessayer.',
  RATE_LIMIT_UNAVAILABLE: 'Service temporairement indisponible. Réessayez dans un instant.',

  // Retraits
  AMOUNT_BELOW_MIN: 'Le montant est inférieur au minimum autorisé.',
  AMOUNT_ABOVE_MAX: 'Le montant dépasse le maximum autorisé.',
  DAILY_LIMIT_EXCEEDED: 'Plafond journalier atteint. Réessayez demain.',
  COOLDOWN_ACTIVE: 'Un retrait vient d’être demandé. Patientez avant le suivant.',
  INSUFFICIENT_BALANCE: 'Solde insuffisant pour ce retrait.',
  PIN_NOT_SET: 'Aucun code PIN de retrait défini. Créez-en un dans vos paramètres.',
  PIN_REQUIRED: 'Saisissez votre code PIN de retrait.',
  PIN_INVALID: 'Code PIN incorrect.',
  WITHDRAWAL_TX_FAILED: 'La demande n’a pas pu être enregistrée. Réessayez.',
  USER_NOT_FOUND: 'Compte introuvable.',

  // Back-office — traitement des versements
  WITHDRAWAL_NOT_FOUND: 'Cette demande de versement n’existe plus.',
  WITHDRAWAL_TRANSITION_INVALID:
    'Cette demande a déjà été traitée. Rechargez la liste pour voir son état réel.',
  WITHDRAWAL_NOT_CANCELLABLE: 'Cette demande n’est plus annulable.',
  PAYOUT_REF_REQUIRED: 'Saisissez la référence de la transaction mobile money.',
  PAYOUT_REF_DUPLICATE:
    'Cette référence est déjà enregistrée sur une autre demande — le versement a probablement déjà été fait.',
  FAILURE_REASON_REQUIRED: 'Indiquez pourquoi le versement a échoué.',
  SUPERADMIN_REQUIRED: 'Cette action est réservée à un SUPERADMIN.',
  ADJUSTMENT_INSUFFICIENT_CREDITS: 'Le solde de ce compte ne couvre pas ce débit.',
  // Le serveur renvoie déjà un message précis (quelle date, et pourquoi) ;
  // celui-ci ne sert que de repli si le corps de la réponse est perdu.
  STATS_RANGE_INVALID: 'Période invalide : vérifiez les dates de début et de fin.',

  // Paiements
  IDEMPOTENCY_KEY_REQUIRED: 'Requête invalide (clé d’idempotence manquante).',
  IDEMPOTENCY_KEY_INVALID: 'Requête invalide (clé d’idempotence rejetée).',
  PAYMENT_PROVIDER_UNAVAILABLE:
    'Le prestataire de paiement est momentanément indisponible. Réessayez dans un instant.',
  PAYMENT_FAILED: 'Le paiement a échoué. Réessayez ou changez de moyen de paiement.',
  PAYMENTS_NOT_CONFIGURED: 'Les paiements ne sont pas configurés sur cette instance.',

  // Achat de crédits (Maketou)
  PAYMENT_PROVIDER_UNCONFIGURED:
    'L’achat de crédits n’est pas encore activé sur cette instance. Réessayez plus tard.',
  MAKETOU_PRODUCT_UNCONFIGURED: 'Ce pack n’est pas encore disponible à la vente.',
  PACK_UNKNOWN: 'Ce pack n’existe pas ou n’est plus proposé.',
  ORDER_NOT_FOUND: 'Achat introuvable.',
  CHECKOUT_NEVER_STARTED: 'Le paiement n’a jamais été ouvert. Relancez l’achat.',
  MAKETOU_UNREACHABLE:
    'La page de paiement est injoignable pour le moment. Réessayez dans un instant.',
  INVALID_API_KEY: 'L’achat de crédits est mal configuré. Contactez le support.',
  INVALID_PRODUCT: 'Ce pack n’est pas disponible chez le prestataire de paiement.',
  RATE_LIMITED: 'Trop de demandes de paiement. Patientez quelques secondes.',

  // Fichiers
  INVALID_FILE_CONTENT: 'Ce fichier ne correspond pas à son extension annoncée.',
  STORAGE_NOT_CONFIGURED: 'Le stockage de fichiers n’est pas configuré sur cette instance.',

  // Avatars
  AVATAR_NOT_FOUND: 'Ce personnage n’existe pas ou a été supprimé.',
  AVATAR_NOT_READY:
    'Le visage de ce personnage n’est pas encore prêt. Patientez quelques secondes.',
  AVATAR_UNSUPPORTED: 'Ce modèle n’accepte pas de personnage.',
  AVATAR_NAME_REQUIRED: 'Donnez un nom à votre personnage.',
  AVATAR_DESCRIPTION_REQUIRED: 'Décrivez votre personnage, ou partez d’une photo.',
  AVATAR_MODEL_INVALID: 'Ce modèle ne peut pas générer un visage.',
  PHOTO_RIGHTS_REQUIRED: 'Confirmez que vous disposez des droits sur cette photo.',

  // Générations
  INSUFFICIENT_CREDITS: 'Solde insuffisant. Rechargez pour lancer cette génération.',
  MODEL_UNKNOWN: 'Ce modèle n’est plus disponible.',
  MODE_UNKNOWN: 'Ce mode n’existe pas pour ce modèle.',
  MEDIA_REQUIRED: 'Il manque un fichier obligatoire.',
  MEDIA_TOO_MANY: 'Trop de fichiers pour cet emplacement.',
  MEDIA_URL_INVALID: 'Un des fichiers n’est pas accessible.',
  PROVIDER_NOT_CONFIGURED: 'La génération n’est pas configurée sur cette instance.',
  PROVIDER_UNAVAILABLE: 'Le service de génération est momentanément indisponible. Réessayez.',

  // Divers
  VALIDATION_FAILED: 'Certains champs sont invalides.',
  FORBIDDEN: 'Vous n’avez pas les droits nécessaires.',
  ADMIN_REQUIRED: 'Accès réservé aux administrateurs.',
  NOT_FOUND: 'Ressource introuvable.',
};

const GENERIC = 'Une erreur est survenue. Réessayez.';

/** Transforme n'importe quelle exception en phrase affichable à l'utilisateur. */
export function errorMessage(err: unknown, fallback: string = GENERIC): string {
  if (err instanceof ApiError) {
    // status 0 = échec réseau. Le message posé par le wrapper api() est en
    // anglais (fichier protégé, non modifiable) — on le remplace ici.
    if (err.status === 0) return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    // Une traduction explicite l'emporte sur le repli par statut. Sans cela,
    // un 503 « achat de crédits non configuré » s'afficherait comme un incident
    // passager en invitant à réessayer — ce qui est faux : il faut une clé API.
    const known = MESSAGES[err.code];
    if (known) return known;
    if (err.status >= 500) return 'Le serveur est momentanément indisponible. Réessayez.';
    return err.message ?? fallback;
  }
  return fallback;
}
