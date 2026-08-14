'use client';

// Visuel d'identité d'un modèle.
//
// Attention à ce que ces images SONT : des visuels de marque — logo du
// fournisseur et nom du modèle sur un fond coloré. Ce ne sont pas des exemples
// de rendu. Elles servent donc à reconnaître un modèle d'un coup d'œil dans une
// grille, jamais à illustrer « voilà ce que ça produit ». Les aperçus de
// résultat restent générés localement et estampillés « aperçu simulé » tant
// qu'aucune API n'est branchée.
//
// Format 16:9 comme les fichiers sources : imposer un ratio différent les
// recadrerait en coupant le logo.

import { illustrationSrc } from '@/lib/deoflow/catalog';
import { previewDataUri } from '@/lib/deoflow/placeholder';
import type { AiModel } from '@/lib/deoflow/types';
import { cn } from '@/lib/cn';

export function ModelBanner({
  model,
  size = 'card',
  className,
}: {
  model: AiModel;
  size?: 'card' | 'full';
  className?: string;
}) {
  const src = illustrationSrc(model, size);

  // Sans visuel fourni, on retombe sur l'aperçu généré localement plutôt que
  // sur une image cassée.
  if (!src) {
    return (
      <img
        src={previewDataUri(`${model.slug}-sample-0`, model.kind, '16:9')}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className={cn('checkerboard aspect-[16/9] w-full object-cover', className)}
      />
    );
  }

  return (
    <img
      src={src}
      // Décoratif : le nom du modèle est écrit juste en dessous en texte, et
      // il figure déjà dans l'image. Le répéter ferait doublon à l'écoute.
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      width={size === 'full' ? 1400 : 640}
      height={size === 'full' ? 788 : 360}
      className={cn('aspect-[16/9] w-full bg-sunken object-cover', className)}
    />
  );
}
