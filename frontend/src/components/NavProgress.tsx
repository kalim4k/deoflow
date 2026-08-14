'use client';

// Retour visuel pendant une navigation.
//
// Le problème qu'on corrige : sous l'App Router, un clic sur un lien ne
// produit rien à l'écran tant que la route suivante n'est pas prête. Sur une
// 4G lente — la cible de ce produit — ça se compte en secondes, et l'écran
// immobile se lit comme « le clic n'a pas marché ». L'utilisateur reclique.
//
// Next expose `useLinkStatus()`, qui donne l'état d'attente d'un lien depuis
// un composant rendu À L'INTÉRIEUR de ce lien. On s'en sert à deux niveaux :
//
//   - localement, le lien cliqué remplace son icône par un indicateur, donc
//     la réponse est immédiate et située là où le doigt a appuyé
//     (apple-design §1 : répondre à l'appui, pas à l'arrivée) ;
//   - globalement, chaque lien en attente s'annonce à un compteur partagé qui
//     pilote une barre de progression en haut de l'écran.
//
// Le compteur est un entier, pas un booléen : deux navigations peuvent se
// chevaucher (clic rapide sur deux liens), et un booléen éteindrait la barre
// dès que la première se résout.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react';
import Link, { useLinkStatus } from 'next/link';
import { SpinnerIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

type ReportFn = (delta: 1 | -1) => void;

const NavPendingContext = createContext<ReportFn>(() => {});

/** Signale au compteur global qu'un lien est en attente. Rend `null`. */
function PendingReporter() {
  const { pending } = useLinkStatus();
  const report = useContext(NavPendingContext);

  useEffect(() => {
    if (!pending) return;
    report(1);
    return () => report(-1);
  }, [pending, report]);

  return null;
}

/**
 * `<Link>` qui alimente la barre de progression. Utilisable partout où un
 * `<Link>` l'était : mêmes props, même rendu.
 */
export function AppLink({
  children,
  ...props
}: React.ComponentProps<typeof Link> & { children?: ReactNode }) {
  return (
    <Link {...props}>
      {children}
      <PendingReporter />
    </Link>
  );
}

/**
 * Icône d'un lien, remplacée par un indicateur tant que la navigation n'a pas
 * abouti. À rendre à l'intérieur d'un `<Link>` / `<AppLink>`.
 */
export function LinkIcon({
  icon: Icon,
  className,
}: {
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return pending ? <SpinnerIcon className={className} /> : <Icon className={className} />;
}

/** Barre fine en haut de l'écran, visible uniquement pendant une navigation. */
function ProgressBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Chargement de la page"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div className="route-bar h-full bg-ember-500" />
    </div>
  );
}

export function NavProgressProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);

  const report = useCallback<ReportFn>((delta) => {
    setPendingCount((n) => Math.max(0, n + delta));
  }, []);

  // `report` est stable, mais le contexte doit l'être aussi : sans ce memo,
  // chaque rendu du provider remonterait une nouvelle valeur et relancerait
  // l'effet de tous les rapporteurs.
  const value = useMemo(() => report, [report]);

  return (
    <NavPendingContext.Provider value={value}>
      <ProgressBar active={pendingCount > 0} />
      {children}
    </NavPendingContext.Provider>
  );
}

/**
 * Fondu d'arrivée du contenu, rejoué à chaque changement de route.
 * `key` sur la clé de route force un nouveau nœud, donc une nouvelle
 * animation — sans ça, React réutiliserait le même et rien ne bougerait.
 */
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  return (
    <div key={routeKey} className={cn('page-in')}>
      {children}
    </div>
  );
}
