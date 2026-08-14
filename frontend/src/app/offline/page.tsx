import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';

/**
 * Page servie par le service worker quand une navigation échoue faute de
 * réseau. Elle est mise en cache à l'installation du worker, donc elle doit
 * rester **entièrement statique** : aucun appel API, aucune donnée de session.
 * Une page authentifiée mise en cache serait servie au propriétaire suivant du
 * téléphone.
 */
export const metadata: Metadata = {
  title: 'Hors ligne',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo href="/dashboard" />

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Pas de connexion</h1>
        <p className="text-ink-500">
          Deoflow a besoin d’Internet pour générer vos images et vidéos. Vos crédits et vos
          créations sont en sécurité — rien n’est perdu.
        </p>
      </div>

      {/* Un lien plutôt qu'un bouton `onClick` : la page doit fonctionner sans
          JavaScript, puisqu'elle s'affiche précisément quand tout va mal. */}
      <a
        href="/dashboard"
        className="pressable inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-700"
      >
        Réessayer
      </a>

      <p className="text-xs text-ink-500">
        Si le problème persiste, vérifiez vos données mobiles ou votre connexion Wi-Fi.
      </p>
    </main>
  );
}
