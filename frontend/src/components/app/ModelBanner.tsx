'use client';

// Visuel d'identité d'un modèle.
//
// Attention à ce que ces images SONT : des visuels de marque — logo du
// fournisseur et nom du modèle sur un fond coloré. Ce ne sont pas des exemples
// de rendu. Elles servent donc à reconnaître un modèle d'un coup d'œil dans une
// grille, jamais à illustrer « voilà ce que ça produit ».
//
// Format 16:9 comme les fichiers sources : imposer un ratio différent les
// recadrerait en coupant le logo.

import { illustrationSrc } from '@/lib/deoflow/catalog';
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

  // Sans visuel fourni : un aplat neutre portant le nom du modèle, plutôt
  // qu'une image cassée.
  //
  // Ce repli servait auparavant un SVG « aperçu simulé ». Les six modèles du
  // catalogue ont tous leur visuel, donc la branche ne se déclenchait jamais —
  // elle attendait simplement qu'on ajoute un septième modèle pour estampiller
  // « simulé » sur une page de production. Un mot juste vaut mieux qu'une
  // branche morte qui ment le jour où elle s'exécute.
  if (!src) {
    return (
      <div
        className={cn(
          'flex aspect-[16/9] w-full items-center justify-center bg-sunken px-4 text-center',
          className,
        )}
      >
        <span className="font-display text-sm text-ink-500">{model.name}</span>
      </div>
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
