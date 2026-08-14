'use client';

// Squelette de la fiche d'un personnage.
//
// Deux usages, et c'est pour ça qu'il vit à part :
//   - `app/avatars/[id]/loading.tsx`, pendant que Next charge le code de la
//     route — ce qui rend la navigation instantanée au clic ;
//   - la page elle-même, pendant l'aller-retour vers `/api/avatars/[id]`.
//
// Enchaînés, les deux donnent un seul état continu : la fiche apparaît au clic
// et se remplit. Un « Chargement… » centré, lui, laissait l'écran vide puis
// faisait tout surgir d'un coup.
//
// Principe : ce qui est DÉJÀ SU est rendu pour de vrai — le lien de retour,
// les libellés de champs, la carte « Utiliser ce personnage » ne dépendent
// d'aucune donnée. Seul ce qui dépend de l'avatar est grisé. Griser aussi le
// connu ferait clignoter des éléments qui n'avaient aucune raison d'attendre.

import { AppLink } from '@/components/NavProgress';
import { AppShell } from '@/components/app/AppShell';
import { buttonStyles } from '@/components/ui/Button';
import { Card, Skeleton } from '@/components/ui/Feedback';
import { ArrowLeftIcon } from '@/components/icons';

export function AvatarDetailSkeleton() {
  return (
    // Le nom du personnage est justement ce qu'on ne connaît pas encore : on
    // réserve sa hauteur pour que le titre ne pousse pas la page en arrivant.
    <AppShell
      title={<Skeleton className="h-9 w-52 sm:h-11" />}
      description="Son visage et sa description."
    >
      <div className="flex flex-col gap-6" aria-busy="true">
        <AppLink
          href="/avatars"
          className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
        >
          <ArrowLeftIcon className="size-4" />
          Mes personnages
        </AppLink>

        {/* Mêmes proportions que la fiche : `1fr / 1.4fr`. Un squelette qui ne
            respecte pas la géométrie déplace tout à l'arrivée des données, et
            ne vaut alors pas mieux qu'un indicateur tournant. */}
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <Card className="flex flex-col gap-3">
            <Skeleton className="aspect-square w-full" />
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-36 rounded" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-11 w-full" />
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-700">Nom</span>
                <Skeleton className="h-12 w-full" />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-700">Description</span>
                {/* 6 lignes de texte, comme le `rows={6}` de la fiche. */}
                <Skeleton className="h-[10.5rem] w-full" />
                <span className="text-xs text-ink-500">
                  Jointe à chacune de vos générations. La modifier ne coûte rien et ne régénère pas
                  le visage.
                </span>
              </div>

              <Skeleton className="h-10 w-32" />
            </Card>

            {/* Entièrement statique : rien à attendre, donc rien à griser. */}
            <Card className="flex flex-col gap-3">
              <h2 className="font-display text-base">Utiliser ce personnage</h2>
              <p className="text-xs text-ink-500">
                Sélectionnez-le dans l’atelier : son visage et sa description partiront
                automatiquement avec votre description de scène.
              </p>
              <div className="flex flex-wrap gap-2">
                <AppLink href="/create/image" className={buttonStyles('ember', 'sm')}>
                  Générer une image
                </AppLink>
                <AppLink href="/create/video" className={buttonStyles('secondary', 'sm')}>
                  Générer une vidéo
                </AppLink>
              </div>
            </Card>

            {/* La suppression vise un avatar dont on n'a pas encore confirmé
                l'existence : on réserve sa place sans l'offrir. */}
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
