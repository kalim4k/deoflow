'use client';

// Parcours de création en deux temps, partagé par /create/image et
// /create/video :
//
//   1. sans `?model=` → on choisit un modèle (ModelPicker) ;
//   2. avec un `?model=` valide → l'atelier s'ouvre avec ce modèle.
//
// L'état vit dans l'URL, pas dans un `useState` : le lien est partageable, le
// retour arrière ramène au choix du modèle, et « Réutiliser ce prompt » depuis
// la galerie peut viser directement l'étape 2.
//
// Un slug inconnu, inactif, ou d'un autre type que la page ne déclenche pas
// d'erreur : on retombe sur la sélection, qui est toujours une suite valide.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { GenerationStudio } from '@/components/app/GenerationStudio';
import { ModelPicker } from '@/components/app/ModelPicker';
import { buttonStyles } from '@/components/ui/Button';
import { ImageIcon, VideoIcon } from '@/components/icons';
import { findModel } from '@/lib/deoflow/catalog';
import type { MediaKind } from '@/lib/deoflow/types';

const COPY = {
  image: {
    pickTitle: 'Choisir un modèle d’image',
    pickDescription: 'Chaque modèle a son style et son tarif. Sélectionnez-en un pour commencer.',
    studioDescription: 'Un prompt, un format. Le coût s’affiche avant de lancer.',
    otherHref: '/create/video',
    otherLabel: 'Passer à la vidéo',
    otherIcon: VideoIcon,
  },
  video: {
    pickTitle: 'Choisir un modèle vidéo',
    pickDescription: 'Les modèles vidéo facturent à la seconde. Sélectionnez-en un pour commencer.',
    studioDescription: 'Le coût suit la durée choisie : il se recalcule à chaque changement.',
    otherHref: '/create/image',
    otherLabel: 'Passer à l’image',
    otherIcon: ImageIcon,
  },
} as const;

export function CreateFlow({ kind }: { kind: MediaKind }) {
  const params = useSearchParams();
  const copy = COPY[kind];
  const OtherIcon = copy.otherIcon;

  const slug = params.get('model');
  const candidate = slug ? findModel(slug) : undefined;
  const model = candidate && candidate.kind === kind && candidate.active ? candidate : undefined;

  const actions = (
    <Link href={copy.otherHref} className={buttonStyles('secondary', 'md')}>
      <OtherIcon className="size-4" />
      {copy.otherLabel}
    </Link>
  );

  if (!model) {
    return (
      <AppShell title={copy.pickTitle} description={copy.pickDescription} actions={actions}>
        <ModelPicker kind={kind} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={kind === 'video' ? 'Générer une vidéo' : 'Générer une image'}
      description={copy.studioDescription}
      actions={actions}
    >
      {/* La clé force un état neuf à chaque changement de modèle : sans elle,
          un format ou une durée du modèle précédent survivrait au passage. */}
      <GenerationStudio key={model.slug} kind={kind} model={model} />
    </AppShell>
  );
}
