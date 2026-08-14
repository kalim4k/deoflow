import 'server-only';

/**
 * Vérification d'email : obligatoire par défaut, désactivable.
 *
 * Poser `AUTH_REQUIRE_EMAIL_VERIFICATION="0"` fait sauter l'étape du code à
 * 8 caractères : l'inscription marque l'email comme vérifié et ouvre
 * directement la session, et la connexion cesse d'exiger un email vérifié.
 *
 * ⚠️ Ce que l'on perd en le désactivant :
 *
 *   1. **Résistance à l'énumération.** L'inscription pose des cookies pour un
 *      email nouveau et n'en pose pas pour un email déjà pris : la différence
 *      est observable, donc on peut tester si une adresse a un compte.
 *   2. **Preuve de possession de l'adresse.** N'importe qui peut créer un
 *      compte avec l'email d'un tiers. Les emails transactionnels ultérieurs
 *      (réinitialisation, reçus) partiront vers une adresse non prouvée.
 *
 * Acceptable en développement, ou tant qu'aucun envoi d'email n'est branché.
 * À remettre à `1` avant d'ouvrir le service au public.
 *
 * La variable est lue à chaque appel — et non au chargement du module — pour
 * qu'un changement de configuration prenne effet sans reconstruire.
 */
export function requiresEmailVerification(): boolean {
  return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== '0';
}
