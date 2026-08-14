/**
 * Nom à afficher pour un utilisateur.
 *
 * `name` n'est renseigné que par les connexions OAuth ; une inscription
 * email/mot de passe n'en a pas. Plutôt que d'étaler l'adresse complète dans
 * l'interface, on retombe sur sa partie locale, nettoyée de ses séparateurs :
 * `kalim.doe@gmail.com` → `Kalim Doe`.
 */
export function displayName(user: { name?: string | null; email?: string } | null): string {
  const explicit = user?.name?.trim();
  if (explicit) return explicit;

  const local = user?.email?.split('@')[0];
  if (!local) return 'Vous';

  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Vous'
  );
}
