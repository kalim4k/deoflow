'use client';

import { AppLink } from '@/components/NavProgress';
import { Badge } from '@/components/ui/Feedback';
import { PlayIcon, SpinnerIcon } from '@/components/icons';
import { formatRelative } from '@/lib/format';
import type { ApiGeneration } from '@/lib/deoflow/api';
import { cn } from '@/lib/cn';

/**
 * Vignette d'une génération, partagée par le tableau de bord et la galerie.
 * La carte entière est le lien : sur mobile, viser une petite icône est
 * pénible, viser une image ne l'est pas.
 */
export function GenerationCard({
  generation,
  className,
}: {
  generation: ApiGeneration;
  className?: string;
}) {
  const running = generation.status === 'RUNNING' || generation.status === 'PENDING';
  const failed = generation.status === 'FAILED';
  const preview = generation.urls[0];

  return (
    <AppLink
      href={`/gallery/${generation.id}`}
      className={cn(
        'pressable group card card-link block cursor-pointer overflow-hidden p-0',
        className,
      )}
    >
      <div className="checkerboard relative aspect-[3/4] w-full overflow-hidden">
        {running ? (
          <span className="absolute inset-0 grid place-items-center text-ink-300">
            <SpinnerIcon className="size-6" />
          </span>
        ) : failed || !preview ? (
          // Un échec reste visible : le créateur doit voir que la tentative a
          // eu lieu et que ses crédits lui ont été rendus.
          <span className="absolute inset-0 grid place-items-center px-3 text-center text-xs text-ink-300">
            Génération échouée — crédits rendus
          </span>
        ) : (
          <>
            {generation.kind === 'video' ? (
              // `preload="metadata"` : la première image suffit à la vignette,
              // charger la vidéo entière brûlerait la 4G du créateur.
              <video
                src={preview}
                muted
                playsInline
                preload="metadata"
                className="size-full object-cover"
              />
            ) : (
              <img
                src={preview}
                alt={generation.prompt}
                loading="lazy"
                className="size-full object-cover"
              />
            )}
            {generation.kind === 'video' && (
              <span className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-ink-900/70 text-white">
                <PlayIcon className="size-4" />
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-sm text-ink-700">{generation.prompt}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{generation.modelName}</Badge>
          <span className="text-xs text-ink-300">{formatRelative(generation.createdAt)}</span>
        </div>
      </div>
    </AppLink>
  );
}
