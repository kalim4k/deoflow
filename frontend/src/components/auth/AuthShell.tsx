import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

/**
 * Cadre commun aux écrans d'identification.
 *
 * Trois partis pris.
 *
 * **Pas de carte.** Le formulaire est posé directement sur le fond. Les champs
 * sont blancs sur un fond gris clair : ils se détachent déjà tout seuls. Une
 * carte autour n'ajoutait qu'un cadre à un contenu qui n'en avait pas besoin —
 * et c'est justement ce qui donnait l'impression d'une boîte flottant dans le
 * vide sur grand écran.
 *
 * **Le logo est le chemin du retour.** Il ouvre l'accueil, comme sur n'importe
 * quel site. C'est pour ça qu'il n'y a plus de lien « Retour à l'accueil » en
 * bas : deux chemins pour la même chose, c'est un de trop.
 *
 * **Le lien de bascule est en haut à droite.** « Vous avez déjà un compte ? »
 * n'est pas une note de bas de page : c'est la deuxième chose qu'on cherche en
 * arrivant. En haut, il est visible sans défiler, y compris quand le clavier
 * du téléphone occupe la moitié de l'écran.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  aside,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Lien de bascule, en haut à droite — « Créer un compte », « Se connecter ». */
  aside?: ReactNode;
  /** Mention secondaire sous le formulaire (conditions d'utilisation…). */
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Logo />
        {aside}
      </header>

      {/* `justify-center` centre verticalement tant que ça tient ; au-delà, le
          contenu reprend le fil normal et la page défile. `pb` supérieur au
          `pt` pour compenser optiquement l'en-tête. */}
      <main className="flex flex-1 items-center justify-center px-5 pt-4 pb-20 sm:px-8">
        <div className="page-in w-full max-w-[23rem]">
          <div className="mb-7 flex flex-col gap-2">
            {/* Resserré et sans majuscule décorative : à cette taille, le
                tracking par défaut écarte trop les lettres (apple-design §15). */}
            <h1 className="font-display text-[1.75rem] leading-[1.15] sm:text-[2rem]">{title}</h1>
            {subtitle ? <p className="text-[0.9375rem] text-ink-500">{subtitle}</p> : null}
          </div>

          {children}

          {footer ? <div className="mt-7 text-sm text-ink-500">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

/** Lien de bascule de l'en-tête. Discret, mais toujours à la même place. */
export function AuthSwitch({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="pressable shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors duration-200 hover:bg-sunken hover:text-ink-900"
    >
      {children}
    </Link>
  );
}
