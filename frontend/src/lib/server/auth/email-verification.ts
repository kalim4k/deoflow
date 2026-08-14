import 'server-only';

/**
 * Vérification d'email : DÉSACTIVÉE par défaut sur Deoflow.
 *
 * Le starter exigeait la vérification sauf mention contraire. Ce fork inverse
 * ce défaut, sur décision du propriétaire (2026-08-14) : l'inscription marque
 * l'email comme vérifié et ouvre la session immédiatement, et la connexion
 * n'exige plus d'email vérifié.
 *
 * Pourquoi l'inversion plutôt qu'une variable d'environnement à poser : aucun
 * envoi d'email n'est configuré en production (`RESEND_API_KEY` absent). Avec
 * l'ancien défaut, une inscription attendait un code à 8 caractères qui ne
 * partait jamais — personne ne pouvait créer de compte, et rien ne l'indiquait.
 * Un défaut qui rend l'inscription impossible n'est pas un défaut sûr.
 *
 * ⚠️ Ce que l'on perd, et qu'il faut assumer :
 *
 *   1. **Résistance à l'énumération.** L'inscription pose des cookies pour un
 *      email nouveau et n'en pose pas pour un email déjà pris : la différence
 *      est observable, donc on peut tester si une adresse a un compte.
 *   2. **Preuve de possession de l'adresse.** N'importe qui peut créer un
 *      compte avec l'email d'un tiers. Les emails transactionnels ultérieurs
 *      (réinitialisation, reçus) partiraient vers une adresse non prouvée.
 *
 * Pour la rétablir — à faire une fois Resend branché — poser
 * `AUTH_REQUIRE_EMAIL_VERIFICATION="1"`. Aucun code à modifier, et le parcours
 * à deux étapes est toujours en place : `src/app/signup/page.tsx` bascule sur
 * la réponse du serveur, pas sur une constante de compilation.
 *
 * La variable est lue à chaque appel — et non au chargement du module — pour
 * qu'un changement de configuration prenne effet sans reconstruire.
 */
export function requiresEmailVerification(): boolean {
  return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === '1';
}
