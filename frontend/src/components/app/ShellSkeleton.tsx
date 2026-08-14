'use client';

// Squelette affiché pendant que la session se vérifie.
//
// Il reprend la géométrie exacte de l'AppShell : même largeur de rail, mêmes
// marges, même hauteur de titre. L'intérêt n'est pas décoratif — c'est que
// rien ne bouge au moment où le vrai contenu prend la place du squelette. Un
// écran qui se réorganise à l'arrivée des données se lit comme un bug, même
// quand il est plus rapide.
//
// Ce qui est certain est peint tout de suite (le logo, la structure) ; seul ce
// qu'on ne connaît pas encore est grisé.

import { Logo } from '@/components/Logo';
import { Skeleton } from '@/components/ui/Feedback';

/** Une ligne de navigation grisée : pastille d'icône + libellé. */
function NavLineSkeleton({ width }: { width: string }) {
  return (
    <div className="flex min-h-10 items-center gap-3 px-3">
      <Skeleton className="size-4.5 shrink-0 rounded-md" />
      <Skeleton className={`h-3.5 rounded-md ${width}`} />
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_1fr]" aria-hidden="true">
      <aside className="hidden border-r border-line bg-surface lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-6 px-4 py-5">
          <Logo href="/dashboard" />

          <div className="flex flex-1 flex-col gap-5">
            <div className="flex flex-col gap-0.5">
              <NavLineSkeleton width="w-28" />
            </div>
            <div className="flex flex-col gap-0.5">
              <Skeleton className="mb-1.5 ml-3 h-3 w-12 rounded" />
              <NavLineSkeleton width="w-16" />
              <NavLineSkeleton width="w-14" />
            </div>
            <div className="flex flex-col gap-0.5">
              <Skeleton className="mb-1.5 ml-3 h-3 w-16 rounded" />
              <NavLineSkeleton width="w-20" />
              <NavLineSkeleton width="w-18" />
            </div>
          </div>

          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 lg:hidden">
          <Skeleton className="size-10 rounded-xl" />
          <Logo href="/dashboard" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-12 lg:pb-16">
          <div className="mb-7 flex flex-col gap-2.5">
            <Skeleton className="h-9 w-64 max-w-full rounded-lg" />
            <Skeleton className="h-4 w-80 max-w-full rounded" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </main>
      </div>

      {/* Le mot compte : sans lui, un lecteur d'écran n'annonce rien du tout
          pendant que l'écran se remplit. */}
      <span className="sr-only" role="status" aria-live="polite">
        Chargement de votre espace…
      </span>
    </div>
  );
}
