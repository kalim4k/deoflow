'use client';

import { api } from '@/lib/api';

/**
 * « Cet utilisateur a-t-il accès au back-office ? »
 *
 * La réponse ne change pas d'une page à l'autre, mais l'AppShell est monté
 * dans CHAQUE page (ce n'est pas un layout), donc sa sonde repartait à chaque
 * navigation : un aller-retour réseau gratuit avant chaque écran, sur une 4G
 * où il coûte cher.
 *
 * On mémorise donc la promesse, par identifiant d'utilisateur — pas
 * globalement : sur un appareil partagé, une déconnexion suivie d'une
 * reconnexion doit resonder, sinon un compte ordinaire hériterait de l'entrée
 * back-office du compte précédent.
 *
 * Un 403 est la réponse attendue pour un créateur ordinaire : c'est `false`,
 * pas une erreur à remonter.
 */
const cache = new Map<string, Promise<boolean>>();

export function probeAdmin(userId: string): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit) return hit;

  const probe = api('/api/admin/me')
    .then(() => true)
    .catch(() => false);

  cache.set(userId, probe);
  return probe;
}

/** À appeler si les droits changent en cours de session (promotion admin). */
export function forgetAdminProbe(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
