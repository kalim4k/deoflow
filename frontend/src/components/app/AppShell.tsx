'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { CreditPill } from '@/components/app/CreditPill';
import { NotificationBell } from '@/components/app/NotificationBell';
import { PRIMARY_TABS, Sidebar, isNavActive } from '@/components/app/Sidebar';
import { AppLink, LinkIcon, PageTransition } from '@/components/NavProgress';
import { ShellSkeleton } from '@/components/app/ShellSkeleton';
import { MenuIcon } from '@/components/icons';
import { probeAdmin } from '@/lib/adminProbe';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/cn';

/** Le pli du rail est une préférence d'appareil, pas de compte. */
const COLLAPSE_KEY = 'deoflow:sidebar-collapsed';

/**
 * Coquille de toutes les pages connectées.
 *
 * Deux formes selon la place disponible :
 *   - ≥ lg : rail latéral permanent, aucun chrome en haut. Toute la navigation
 *     et le solde tiennent dans la colonne de gauche, la page garde sa hauteur
 *     entière pour le contenu.
 *   - < lg : le même rail devient un tiroir, ouvert depuis l'en-tête, doublé
 *     d'une barre d'onglets fixe en bas pour les quatre destinations les plus
 *     fréquentes — la cible est sur Android, au pouce.
 *
 * L'authentification est vérifiée ici, pas dans chaque page.
 */
export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  /**
   * `ReactNode` et non `string` : une fiche de détail ne connaît pas son titre
   * avant d'avoir chargé sa donnée, et doit pouvoir en réserver la hauteur avec
   * un squelette. Sans ça, le <h1> apparaît après coup et pousse toute la page.
   */
  title?: ReactNode;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Lu après le montage, jamais pendant le rendu serveur : lire localStorage
  // à l'initialisation ferait diverger le HTML hydraté.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Sonde mémorisée par utilisateur : sans le cache de `probeAdmin`, cet
    // aller-retour repartait à chaque navigation, l'AppShell étant remonté
    // par chaque page.
    void probeAdmin(user.id).then((admin) => {
      if (!cancelled) setIsAdmin(admin);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Une navigation ferme le tiroir : sans ça, il resterait ouvert par-dessus
  // la page qu'on vient de demander.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Tiroir ouvert : Échap le referme et le fond ne défile plus.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  // Session en cours de vérification : on peint la coquille tout de suite et
  // on grise ce qu'on ne sait pas encore, plutôt qu'un « Chargement… » centré
  // sur un écran vide. La géométrie est identique, donc rien ne saute quand
  // les données arrivent.
  if (loading || !user) return <ShellSkeleton />;

  return (
    <div
      className={cn(
        'min-h-screen lg:grid',
        collapsed ? 'lg:grid-cols-[4.75rem_1fr]' : 'lg:grid-cols-[16.5rem_1fr]',
      )}
    >
      {/* Rail permanent (≥ lg) */}
      <aside className="hidden border-r border-line bg-surface lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar isAdmin={isAdmin} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </div>
      </aside>

      {/* Tiroir (< lg) — même contenu, autre contenant. */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setMenuOpen(false)}
            className="drawer-veil absolute inset-0 cursor-pointer bg-ink-900/35"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            className="drawer-panel absolute inset-y-0 left-0 w-[16.5rem] max-w-[85%] border-r border-line bg-surface"
          >
            <Sidebar
              isAdmin={isAdmin}
              onNavigate={() => setMenuOpen(false)}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        {/* En-tête mobile : ouvrir le menu, revenir à l'accueil, lire le solde. */}
        <header className="chrome sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            className="pressable grid size-10 cursor-pointer place-items-center rounded-xl text-ink-700 hover:bg-sunken"
          >
            <MenuIcon className="size-5" />
          </button>
          <Logo href="/dashboard" />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <CreditPill />
          </div>
        </header>

        {/* Alerte solde bas (F21) : elle vit dans le rail, à côté du solde
            qu'elle concerne — pas en bandeau au-dessus du contenu, qui
            décalait la page entière et se répétait à chaque écran. */}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-12 lg:pb-16">
          <PageTransition routeKey={pathname}>
            {title ? (
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h1 className="font-display text-[1.75rem] sm:text-4xl">{title}</h1>
                  {description ? (
                    <p className="max-w-xl text-sm text-ink-500 sm:text-base">{description}</p>
                  ) : null}
                </div>
                {actions}
              </div>
            ) : null}
            {children}
          </PageTransition>
        </main>

        {/* Barre d'onglets mobile : la cible navigue au pouce sur Android. */}
        <nav
          aria-label="Accès rapide"
          className="chrome fixed inset-x-0 bottom-0 z-30 border-t border-line lg:hidden"
        >
          <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {PRIMARY_TABS.map((item) => {
              const active = isNavActive(pathname, item);
              return (
                <li key={item.href} className="flex-1">
                  <AppLink
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'pressable flex min-h-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[0.7rem]',
                      active ? 'text-ink-900' : 'text-ink-300',
                    )}
                  >
                    <LinkIcon
                      icon={item.icon}
                      className={cn('size-5', active && 'text-ember-500')}
                    />
                    <span className={cn(active && 'font-medium')}>{item.label}</span>
                  </AppLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
